/**
 * LLM auth detection — shared server-side module.
 *
 * Detects which APIs are authorized for OLYMPUS from OpenCode's own stores
 * (auth.json / opencode.jsonc), the legacy ~/.olympus/.env, and the legacy
 * llm-providers.json. Used by:
 *
 *   - /api/olympus/auth/status  (detailed status + recommendations)
 *   - /api/olympus/providers/gods  (strategy-activation gate: a strategy is
 *     blocked until the API it needs is authorized)
 *
 * This module reads the filesystem — it is SERVER-ONLY. Do not import it
 * from client components. Client code should use the boolean `auth` map the
 * providers API returns, plus `strategyApiRequirement()` from
 * model-strategies.ts (pure).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const OLYMPUS_HOME = join(homedir(), '.olympus');

// OpenCode 1.18+ stores auth at ~/.local/share/opencode/auth.json
// (not ~/.config/opencode/auth.json which is the older path).
// We check both for backward compatibility.
const OPENCODE_CONFIG_DIRS = [
  join(homedir(), '.local', 'share', 'opencode'),
  join(homedir(), '.config', 'opencode'),
];
const OPENCODE_JSONC_FILE = join(homedir(), '.config', 'opencode', 'opencode.jsonc');
const OLYMPUS_DOT_ENV = join(OLYMPUS_HOME, '.env');
const LLM_PROVIDERS_FILE = join(OLYMPUS_HOME, 'llm-providers.json');

export interface GoPlanAuth {
  configured: boolean;
  source: 'auth.json' | 'opencode.jsonc' | null;
  providers: string[]; // e.g., ['opencode-go'] if from auth.json
  detail: string;
}

export interface ZenPlanAuth {
  configured: boolean;
  source: 'auth.json' | 'env' | null;
  detail: string;
}

export interface FreeTierAuth {
  groq_key: boolean;
  openrouter_key: boolean;
  nvidia_key: boolean;
  both_keys: boolean; // true only if BOTH are set (required for mixed strategy)
  source: 'auth.json' | 'env' | 'llm-providers.json' | 'api-configs.json' | null;
  /** Per-provider authorization source — where each key was found (highest-priority store wins). */
  sources: {
    groq: 'auth.json' | 'env' | 'llm-providers.json' | null;
    openrouter: 'auth.json' | 'env' | 'llm-providers.json' | null;
    nvidia: 'auth.json' | 'env' | 'llm-providers.json' | null;
  };
  detail: string;
}

/**
 * Check if OpenCode GO plan is authorized.
 *
 * OpenCode 1.18+ stores auth at ~/.local/share/opencode/auth.json with
 * the following format:
 *   { "opencode-go": { "type": "api", "key": "sk-..." } }
 *
 * Older versions stored at ~/.config/opencode/auth.json with:
 *   { "opencode-go": "sk-..." }
 *
 * We also check ~/.config/opencode/opencode.jsonc for manual config.
 * Either counts as "GO plan configured".
 *
 * IMPORTANT: only the `opencode-go` provider counts as GO. A Zen key
 * (stored under `opencode`) or free-tier keys (groq/openrouter) must NOT
 * be misdetected as a GO plan — that used to happen because the check
 * accepted ANY provider with a key.
 */
