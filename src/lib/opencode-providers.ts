/**
 * opencode-providers.ts — which providers this machine has authorized.
 *
 * v0.0.24 (the Builder's registered-only default + the custom-strategy
 * validation). One source of truth for:
 *   - /api/olympus/models  → `registered` per model;
 *   - /api/olympus/strategy/custom → refuse an unregistered provider before
 *     the apply writes a dead lane.
 *
 * auth.json is OpenCode's /connect store. Provider blocks in the global and
 * project config also count (local endpoints live only there). The nvidia-*
 * families roll up to `nvidia`.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const AUTH_FILE = path.join(
  process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
  'opencode',
  'auth.json',
);
const GLOBAL_CONFIG = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');

function readJson(p: string): any | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

const ENV_KEYS: Record<string, string[]> = {
  openrouter: ['OPENROUTER_API_KEY'],
  nvidia: ['NVIDIA_API_KEY', 'NVAPI_KEY'],
  groq: ['GROQ_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
  opencode: ['OPENCODE_API_KEY'],
  'opencode-go': ['OPENCODE_GO_API_KEY'],
  ollama: ['OLLAMA_HOST'],
  lmstudio: ['LM_STUDIO_HOST'],
  vllm: ['VLLM_HOST'],
};

export function registeredProviders(projectRoot = process.cwd()): Set<string> {
  const set = new Set<string>();
  const auth = readJson(AUTH_FILE);
  if (auth && typeof auth === 'object') {
    for (const [k, v] of Object.entries(auth)) {
      if (!v) continue;
      set.add(k);
      if (k.startsWith('nvidia-')) set.add('nvidia');
    }
  }
  for (const cfgPath of [GLOBAL_CONFIG, path.join(projectRoot, 'opencode.json')]) {
    const cfg = readJson(cfgPath);
    if (!cfg?.provider || typeof cfg.provider !== 'object') continue;
    for (const k of Object.keys(cfg.provider)) {
      set.add(k);
      if (k.startsWith('nvidia-')) set.add('nvidia');
    }
  }
  for (const [provider, keys] of Object.entries(ENV_KEYS)) {
    if (keys.some((k) => Boolean(process.env[k]))) set.add(provider);
  }
  return set;
}

/** The provider of a model id: the part before the first `/`. */
export function providerOf(modelId: string): string {
  return modelId.split('/')[0] ?? modelId;
}

/** The registration key for a provider (nvidia-* rolls up to nvidia). */
export function registrationKey(provider: string): string {
  return provider.startsWith('nvidia-') ? 'nvidia' : provider;
}

export function isProviderRegistered(modelId: string, registered: Set<string>): boolean {
  const key = registrationKey(providerOf(modelId));
  return registered.has(key);
}
