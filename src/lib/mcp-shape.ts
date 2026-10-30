/**
 * mcp-shape.ts — THE ONE CANONICAL MCP SHAPE (v0.0.24).
 *
 * THE SPECIMEN (2026-10-30): the MCP Configuration panel listed 50 servers
 * while OpenCode could see only 2 of the 6 "enabled" ones. Root causes:
 *   - 19 of the 28 opencode.json entries had no `type` field — OpenCode
 *     ignores an untyped entry entirely;
 *   - entries carried `args` instead of one `command` array — `npx` was
 *     spawned with no package and timed out;
 *   - `env` was used instead of `environment`;
 *   - `${VAR}` placeholders are not interpolated by OpenCode (it speaks
 *     `{env:VAR}`), so paths/secrets arrived literal;
 *   - `timeout` was an object; OpenCode's config expects a NUMBER and
 *     drops an entry it cannot parse.
 *
 * This module is the single normalizer both writers (the sync route, the
 * toggle, the audit) and readers (the registry, the health probe) share.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import os from 'node:os';
import path from 'node:path';

export type McpKind = 'local' | 'remote';
export type McpRegistryKind = 'mcpjson' | 'opencode';

/** Why a server is off/locked — the honest reason the panel renders. */
export interface McpServerRequirement {
  kind: 'key' | 'service' | 'binary' | 'app' | 'optional';
  label: string;
  envVars?: string[];
  url?: string;
  /** The executable the preflight looks for (kind: binary). */
  binary?: string;
}

/** The canonical OpenCode MCP config — exactly the schema fields OpenCode reads. */
export interface McpCanonicalConfig {
  type: McpKind;
  command?: string[];
  cwd?: string;
  environment?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  oauth?: false | Record<string, unknown>;
  timeout?: number;
  enabled: boolean;
}

export interface McpCanonicalEntry extends McpCanonicalConfig {
  name: string;
  /** Human description (catalog _comment / note). Never written to runtime. */
  description?: string;
  /** Which file owns the runtime entry. */
  registry: McpRegistryKind;
  /** The catalog entry exists but the runtime shape has issues. */
  configIssues: string[];
  /** Honest requirement metadata (key/service/binary/app/optional). */
  requires?: McpServerRequirement;
  /** API-key env vars (convenience for the panel). */
  apiKeyEnvVars: string[];
}

export interface NormalizeOptions {
  /** Default when the raw entry has neither enabled nor disabled. */
  defaultEnabled?: boolean;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const out = v.filter((x): x is string => typeof x === 'string' && x.length > 0);
    return out.length ? out : undefined;
  }
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return undefined;
}

