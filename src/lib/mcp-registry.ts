/**
 * mcp-registry.ts — THE MERGED MCP TRUTH (v0.0.24).
 *
 * Two files coexist by design:
 *   - `.mcp.json` — the human catalog (descriptions + legacy entries);
 *   - `opencode.json → mcp` — the runtime truth OpenCode actually reads.
 *
 * v0.0.24 fixes the old merge:
 *   - DEDUPE by name (the panel showed 50 servers for 28 real ones);
 *   - NORMALIZE every entry to the canonical OpenCode shape (`type`, one
 *     `command` array, `environment`, numeric `timeout`);
 *   - the runtime `enabled` flag is authoritative for entries that exist in
 *     opencode.json (the stale mcp-state.json no longer overrides it);
 *   - every entry carries its honest `requires` metadata, so the panel can
 *     say WHY a server is off instead of showing an unexplained red dot.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';
import { findMcpRequirement, getMcpEnvVarKeys, findMcpServerRequirement } from './mcp-api-requirements';
import { findOlympusRoot } from './opencode-spawn';
import {
  normalizeMcpEntry,
  toRuntimeConfig,
  stableJson,
  type McpCanonicalConfig,
  type McpCanonicalEntry,
  type McpServerRequirement,
} from './mcp-shape';

export type { McpCanonicalEntry, McpCanonicalConfig, McpServerRequirement };

/**
 * The curated default (v0.0.24): the measured six that fit the 128-tool
 * provider budget with room to spare (44 tools). "Reset to curated" restores
 * exactly this set — the one-click cure for an all-on arsenal.
 */
export const CURATED_MCP_SERVERS = [
  'filesystem',
  'memory',
  'git',
  'context7',
  'sequential-thinking',
  'olympus-craft',
] as const;

/**
 * Resolve the repo root (v0.0.25).
 *
 * Order: the env root IF it holds opencode.json → the shared resolver (which
 * normalizes `.next/standalone` back to the repo) → the module-relative tree
 * IF it holds opencode.json → cwd. The old version trusted the env blindly and
 * fell back to a bundled-chunk path, which is how a standalone run read a
 * build-time copy (or nothing) instead of the project.
 */
function olympusRoot(): string {
  const hasConfig = (dir: string) => {
    try { return fs.existsSync(path.join(dir, 'opencode.json')); } catch { return false; }
  };
  const env = process.env.OLYMPUS_ROOT;
  if (env && hasConfig(env)) return env;
  try {
    const found = findOlympusRoot();
    if (hasConfig(found)) return found;
  } catch { /* fall through */ }
  try {
    const rel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    if (hasConfig(rel)) return rel;
  } catch { /* fall through */ }
  return process.cwd();
}

export interface ListMcpServersOpts {
  olympusRoot?: string;
  mcpJsonPath?: string;
  opencodeJsonPath?: string;
  /** The mcp-state.json path (catalog-only entries honor it). */
  stateFile?: string;
}

export interface McpRegistryEntry extends McpCanonicalEntry {
  /** The raw runtime entry exists in opencode.json. */
  runtime: boolean;
  /** The catalog entry exists in .mcp.json. */
  catalog: boolean;
  /** Compatibility: the runtime `enabled` default for opencode-native entries. */
  opencodeEnabled?: boolean;
}

function readJson(p: string): any | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function readEnabledState(stateFile: string): Record<string, boolean> {
  const data = readJson(stateFile);
  if (!data) return {};
  return (data.enabled && typeof data.enabled === 'object') ? data.enabled : data;
}

/**
 * The merged registry. Fixture-friendly: every path is overridable.
 */