export function checkGoPlanAuth(): GoPlanAuth {
  // Check auth.json in both possible locations
  for (const dir of OPENCODE_CONFIG_DIRS) {
    const authFile = join(dir, 'auth.json');
    if (existsSync(authFile)) {
      try {
        const raw = readFileSync(authFile, 'utf-8');
        const auth = JSON.parse(raw);
        // auth.json has provider keys like "opencode-go", "opencode" (Zen),
        // "openrouter", "groq", etc. Values can be either a plain string
        // (older format) or an object with { type, key } (newer format).
        const providers = Object.keys(auth).filter(k => {
          const v = auth[k];
          if (typeof v === 'string' && v.length > 0) return true;
          if (typeof v === 'object' && v !== null) {
            // New format: { type: 'api', key: 'sk-...' }
            if (typeof v.key === 'string' && v.key.length > 0) return true;
            if (typeof v.apiKey === 'string' && v.apiKey.length > 0) return true;
            if (typeof v.token === 'string' && v.token.length > 0) return true;
          }
          return false;
        });
        // ONLY `opencode-go` means a GO plan. Zen lives under `opencode`,
        // free keys under `groq`/`openrouter` — neither is a GO plan.
        if (providers.includes('opencode-go')) {
          return {
            configured: true,
            source: 'auth.json',
            providers,
            detail: `GO plan authorized via OpenCode TUI (${providers.length} provider(s): ${providers.join(', ')})`,
          };
        }
      } catch {}
    }
  }

  // Check opencode.jsonc (manual config)
  if (existsSync(OPENCODE_JSONC_FILE)) {
    try {
      const raw = readFileSync(OPENCODE_JSONC_FILE, 'utf-8').trim();
      if (raw.length > 0) {
        const parsed = JSON.parse(raw);
        const keys = Object.keys(parsed).filter(k => k !== '$schema');
        if (keys.length > 0) {
          return {
            configured: true,
            source: 'opencode.jsonc',
            providers: ['manual-config'],
            detail: `OpenCode configured via ~/.config/opencode/opencode.jsonc (keys: ${keys.join(', ')})`,
          };
        }
      }
    } catch {}
  }

  return {
    configured: false,
    source: null,
    providers: [],
    detail: 'GO plan not authorized. Run `olympus opencode` in a terminal to sign in, or use free-tier keys.',
  };
}

/**
 * Check if OpenCode Zen (pay-as-you-go) is authorized.
 *
 * Zen keys are stored in OpenCode's own auth.json under the `opencode`
 * provider (the model prefix is opencode/<model-id>):
 *   { "opencode": { "type": "api", "key": "sk-..." } }
 *
 * The OPENCODE_API_KEY env var is also honored (opencode reads it directly).
 */
export function checkZenPlanAuth(): ZenPlanAuth {
  for (const dir of OPENCODE_CONFIG_DIRS) {
    const authFile = join(dir, 'auth.json');
    if (existsSync(authFile)) {
      try {
        const auth = JSON.parse(readFileSync(authFile, 'utf-8'));
        const v = auth.opencode;
        const hasKey =
          (typeof v === 'string' && v.length > 0) ||
          (typeof v === 'object' && v !== null && (
            (typeof v.key === 'string' && v.key.length > 0) ||
            (typeof v.apiKey === 'string' && v.apiKey.length > 0) ||
            (typeof v.token === 'string' && v.token.length > 0)
          ));
        if (hasKey) {
          return {
            configured: true,
            source: 'auth.json',
            detail: 'OpenCode Zen authorized via OpenCode TUI (`/connect` → OpenCode Zen). Pay-as-you-go — no request caps.',
          };
        }
      } catch {}
    }
  }
  if (typeof process.env.OPENCODE_API_KEY === 'string' && process.env.OPENCODE_API_KEY.length > 0) {
    return {
      configured: true,
      source: 'env',
      detail: 'OpenCode Zen authorized via OPENCODE_API_KEY env var. Pay-as-you-go — no request caps.',
    };
  }
  return {
    configured: false,
    source: null,
    detail: 'OpenCode Zen not authorized. Run `olympus opencode`, then `/connect` and select OpenCode Zen.',
  };
}

/**
 * Check if free-tier API keys (Groq, OpenRouter, NVIDIA Build) are configured,
 * tracking which store each key was authorized in.
 *
 * Keys can be configured via:
 *   1. OpenCode's own TUI (`olympus opencode` → Settings → add providers)
 *      Stored in ~/.local/share/opencode/auth.json (recommended)
 *   2. ~/.olympus/.env (legacy)
 *   3. ~/.olympus/llm-providers.json (legacy)
 */
