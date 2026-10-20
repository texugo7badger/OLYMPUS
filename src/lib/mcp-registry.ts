/**
 * mcp-registry.ts — W-E MCP-UNIFY (v0.0.6-premio): ONE merged registry, so
 * EVERY MCP is configurable in the MCP option like the others.
 *
 * Two registries coexist by design (both OpenCode-native surfaces):
 *   - .mcp.json              — the standard file (20 servers; what the panel
 *                              always listed; runtime toggles via
 *                              ~/.olympus/mcp-state.json, enforced by the
 *                              olympus-router mcp-gate per tool call).
 *   - opencode.json → mcp    — the honest-optional tool lane (godot /
 *                              blender / comfyui / rea; `enabled: false` +
 *                              _olympus_note; OpenCode reads the flag at
 *                              spawn — the panel never listed them).
 *
 * The merge carries a `registry` tag per entry + the opencode `enabled`
 * flag. The toggle honors BOTH stores: a .mcp.json entry flips mcp-state.json
 * only; an opencode-native entry flips mcp-state.json AND the surgical
 * `enabled` boolean in opencode.json (the same file the strategy applier
 * rewrites routinely — parse, mutate the one flag, stringify; everything
 * else preserved verbatim).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';
import { findMcpRequirement, getMcpEnvVarKeys } from './mcp-api-requirements';

/** Resolve the repo root (the OLYMPUS_ROOT env or the module's own tree). */
function olympusRoot(): string {
  if (process.env.OLYMPUS_ROOT) return process.env.OLYMPUS_ROOT;
  // src/lib/mcp-registry.ts → repo root is two levels up.
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  } catch {
    return process.cwd();
  }
}

export type McpRegistryKind = 'mcpjson' | 'opencode';

export interface McpRegistryEntry {
  name: string;
  command?: string;
  url?: string;
  description?: string;
  requiresApiKey: boolean;
  apiKeyEnvVars: string[];
  /** Which registry owns this entry. */
  registry: McpRegistryKind;
  /** The opencode.json `enabled` flag (undefined for .mcp.json entries) —
   *  the honest default the panel must honor (the four tool MCPs ship
   *  disabled). */
  opencodeEnabled?: boolean;
}

export interface ListMcpServersOpts {
  olympusRoot?: string;
  mcpJsonPath?: string;
  opencodeJsonPath?: string;
}

/**
 * The merged registry. Fixture-friendly: every path is overridable (the
 * authLaneCensus precedent); production reads the repo's two files.
 */
export function listMcpServers(opts: ListMcpServersOpts = {}): { servers: McpRegistryEntry[] } {
  const root = opts.olympusRoot ?? olympusRoot();
  const mcpJsonPath = opts.mcpJsonPath ?? path.join(root, '.mcp.json');
  const opencodeJsonPath = opts.opencodeJsonPath ?? path.join(root, 'opencode.json');
  const servers: McpRegistryEntry[] = [];

  // Registry 1: the standard .mcp.json.
  try {
    const cfg = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    const entries = cfg.mcpServers || cfg.servers || {};
    for (const [name, conf] of Object.entries(entries as Record<string, any>)) {
      const req = findMcpRequirement(name);
      let description = '';
      if (typeof conf?._comment === 'string' && conf._comment.trim()) description = conf._comment.trim();
      else if (conf?.url) description = `Remote: ${conf.url}`;
      else if (conf?.command) description = `Local: ${conf.command}`;
      else if (typeof conf === 'string') description = `Wrapped: ${conf}`;
      servers.push({
        name,
        command: conf?.command,
        url: conf?.url,
        description,
        requiresApiKey: !!req,
        apiKeyEnvVars: getMcpEnvVarKeys(name),
        registry: 'mcpjson',
      });
    }
  } catch { /* no .mcp.json (or unreadable) — the merge continues with the opencode block */ }

  // Registry 2: the opencode.json mcp block (the honest-optional tool lane).
  try {
    const cfg = JSON.parse(fs.readFileSync(opencodeJsonPath, 'utf-8'));
    const entries = cfg?.mcp && typeof cfg.mcp === 'object' ? cfg.mcp : {};
    for (const [name, conf] of Object.entries(entries as Record<string, any>)) {
      const command = Array.isArray(conf?.command) ? conf.command.join(' ') : conf?.command;
      // W-B: the shared key-requirements map gates opencode-native BYOK
      // entries too (fal renders LOCKED until FAL_KEY — the panel + the
      // runtime gate read the same truth).
      const req = findMcpRequirement(name);
      servers.push({
        name,
        command: typeof command === 'string' ? command : undefined,
        url: conf?.url,
        description: typeof conf?._olympus_note === 'string' ? conf._olympus_note : (command ? `OpenCode-native: ${command}` : 'OpenCode-native MCP'),
        requiresApiKey: !!req,
        apiKeyEnvVars: getMcpEnvVarKeys(name),
        registry: 'opencode',
        opencodeEnabled: typeof conf?.enabled === 'boolean' ? conf.enabled : true,
      });
    }
  } catch { /* no opencode.json mcp block — the merge continues with what exists */ }

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
  /** Which registry the name belongs to (null when unknown). */
  registry: McpRegistryKind | null;
  /** True when the surgical opencode.json flag flip happened. */
  opencodeFlagFlipped: boolean;
  state: Record<string, boolean>;
  error?: string;
}