export function listMcpServers(opts: ListMcpServersOpts = {}): { servers: McpRegistryEntry[] } {
  const root = opts.olympusRoot ?? olympusRoot();
  const mcpJsonPath = opts.mcpJsonPath ?? path.join(root, '.mcp.json');
  const opencodeJsonPath = opts.opencodeJsonPath ?? path.join(root, 'opencode.json');
  const stateFile = opts.stateFile ?? path.join(os.homedir(), '.olympus', 'mcp-state.json');

  const catalogCfg = readJson(mcpJsonPath);
  const catalog: Record<string, any> = catalogCfg?.mcpServers || catalogCfg?.servers || {};
  const runtimeCfg = readJson(opencodeJsonPath);
  const runtime: Record<string, any> = (runtimeCfg?.mcp && typeof runtimeCfg.mcp === 'object') ? runtimeCfg.mcp : {};
  const state = readEnabledState(stateFile);

  const names: string[] = [];
  for (const n of Object.keys(catalog)) if (!names.includes(n)) names.push(n);
  for (const n of Object.keys(runtime)) if (!names.includes(n)) names.push(n);

  const servers: McpRegistryEntry[] = [];
  for (const name of names) {
    const inCatalog = Object.prototype.hasOwnProperty.call(catalog, name);
    const inRuntime = Object.prototype.hasOwnProperty.call(runtime, name);
    const raw = inRuntime ? runtime[name] : catalog[name];
    if (!inRuntime && !inCatalog) continue;

    // A catalog-only entry defaults OFF (the user opts in). A runtime entry
    // defaults to its own flag (OpenCode treats an absent flag as enabled).
    const { config, issues, description } = normalizeMcpEntry(name, raw, {
      defaultEnabled: inRuntime ? true : (state[name] === true),
    });

    // Raw runtime entries that are already canonical get no synthetic issues.
    const configIssues = inRuntime ? issues : issues.filter((i) => !i.startsWith('missing "type"'));

    const catalogDescription =
      inCatalog && typeof catalog[name]?._comment === 'string'
        ? String(catalog[name]._comment).trim()
        : undefined;

    const requires = findMcpServerRequirement(name);

    servers.push({
      ...config,
      name,
      description: description || catalogDescription || (config.type === 'remote' ? `Remote: ${config.url}` : `Local: ${(config.command ?? []).join(' ')}`),
      registry: inRuntime ? 'opencode' : 'mcpjson',
      configIssues,
      requires,
      apiKeyEnvVars: getMcpEnvVarKeys(name),
      runtime: inRuntime,
      catalog: inCatalog,
      opencodeEnabled: inRuntime ? config.enabled : undefined,
    });
  }

  return { servers };
}

export interface SetMcpEnabledOpts {
  olympusRoot?: string;
  mcpJsonPath?: string;
  opencodeJsonPath?: string;
  stateFile?: string;
}

export interface SetMcpEnabledResult {
  ok: boolean;
  registry: 'mcpjson' | 'opencode' | null;
  opencodeFlagFlipped: boolean;
  state: Record<string, boolean>;
  error?: string;
}

/** The known-good runtime shape for the shipped servers (portable placeholders). */
function canonicalOverride(name: string, current: McpCanonicalConfig, raw: any): Partial<McpCanonicalConfig> {
  switch (name) {
    case 'olympus-craft': {
      const cmd = current.command ?? [];
      if (cmd.some((c) => c.includes('mcp-craft-server.mjs')) || cmd.length === 0) {
        return { command: ['node', '.opencode/mcp-craft-launch.mjs'] };
      }
      break;
    }
    case 'filesystem': {
      const cmd = current.command ?? [];
      if (cmd.some((c) => c.includes('${PROJECT_ROOT}')) || cmd.length <= 1) {
        return { command: ['npx', '-y', '@modelcontextprotocol/server-filesystem@latest', '.'] };
      }
      break;
    }
    case 'git': {
      const cmd = current.command ?? [];
      if (cmd.some((c) => c.includes('${PROJECT_ROOT}')) || cmd.some((c) => c.startsWith('/'))) {
        return { command: ['uvx', 'mcp-server-git', '--repository', '.'] };
      }
      break;
    }
    case 'memory': {
      const env = current.environment ?? {};
      if (!env.MEMORY_FILE_PATH || String(env.MEMORY_FILE_PATH).includes('${HOME}')) {
        return { environment: { ...env, MEMORY_FILE_PATH: '{env:HOME}/OLYMPUS-VAULT/05_Auto_Learning/kg-memory.json' } };
      }
      break;
    }
    case 'github': {
      const env = current.environment ?? {};
      if (!env.GITHUB_PERSONAL_ACCESS_TOKEN || String(env.GITHUB_PERSONAL_ACCESS_TOKEN).includes('${')) {
        return { environment: { ...env, GITHUB_PERSONAL_ACCESS_TOKEN: '{env:GITHUB_PERSONAL_ACCESS_TOKEN}' } };
      }
      break;
    }
    case 'grafana': {
      const env = current.environment ?? {};
      if (!env.GRAFANA_URL || String(env.GRAFANA_URL).includes('${')) {
        return { environment: { ...env, GRAFANA_URL: '{env:GRAFANA_URL}', GRAFANA_API_KEY: '{env:GRAFANA_API_KEY}' } };
      }
      break;
    }
    case 'brave-search': {
      const env = current.environment ?? {};
      if (!env.BRAVE_API_KEY || String(env.BRAVE_API_KEY).includes('${')) {
        return { environment: { ...env, BRAVE_API_KEY: '{env:BRAVE_API_KEY}' } };
      }
      break;
    }
    case 'figma': {
      const cmd = current.command ?? [];
      if (cmd.some((c) => c.includes('${FIGMA_API_KEY}'))) {
        return {
          command: ['npx', '-y', 'figma-developer-mcp@latest', '--figma-api-key={env:FIGMA_API_KEY}'],
          environment: { ...(current.environment ?? {}), FIGMA_API_KEY: '{env:FIGMA_API_KEY}' },
        };
      }
      break;
    }
    case 'fal': {
      if (current.type === 'remote' && !current.headers?.Authorization) {
        return { headers: { Authorization: 'Bearer {env:FAL_KEY}' }, oauth: false };
      }
      break;
    }
    case 'originkit': {
      if (current.type === 'remote' && !current.headers?.Authorization) {
        return { headers: { Authorization: 'Bearer {env:ORIGINKIT_API_KEY}' }, oauth: false };
      }
      break;
    }
    case 'mcp-gateway': {
      const cmd = current.command ?? [];
      if (cmd.some((c) => c.includes('${HOME}'))) {
        return { command: ['mcp-gateway', '--config', '{env:HOME}/.config/mcp-gateway/config.toml'] };
      }
      break;
    }
    default:
      break;
  }
  return {};
}