export function checkFreeTierKeys(): FreeTierAuth {
  let groq = false;
  let openrouter = false;
  let nvidia = false;
  let groqSource: FreeTierAuth['sources']['groq'] = null;
  let openrouterSource: FreeTierAuth['sources']['openrouter'] = null;
  let nvidiaSource: FreeTierAuth['sources']['nvidia'] = null;
  let source: FreeTierAuth['source'] = null;

  // Helper to check for a valid key value in various formats
  function hasKey(val: any): boolean {
    if (!val) return false;
    if (typeof val === 'string' && val.length > 0) return true;
    if (typeof val === 'object') {
      if (typeof val.key === 'string' && val.key.length > 0) return true;
      if (typeof val.apiKey === 'string' && val.apiKey.length > 0) return true;
      if (typeof val.token === 'string' && val.token.length > 0) return true;
    }
    return false;
  }

  // Priority 1: OpenCode's auth.json (recommended — configured via TUI)
  for (const dir of OPENCODE_CONFIG_DIRS) {
    const authFile = join(dir, 'auth.json');
    if (existsSync(authFile)) {
      try {
        const auth = JSON.parse(readFileSync(authFile, 'utf-8'));
        if (hasKey(auth.groq)) { groq = true; groqSource ??= 'auth.json'; }
        if (hasKey(auth.openrouter)) { openrouter = true; openrouterSource ??= 'auth.json'; }
        if (hasKey(auth.nvidia)) { nvidia = true; nvidiaSource ??= 'auth.json'; }
      } catch {}
    }
  }

  // Priority 2: ~/.olympus/.env (legacy)
  if (existsSync(OLYMPUS_DOT_ENV)) {
    try {
      const content = readFileSync(OLYMPUS_DOT_ENV, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (trimmed.startsWith('OLYMPUS_GROQ_KEY=')) {
          const val = trimmed.slice('OLYMPUS_GROQ_KEY='.length).trim().replace(/^["']|["']$/g, '');
          if (val && val.length > 0) { groq = true; groqSource ??= 'env'; }
        }
        if (trimmed.startsWith('OLYMPUS_OPENROUTER_KEY=')) {
          const val = trimmed.slice('OLYMPUS_OPENROUTER_KEY='.length).trim().replace(/^["']|["']$/g, '');
          if (val && val.length > 0) { openrouter = true; openrouterSource ??= 'env'; }
        }
        if (trimmed.startsWith('OLYMPUS_NVIDIA_KEY=')) {
          const val = trimmed.slice('OLYMPUS_NVIDIA_KEY='.length).trim().replace(/^["']|["']$/g, '');
          if (val && val.length > 0) { nvidia = true; nvidiaSource ??= 'env'; }
        }
      }
    } catch {}
  }

  // Priority 3: ~/.olympus/llm-providers.json (legacy)
  if (existsSync(LLM_PROVIDERS_FILE)) {
    try {
      const cfg = JSON.parse(readFileSync(LLM_PROVIDERS_FILE, 'utf-8'));
      if (cfg.groq_key && typeof cfg.groq_key === 'string' && cfg.groq_key.length > 0) {
        groq = true; groqSource ??= 'llm-providers.json';
      }
      if (cfg.openrouter_key && typeof cfg.openrouter_key === 'string' && cfg.openrouter_key.length > 0) {
        openrouter = true; openrouterSource ??= 'llm-providers.json';
      }
      if (cfg.nvidia_key && typeof cfg.nvidia_key === 'string' && cfg.nvidia_key.length > 0) {
        nvidia = true; nvidiaSource ??= 'llm-providers.json';
      }
    } catch {}
  }

  const both = groq && openrouter;
  const keys: string[] = [];
  if (groq) keys.push('Groq');
  if (openrouter) keys.push('OpenRouter');
  if (nvidia) keys.push('NVIDIA Build');

  // Highest-priority store that authorized any key (auth.json > .env > legacy file).
  source = groqSource ?? openrouterSource ?? nvidiaSource;

  return {
    groq_key: groq,
    openrouter_key: openrouter,
    nvidia_key: nvidia,
    both_keys: both,
    source,
    sources: {
      groq: groqSource,
      openrouter: openrouterSource,
      nvidia: nvidiaSource,
    },
    detail: keys.length === 0
      ? 'No free-tier keys configured.'
      : both
        ? `Free-tier keys configured (${keys.join(' + ')}) — provider-specific free strategies available (free-openrouter, free-big-pickle, free-nvidia-build).`
        : `Only ${keys.join(' + ')} configured. Add another free-tier provider key to unlock more free strategy options.`,
  };
}

/**
 * Compact boolean map of which APIs are authorized right now. This is the
 * shape the providers API returns to client components (which cannot import
 * this server-only module) for the strategy-activation gate.
 */
export interface LlmAuth {
  go: boolean;
  zen: boolean;
  groq: boolean;
  openrouter: boolean;
  nvidia: boolean;
}

export function checkLlmAuth(): LlmAuth {
  const go = checkGoPlanAuth();
  const zen = checkZenPlanAuth();
  const free = checkFreeTierKeys();
  return {
    go: go.configured,
    zen: zen.configured,
    groq: free.groq_key,
    openrouter: free.openrouter_key,
    nvidia: free.nvidia_key,
  };
}
