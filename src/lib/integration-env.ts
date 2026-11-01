/**
 * integration-env.ts — ONE env loader for every process OLYMPUS spawns.
 *
 * THE SPECIMEN (2026-10-31, AIME): the API Keys dialog wrote
 * `~/.olympus/api-configs.json`, the UI showed "API key configured", and the
 * originkit MCP still returned 401. The Electron terminal loader read the
 * JSON file; the Next.js `buildOpencodeEnv` (which spawns `opencode run`,
 * `opencode serve` and every hop) did not. The key existed in the UI and in
 * the Electron terminal, but never in the process that needed it.
 *
 * This module is the single source of truth for integration keys:
 *   1. `~/.olympus/.env`            (machine-local exports)
 *   2. `<root>/.env`                (project-local exports)
 *   3. `~/.olympus/api-configs.json` (the UI-managed store)
 *   4. `process.env`                (shell exports — highest priority)
 *
 * `enc:` values are decrypted with the existing env-crypto key. A value that
 * cannot be decrypted is skipped (never emitted as ciphertext).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decryptValue } from './env-crypto';

export type IntegrationEnv = Record<string, string>;

const API_CONFIGS_FILE = 'api-configs.json';

/** Parse a KEY=VALUE .env file. Comments and blank lines are ignored. */
export function parseEnvFile(content: string): IntegrationEnv {
  const out: IntegrationEnv = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!key || !raw) continue;
    const decoded = decryptValue(raw);
    if (decoded !== null) out[key] = decoded;
  }
  return out;
}

/** Parse the UI-managed JSON store. Only string values are keys. */
export function parseApiConfigs(content: string): IntegrationEnv {
  const out: IntegrationEnv = {};
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const decoded = decryptValue(value);
      if (decoded !== null) out[key] = decoded;
    }
  } catch { /* a corrupt store is not a crash */ }
  return out;
}

/**
 * Load the merged integration env. Precedence: process.env > api-configs >
 * project .env > machine .env. The UI store wins over files because the UI is
 * the surface the user just edited; a shell export still wins over everything.
 */
export function loadIntegrationEnv(opts: {
  home?: string;
  root?: string;
  processEnv?: Record<string, string | undefined>;
} = {}): IntegrationEnv {
  const home = opts.home ?? os.homedir();
  const root = opts.root ?? process.cwd();
  const processEnv = opts.processEnv ?? process.env;

  const merged: IntegrationEnv = {};

  const readEnvFile = (file: string) => {
    try {
      if (!fs.existsSync(file)) return;
      Object.assign(merged, parseEnvFile(fs.readFileSync(file, 'utf-8')));
    } catch { /* best-effort */ }
  };

  readEnvFile(path.join(home, '.olympus', '.env'));
  readEnvFile(path.join(root, '.env'));

  try {
    const file = path.join(home, '.olympus', API_CONFIGS_FILE);
    if (fs.existsSync(file)) {
      Object.assign(merged, parseApiConfigs(fs.readFileSync(file, 'utf-8')));
    }
  } catch { /* best-effort */ }

  for (const [key, value] of Object.entries(processEnv)) {
    if (typeof value === 'string' && value.length > 0) merged[key] = value;
  }

  return merged;
}

/**
 * Merge the integration env into a base env without overwriting an explicit
 * caller value. `extraEnv` (the caller's intent) always wins.
 */
export function mergeIntegrationEnv(
  base: NodeJS.ProcessEnv,
  opts: { home?: string; root?: string; extraEnv?: Record<string, string> } = {},
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...base, ...loadIntegrationEnv({ home: opts.home, root: opts.root }) };
  // process.env is already in `base`; the loader's process.env pass keeps it.
  if (opts.extraEnv) Object.assign(merged, opts.extraEnv);
  return merged;
}