function applyOverride(name: string, config: McpCanonicalConfig, raw: any): McpCanonicalConfig {
  const patch = canonicalOverride(name, config, raw);
  const merged: McpCanonicalConfig = {
    ...config,
    ...patch,
    type: patch.type ?? config.type,
    enabled: config.enabled,
  };
  if (merged.type === 'local') {
    delete (merged as any).url;
    delete (merged as any).headers;
    delete (merged as any).oauth;
  } else {
    delete (merged as any).command;
    delete (merged as any).cwd;
    delete (merged as any).environment;
  }
  return merged;
}

/**
 * The toggle. Writes the canonical runtime entry (adds it when absent) and
 * the runtime gate's state file. A catalog-only entry is materialized into
 * opencode.json with `enabled`.
 */
export function setMcpEnabled(name: string, enabled: boolean, opts: SetMcpEnabledOpts = {}): SetMcpEnabledResult {
  const root = opts.olympusRoot ?? olympusRoot();
  const mcpJsonPath = opts.mcpJsonPath ?? path.join(root, '.mcp.json');
  const opencodeJsonPath = opts.opencodeJsonPath ?? path.join(root, 'opencode.json');
  const stateFile = opts.stateFile ?? path.join(os.homedir(), '.olympus', 'mcp-state.json');

  const catalogCfg = readJson(mcpJsonPath);
  const catalog: Record<string, any> = catalogCfg?.mcpServers || catalogCfg?.servers || {};
  const runtimeCfg = readJson(opencodeJsonPath);
  if (!runtimeCfg || typeof runtimeCfg !== 'object') {
    return { ok: false, registry: null, opencodeFlagFlipped: false, state: {}, error: 'cannot read opencode.json' };
  }
  if (!runtimeCfg.mcp || typeof runtimeCfg.mcp !== 'object') runtimeCfg.mcp = {};

  let registry: 'mcpjson' | 'opencode' | null = null;
  let raw: any = null;
  if (Object.prototype.hasOwnProperty.call(runtimeCfg.mcp, name)) {
    registry = 'opencode';
    raw = runtimeCfg.mcp[name];
  } else if (Object.prototype.hasOwnProperty.call(catalog, name)) {
    registry = 'mcpjson';
    raw = catalog[name];
  }
  if (!registry) {
    return { ok: false, registry: null, opencodeFlagFlipped: false, state: {}, error: `MCP "${name}" is not in either registry` };
  }

  const { config } = normalizeMcpEntry(name, raw, { defaultEnabled: enabled });
  const next = applyOverride(name, { ...config, enabled }, raw);

  let opencodeFlagFlipped = false;
  try {
    // Preserve a user's non-schema documentation fields? No: the runtime file
    // must stay schema-clean. Descriptions live in .mcp.json.
    const before = stableJson(runtimeCfg.mcp[name] ?? null);
    runtimeCfg.mcp[name] = toRuntimeConfig({ ...next, name, registry, configIssues: [], apiKeyEnvVars: [] } as McpCanonicalEntry);
    if (before !== stableJson(runtimeCfg.mcp[name])) {
      fs.writeFileSync(opencodeJsonPath, JSON.stringify(runtimeCfg, null, 2) + '\n', 'utf-8');
      opencodeFlagFlipped = true;
    }
  } catch (e) {
    return { ok: false, registry, opencodeFlagFlipped: false, state: {}, error: `the opencode.json write failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  // mcp-state.json — the runtime gate store, always written.
  let state: Record<string, boolean> = {};
  try {
    const data = readJson(stateFile);
    state = (data?.enabled && typeof data.enabled === 'object') ? data.enabled : (data ?? {});
  } catch { state = {}; }
  state[name] = enabled;

  try {
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ enabled: state }, null, 2), 'utf-8');
  } catch (e: any) {
    return { ok: false, registry, opencodeFlagFlipped, state, error: e?.message || String(e) };
  }

  return { ok: true, registry, opencodeFlagFlipped, state };
}

export interface SyncMcpResult {
  ok: boolean;
  changed: boolean;
  added: number;
  normalized: number;
  total: number;
  backup?: string;
  details: Array<{ name: string; action: 'added' | 'normalized' | 'unchanged'; issues: string[] }>;
  error?: string;
}

/**
 * Canonicalize BOTH registries. Idempotent: writes only when the stable JSON
 * differs. Backs up opencode.json before the first change.
 */
export function syncMcpConfig(opts: SetMcpEnabledOpts & { backup?: boolean } = {}): SyncMcpResult {
  const root = opts.olympusRoot ?? olympusRoot();
  const mcpJsonPath = opts.mcpJsonPath ?? path.join(root, '.mcp.json');
  const opencodeJsonPath = opts.opencodeJsonPath ?? path.join(root, 'opencode.json');

  const catalogCfg = readJson(mcpJsonPath);
  const catalog: Record<string, any> = catalogCfg?.mcpServers || catalogCfg?.servers || {};
  const runtimeCfg = readJson(opencodeJsonPath);
  if (!runtimeCfg || typeof runtimeCfg !== 'object') {
    return { ok: false, changed: false, added: 0, normalized: 0, total: 0, details: [], error: 'cannot read opencode.json' };
  }
  if (!runtimeCfg.mcp || typeof runtimeCfg.mcp !== 'object') runtimeCfg.mcp = {};

  const before = stableJson(runtimeCfg.mcp);
  const details: SyncMcpResult['details'] = [];
  let added = 0;
  let normalized = 0;

  // 1) Every catalog entry is materialized in opencode.json (disabled by default).
  for (const [name, rawCatalog] of Object.entries(catalog)) {
    const existing = runtimeCfg.mcp[name];
    if (existing === undefined) {
      const { config, issues } = normalizeMcpEntry(name, rawCatalog, { defaultEnabled: false });
      const next = applyOverride(name, { ...config, enabled: false }, rawCatalog);
      runtimeCfg.mcp[name] = toRuntimeConfig({ ...next, name, registry: 'mcpjson', configIssues: [], apiKeyEnvVars: [] } as McpCanonicalEntry);
      added++;
      details.push({ name, action: 'added', issues });
      continue;
    }
    const { config, issues } = normalizeMcpEntry(name, existing, { defaultEnabled: true });
    const enabled = typeof existing?.enabled === 'boolean' ? existing.enabled : true;
    const next = applyOverride(name, { ...config, enabled }, existing);
    const nextRuntime = toRuntimeConfig({ ...next, name, registry: 'opencode', configIssues: [], apiKeyEnvVars: [] } as McpCanonicalEntry);
    const changed = stableJson(nextRuntime) !== stableJson(existing);
    runtimeCfg.mcp[name] = nextRuntime;
    if (changed) normalized++;
    details.push({ name, action: changed ? 'normalized' : 'unchanged', issues: changed ? issues : [] });
  }

  // 2) Runtime-only entries are normalized too (never dropped).
  for (const [name, existingRaw] of Object.entries(runtimeCfg.mcp)) {
    if (Object.prototype.hasOwnProperty.call(catalog, name)) continue;
    const existing = existingRaw as any;
    const { config, issues } = normalizeMcpEntry(name, existing, { defaultEnabled: true });
    const enabled = typeof existing?.enabled === 'boolean' ? existing.enabled : true;
    const next = applyOverride(name, { ...config, enabled }, existing);
    const nextRuntime = toRuntimeConfig({ ...next, name, registry: 'opencode', configIssues: [], apiKeyEnvVars: [] } as McpCanonicalEntry);
    const changed = stableJson(nextRuntime) !== stableJson(existing);
    runtimeCfg.mcp[name] = nextRuntime;
    if (changed) normalized++;
    details.push({ name, action: changed ? 'normalized' : 'unchanged', issues: changed ? issues : [] });
  }

  const after = stableJson(runtimeCfg.mcp);
  const changed = before !== after;
  let backup: string | undefined;
  if (changed) {
    try {
      if (opts.backup !== false) {
        const dir = path.join(os.homedir(), '.olympus', 'backups');
        fs.mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', '');
        backup = path.join(dir, `opencode.json.${stamp}.mcp-sync.bak`);
        fs.copyFileSync(opencodeJsonPath, backup);
      }
      fs.writeFileSync(opencodeJsonPath, JSON.stringify(runtimeCfg, null, 2) + '\n', 'utf-8');
    } catch (e: any) {
      return { ok: false, changed: false, added, normalized, total: details.length, details, error: e?.message || String(e) };
    }
  }

  return { ok: true, changed, added, normalized, total: details.length, backup, details };
}
