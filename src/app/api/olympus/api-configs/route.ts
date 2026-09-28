/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIGS_FILE = path.join(os.homedir(), '.olympus', 'api-configs.json');

/**
 * LLM provider env keys that Olympus manages directly.
 *
 * OpenCode GO is the only LLM provider. Other LLM providers are configured
 * by the user directly in OpenCode config (~/.config/opencode/opencode.json).
 */
const ALLOWED_LLM_KEYS = new Set([
  'OPENCODE_GO_API_KEY',
]);

/**
 * MCP integration env keys for shipped MCPs that require API keys.
 *
 * Mirrors the MCP_API_REQUIREMENTS map in @/lib/mcp-api-requirements.ts.
 * Only shipped MCPs are listed here — users can configure env vars for
 * third-party MCPs via shell exports or .env files directly.
 */
const ALLOWED_MCP_KEYS = new Set([
  'GITHUB_PERSONAL_ACCESS_TOKEN',
  'GRAFANA_URL',
  'GRAFANA_API_KEY',
  'FIGMA_API_KEY',
]);

/**
 * Legacy LLM env keys that were previously managed by OLYMPUS.
 * POSTs with non-empty string values for these keys are rejected with a
 * clear error. They can be cleared by sending an empty string.
 *
 * OLYMPUS only manages the OpenCode GO key (OPENCODE_GO_API_KEY).
 * OpenRouter / Groq / NVIDIA Build / Zen keys are configured inside
 * OpenCode's own auth (Settings → add providers).
 */
const LEGACY_LLM_KEYS = new Set([
  'OPENCODE_ZEN_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
  'TOGETHER_API_KEY',
  'HF_API_KEY',
  'GOOGLE_AI_API_KEY',
]);

const ALLOWED_ALL = new Set([...ALLOWED_LLM_KEYS, ...ALLOWED_MCP_KEYS]);

function ensureDir() {
  const dir = path.dirname(CONFIGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Load a .env file and return its KEY=VALUE pairs.
 * - Ignores blank lines and lines starting with `#`.
 * - Strips surrounding quotes from values.
 * - Returns {} if the file doesn't exist or can't be parsed.
 */
function loadEnvFile(filePath: string): Record<string, string> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const text = fs.readFileSync(filePath, 'utf-8');
    const out: Record<string, string> = {};
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch { return {}; }
}

/**
 * Load ALL API configs from every source, merged in priority order
 * (later sources win):
 *   1. ~/.olympus/api-configs.json (UI-managed)
 *   2. ~/.olympus/.env (machine-local)
 *   3. <project-root>/.env (project-local)
 *   4. process.env (shell exports — highest priority)
 *
 * Only ALLOWED_ALL keys are returned (so we don't leak unrelated env vars
 * like PATH or HOME to the UI).
 */
function loadConfigs(): Record<string, string> {
  ensureDir();
  const merged: Record<string, string> = {};

  // Layer 1: ~/.olympus/api-configs.json (UI-managed)
  try {
    if (fs.existsSync(CONFIGS_FILE)) {
      const fileConfigs = JSON.parse(fs.readFileSync(CONFIGS_FILE, 'utf-8'));
      if (fileConfigs && typeof fileConfigs === 'object') {
        for (const [k, v] of Object.entries(fileConfigs)) {
          if (ALLOWED_ALL.has(k) && typeof v === 'string' && v.trim()) {
            merged[k] = v;
          }
        }
      }
    }
  } catch {}

  // Layer 2: ~/.olympus/.env (machine-local)
  const homeEnv = path.join(os.homedir(), '.olympus', '.env');
  for (const [k, v] of Object.entries(loadEnvFile(homeEnv))) {
    if (ALLOWED_ALL.has(k) && v.trim()) merged[k] = v;
  }

  // Layer 3: <project-root>/.env (project-local)
  let projectRoot = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(projectRoot, 'opencode.json'))) break;
    const parent = path.dirname(projectRoot);
    if (parent === projectRoot) break;
    projectRoot = parent;
  }
  const projectEnv = path.join(projectRoot, '.env');
  for (const [k, v] of Object.entries(loadEnvFile(projectEnv))) {
    if (ALLOWED_ALL.has(k) && v.trim()) merged[k] = v;
  }

  // Layer 4: process.env (shell exports — highest priority)
  for (const k of ALLOWED_ALL) {
    const v = process.env[k];
    if (typeof v === 'string' && v.trim()) merged[k] = v;
  }

  return merged;
}