/**
 * The toggle. A .mcp.json entry: mcp-state.json only (the runtime gate's
 * store). An opencode-native entry: BOTH stores — the surgical enabled flip
 * in opencode.json (OpenCode reads it at spawn; without it the toggle lies)
 * + mcp-state.json (the per-tool-call gate). The opencode.json write
 * preserves everything else verbatim (parse → flip the one boolean →
 * stringify, the strategy applier's own discipline).
 */
export function setMcpEnabled(name: string, enabled: boolean, opts: SetMcpEnabledOpts = {}): SetMcpEnabledResult {
  const root = opts.olympusRoot ?? olympusRoot();
  const mcpJsonPath = opts.mcpJsonPath ?? path.join(root, '.mcp.json');
  const opencodeJsonPath = opts.opencodeJsonPath ?? path.join(root, 'opencode.json');
  const stateFile = opts.stateFile ?? path.join(os.homedir(), '.olympus', 'mcp-state.json');

  // Which registry owns the name?
  let registry: McpRegistryKind | null = null;
  try {
    const cfg = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    const entries = cfg.mcpServers || cfg.servers || {};
    if (Object.prototype.hasOwnProperty.call(entries, name)) registry = 'mcpjson';
  } catch { /* unreadable .mcp.json — fall through to the opencode check */ }
  if (registry === null) {
    try {
      const cfg = JSON.parse(fs.readFileSync(opencodeJsonPath, 'utf-8'));
      if (cfg?.mcp && typeof cfg.mcp === 'object' && Object.prototype.hasOwnProperty.call(cfg.mcp, name)) {
        registry = 'opencode';
      }
    } catch { /* no opencode block either — unknown name */ }
  }

  // mcp-state.json — the runtime gate store, always written.
  let state: Record<string, boolean> = {};
  try {
    if (fs.existsSync(stateFile)) {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      state = data.enabled || data || {};
    }
  } catch { state = {}; }
  state[name] = enabled;

  let opencodeFlagFlipped = false;
  if (registry === 'opencode') {
    // The surgical flip: parse, set the ONE boolean, stringify. Everything
    // else rides through the parse/stringify round-trip untouched.
    try {
      const cfg = JSON.parse(fs.readFileSync(opencodeJsonPath, 'utf-8'));
      if (cfg?.mcp?.[name] && typeof cfg.mcp[name] === 'object') {
        cfg.mcp[name].enabled = enabled;
        fs.writeFileSync(opencodeJsonPath, JSON.stringify(cfg, null, 2), 'utf-8');
        opencodeFlagFlipped = true;
      }
    } catch {
      return { ok: false, registry, opencodeFlagFlipped: false, state, error: 'the opencode.json flag flip failed — nothing written' };
    }
  }

  try {
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ enabled: state }, null, 2), 'utf-8');
  } catch (e: any) {
    return { ok: false, registry, opencodeFlagFlipped, state, error: e?.message || String(e) };
  }
  return { ok: true, registry, opencodeFlagFlipped, state };
}