function stringRecord(v: unknown): Record<string, string> | undefined {
  if (!isObject(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string') out[k] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Normalize one raw MCP entry into the OpenCode v2 shape.
 *
 * Accepts BOTH dialects by design:
 *   - the catalog / legacy `.mcp.json` shape (`command` string, `args`, `env`);
 *   - the OpenCode runtime shape (`type`, `command` array, `environment`).
 *
 * The returned `configIssues` names every legacy/invalid field it had to
 * repair, so the panel can surface "this entry was invisible to OpenCode".
 */
export function normalizeMcpEntry(
  name: string,
  raw: unknown,
  opts: NormalizeOptions = {},
): { config: McpCanonicalConfig; issues: string[]; description?: string } {
  const issues: string[] = [];
  const r = isObject(raw) ? raw : {};

  const url = typeof r.url === 'string' && r.url.trim() ? r.url.trim() : undefined;
  const inferredType: McpKind | undefined = url ? 'remote' : (stringArray(r.command) ? 'local' : undefined);
  let type: McpKind | undefined =
    r.type === 'local' || r.type === 'remote' ? r.type : inferredType;

  if (r.type === undefined) {
    if (inferredType) issues.push('missing "type" (inferred)');
  } else if (r.type !== 'local' && r.type !== 'remote') {
    issues.push(`invalid "type" (${JSON.stringify(r.type)})`);
    type = inferredType;
  }
  if (!type) type = 'local';

  // command: one array. `command` + `args` merge; a string command becomes one.
  let command: string[] | undefined = stringArray(r.command);
  const args = stringArray(r.args);
  if (args) {
    issues.push('legacy "args" merged into "command"');
    command = [...(command ?? []), ...args];
  }
  if (r.args !== undefined && !args && r.args !== null) issues.push('invalid "args" dropped');

  // environment: OpenCode reads `environment`; `env` is the legacy spelling.
  let environment = stringRecord(r.environment);
  const legacyEnv = stringRecord(r.env);
  if (legacyEnv) {
    issues.push('legacy "env" renamed to "environment"');
    environment = { ...(legacyEnv ?? {}), ...(environment ?? {}) };
  }

  // timeout: a NUMBER in the config schema. The runtime TimeoutConfig object
  // is NOT valid here and made OpenCode drop the whole entry.
  let timeout: number | undefined;
  if (typeof r.timeout === 'number' && Number.isFinite(r.timeout) && r.timeout > 0) {
    timeout = Math.round(r.timeout);
  } else if (isObject(r.timeout)) {
    issues.push('object "timeout" dropped (OpenCode config expects a number)');
  } else if (r.timeout !== undefined) {
    issues.push('invalid "timeout" dropped');
  }

  const headers = stringRecord(r.headers);
  const oauth = r.oauth === false ? false : (isObject(r.oauth) ? r.oauth : undefined);

  const defaultEnabled = opts.defaultEnabled ?? true;
  const enabled = typeof r.enabled === 'boolean'
    ? r.enabled
    : (r.disabled === true ? false : defaultEnabled);

  const config: McpCanonicalConfig = { type, enabled };
  if (type === 'local') {
    if (command) config.command = command;
    if (r.cwd !== undefined) {
      if (typeof r.cwd === 'string' && r.cwd.trim()) config.cwd = r.cwd.trim();
      else issues.push('invalid "cwd" dropped');
    }
    if (environment) config.environment = environment;
  } else {
    if (url) config.url = url;
    if (headers) config.headers = headers;
    if (oauth !== undefined) config.oauth = oauth;
  }
  if (timeout !== undefined) config.timeout = timeout;

  if (type === 'local' && !config.command) issues.push('no command — this server cannot start');
  if (type === 'remote' && !config.url) issues.push('no url — this remote server cannot start');

  const description =
    (typeof r._comment === 'string' && r._comment.trim())
    || (typeof r._olympus_note === 'string' && r._olympus_note.trim())
    || (typeof r.description === 'string' && r.description.trim())
    || undefined;

  return { config, issues, description };
}

/**
 * The runtime projection: exactly what may be written to opencode.json.
 * Unknown keys are stripped so OpenCode never has to guess.
 */
export function toRuntimeConfig(entry: McpCanonicalEntry): McpCanonicalConfig {
  const out: McpCanonicalConfig = { type: entry.type, enabled: entry.enabled };
  if (entry.type === 'local') {
    if (entry.command?.length) out.command = [...entry.command];
    if (entry.cwd) out.cwd = entry.cwd;
    if (entry.environment && Object.keys(entry.environment).length) out.environment = { ...entry.environment };
  } else {
    if (entry.url) out.url = entry.url;
    if (entry.headers && Object.keys(entry.headers).length) out.headers = { ...entry.headers };
    if (entry.oauth !== undefined) out.oauth = entry.oauth;
  }
  if (typeof entry.timeout === 'number') out.timeout = entry.timeout;
  return out;
}

/** Expand the placeholder dialects for the audit/health probe (OpenCode does its own at load). */
export function expandMcpPlaceholders(
  value: string,
  ctx: { root?: string; lane?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  const env = ctx.env ?? process.env;
  const root = ctx.root ?? env.OLYMPUS_ROOT ?? process.cwd();
  const projectRoot = ctx.lane ?? env.OLYMPUS_PROJECT_ROOT ?? root;
  const map: Record<string, string> = {
    HOME: os.homedir(),
    OLYMPUS_ROOT: root,
    PROJECT_ROOT: projectRoot,
    OLYMPUS_VAULT: env.OLYMPUS_VAULT ?? path.join(os.homedir(), 'OLYMPUS-VAULT'),
  };
  return String(value)
    // OpenCode's documented dialect: {env:VAR}
    .replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k: string) => env[k] ?? map[k] ?? '')
    // Legacy dialect used by .mcp.json: ${VAR}
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k: string) => env[k] ?? map[k] ?? '')
    .replace(/^~(?=$|\/|\\)/, os.homedir());
}

/** Deep-equal for the sync writer (write only when something changed). */
export function stableJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (isObject(v)) {
      if (seen.has(v)) return '[circular]';
      seen.add(v);
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** True when the raw entry is already canonical (no repair needed). */
export function isCanonicalMcpEntry(raw: unknown, normalized: McpCanonicalConfig): boolean {
  if (!isObject(raw)) return false;
  const allowed = new Set([
    'type', 'command', 'cwd', 'environment', 'url', 'headers', 'oauth', 'timeout', 'enabled',
    // documentation fields are tolerated by the catalog, stripped from runtime
    '_comment', '_olympus_note', 'description',
  ]);
  for (const k of Object.keys(raw)) if (!allowed.has(k)) return false;
  if (raw.type !== normalized.type) return false;
  if (Boolean(raw.enabled) !== Boolean(normalized.enabled) && raw.disabled !== undefined) return false;
  if (normalized.type === 'local') {
    if (!Array.isArray(raw.command)) return false;
    if (raw.command.join('\u0000') !== (normalized.command ?? []).join('\u0000')) return false;
  } else if (raw.url !== normalized.url) return false;
  return true;
}