function saveConfigs(configs: Record<string, string>) {
  ensureDir();
  fs.writeFileSync(CONFIGS_FILE, JSON.stringify(configs, null, 2), { mode: 0o600 });
}

/**
 * Load ONLY from ~/.olympus/api-configs.json (NOT from .env or process.env).
 * Used by the POST handler so we don't accidentally write .env/process.env
 * keys into the JSON file when saving.
 */
function loadConfigsFromFile(): Record<string, string> {
  ensureDir();
  try {
    if (!fs.existsSync(CONFIGS_FILE)) return {};
    const fileConfigs = JSON.parse(fs.readFileSync(CONFIGS_FILE, 'utf-8'));
    if (!fileConfigs || typeof fileConfigs !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(fileConfigs)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch { return {}; }
}

// GET /api/olympus/api-configs - load all API configs
//
// Returns the ACTUAL key values (not just masked booleans). The dialog
// uses type="password" (masked by default) with an eye toggle that reveals
// the value. Since the server binds to 127.0.0.1, returning raw values is
// safe — only the local machine can reach this endpoint.
//
// Merges from ALL sources (JSON file + .env files + process.env) so the
// UI shows keys as "configured" even when running via `npm run dev`.
export async function GET() {
  const configs = loadConfigs();
  return NextResponse.json({ configs });
}

// POST /api/olympus/api-configs - save all API configs
//
// Accepts:
//   - OPENCODE_GO_API_KEY
//   - MCP integration keys for shipped MCPs (see ALLOWED_MCP_KEYS)
//
// Rejects (with HTTP 400 + clear error):
//   - Legacy LLM keys (OPENCODE_ZEN_API_KEY, OPENAI_API_KEY, etc.)
//     submitted with a non-empty string value.
//   - Unknown env keys (not in ALLOWED_LLM_KEYS or ALLOWED_MCP_KEYS).
//
// Non-string values are silently dropped.
//
// Only reads/writes the JSON file (~/.olympus/api-configs.json), not .env
// or process.env. Keys from shell exports are still shown as "configured"
// in GET but are not persisted by POST.
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Reject non-empty legacy LLM keys with a helpful error.
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(body || {})) {
    const isNonEmptyString = typeof value === 'string' && value.trim().length > 0;

    if (isNonEmptyString && LEGACY_LLM_KEYS.has(key)) {
      rejected.push(
        `${key} — Olympus no longer manages this LLM provider. Configure it directly in ~/.config/opencode/opencode.json instead. To CLEAR the stored key, POST it with an empty string.`,
      );
    } else if (isNonEmptyString && !ALLOWED_ALL.has(key) && !LEGACY_LLM_KEYS.has(key)) {
      rejected.push(
        `${key} — unknown env key. OLYMPUS only accepts OPENCODE_GO_API_KEY and the documented MCP integration keys.`,
      );
    }
  }

  if (rejected.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Rejected env keys (only OPENCODE_GO_API_KEY is managed by OLYMPUS)',
        rejected,
      },
      { status: 400 },
    );
  }

  // Only merge with the JSON FILE's existing keys (not .env/process.env).
  const existing = loadConfigsFromFile();
  const updated = { ...existing };
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string' && value.trim()) {
      updated[key] = value.trim();
    } else if (typeof value === 'string' && value === '') {
      // Allow clearing a key by sending empty string.
      delete updated[key];
    }
    // Non-string values are silently dropped.
  }
  saveConfigs(updated);

  // Return the MERGED count (from all sources) so the UI's
  // status bar updates correctly even if some keys come from .env.
  const allConfigs = loadConfigs();
  return NextResponse.json({ success: true, count: Object.keys(allConfigs).length });
}
