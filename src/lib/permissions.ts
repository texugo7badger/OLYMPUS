/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * Issue #41 — the permission policy store.
 *
 * OpenCode parks a run on every permission ask. The old behaviour split the
 * difference badly: a hardcoded prefix allowlist answered *some* asks
 * silently (with no way to see or revoke the rule), while everything else
 * asked. This module makes the whole decision explicit and inspectable:
 *
 *   1. a denied rule matches              -> reject
 *   2. an allowed path prefix matches      -> approve (legacy vault rule)
 *   3. a tool's `always` glob matches      -> approve
 *   4. a tool's `denied` glob matches      -> reject
 *   5. otherwise                           -> ask the user
 *
 * Rules live in `~/.olympus/permissions.json`, seeded on first read so the
 * read-only tools (read/grep/glob/list) keep working unattended while every
 * mutating tool still asks.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

export interface ToolPolicy {
  /** Globs that mean "never ask about this tool again". `*` matches all. */
  always: string[];
  /** Globs that mean "refuse without asking". */
  denied: string[];
}

export interface PermissionsFile {
  version: number;
  tools: Record<string, ToolPolicy>;
  /** Path-prefix rules, independent of tool — the vault auto-approval rule. */
  paths: { always: string[]; denied: string[] };
}

export type Verdict = 'always' | 'denied' | 'ask';

const VERSION = 1;

/** Read-only tools are safe to run unattended; everything else asks. */
const SEED_TOOLS: Record<string, ToolPolicy> = {
  read: { always: ['*'], denied: [] },
  grep: { always: ['*'], denied: [] },
  glob: { always: ['*'], denied: [] },
  list: { always: ['*'], denied: [] },
};

/**
 * Issue #47 — the seeded tool names, for the /permissions panel to flag which
 * rows come from the seed rather than from something the user clicked. Exported
 * (derived from SEED_TOOLS, so it cannot drift) instead of hardcoded in the UI.
 */
export const SEED_TOOL_NAMES: readonly string[] = Object.keys(SEED_TOOLS);

export function permissionsPath(): string {
  return path.join(os.homedir(), '.olympus', 'permissions.json');
}

/** Translate a shell-ish glob into an anchored regex. Only `*` is special. */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matchesAny(globs: string[], value: string): boolean {
  return globs.some(g => globToRegExp(g).test(value));
}

function matchesPrefix(prefixes: string[], value: string): boolean {
  return prefixes.some(p => value === p || value.startsWith(p));
}

function normalizePolicy(raw: any): ToolPolicy {
  const list = (v: any): string[] =>
    Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map((x: string) => x.trim()) : [];
  return { always: list(raw?.always), denied: list(raw?.denied) };
}

let cache: PermissionsFile | null = null;

/**
 * Read the policy file, seeding it on first use.
 *
 * `pathAlwaysPrefixes` carries the legacy `OLYMPUS_AUTO_APPROVE_GLOBS` /
 * vault-root rule so freezing behaviour is preserved — but it now lives in a
 * file the user can read and revoke instead of a constant buried in the pump.
 * It is only applied when seeding; an existing file wins, so revoking a rule
 * sticks across restarts.
 */
export function loadPermissions(opts?: { pathAlwaysPrefixes?: string[] }): PermissionsFile {
  if (cache) return cache;

  const file = permissionsPath();
  let parsed: any = null;
  try {
    if (fs.existsSync(file)) parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    // A corrupt policy file must not take the run down with it. Move it aside
    // so the user can inspect it, then fall through to the seed.
    try { fs.renameSync(file, `${file}.corrupt`); } catch {}
    parsed = null;
  }

  if (parsed && typeof parsed === 'object' && parsed.tools) {
    const tools: Record<string, ToolPolicy> = {};
    for (const [tool, policy] of Object.entries(parsed.tools as Record<string, any>)) {
      tools[tool] = normalizePolicy(policy);
    }
    cache = {
      version: VERSION,
      tools,
      paths: {
        always: Array.isArray(parsed.paths?.always) ? parsed.paths.always : [],
        denied: Array.isArray(parsed.paths?.denied) ? parsed.paths.denied : [],
      },
    };
    return cache;
  }

  const seeded: PermissionsFile = {
    version: VERSION,
    tools: Object.fromEntries(Object.entries(SEED_TOOLS).map(([t, p]) => [t, { ...p }])),
    paths: { always: [...(opts?.pathAlwaysPrefixes || [])], denied: [] },
  };
  persist(seeded);
  cache = seeded;
  return cache;
}

function persist(next: PermissionsFile): void {
  const file = permissionsPath();
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    fs.renameSync(tmp, file);
  } catch {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function commit(next: PermissionsFile): void {
  cache = next;
  persist(next);
}

/** Decide a permission ask without touching the file. */
export function decidePermission(tool: string, patterns: string[]): Verdict {
  const policy = loadPermissions();
  const targets = Array.isArray(patterns) ? patterns.filter(p => typeof p === 'string') : [];

  // Path rules win over tool rules: a denied path is denied whatever asked.
  if (targets.some(p => matchesPrefix(policy.paths.denied, p))) return 'denied';
  if (targets.some(p => matchesPrefix(policy.paths.always, p))) return 'always';

  const entry = policy.tools[tool];
  if (entry) {
    if (targets.some(p => matchesAny(entry.denied, p))) return 'denied';
    if (targets.some(p => matchesAny(entry.always, p))) return 'always';
  }
  // An ask with no concrete target still gets the tool's blanket `*` rule.
  if (targets.length === 0 && entry) {
    if (entry.denied.includes('*')) return 'denied';
    if (entry.always.includes('*')) return 'always';
  }
  return 'ask';
}

/** Persist "stop asking about this tool for this pattern". */
export function grantAlways(tool: string, pattern?: string): void {
  const policy = loadPermissions();
  const entry = policy.tools[tool] || { always: [], denied: [] };
  const glob = pattern && pattern.trim() ? pattern.trim() : '*';
  if (!entry.always.includes(glob)) entry.always.push(glob);
  // A grant supersedes a narrower refusal for the same glob.
  entry.denied = entry.denied.filter(d => d !== glob);
  commit({ ...policy, tools: { ...policy.tools, [tool]: entry } });
}

/** Persist "refuse this tool for this pattern". */
export function grantDenied(tool: string, pattern?: string): void {
  const policy = loadPermissions();
  const entry = policy.tools[tool] || { always: [], denied: [] };
  const glob = pattern && pattern.trim() ? pattern.trim() : '*';
  if (!entry.denied.includes(glob)) entry.denied.push(glob);
  entry.always = entry.always.filter(a => a !== glob);
  commit({ ...policy, tools: { ...policy.tools, [tool]: entry } });
}

/** Drop every rule for a tool. Returns false when it had none. */
export function revokeTool(tool: string): boolean {
  const policy = loadPermissions();
  if (!policy.tools[tool]) return false;
  const tools = { ...policy.tools };
  delete tools[tool];
  commit({ ...policy, tools });
  return true;
}

/** Test seam — drops the in-memory cache. */
export function resetPermissionCache(): void {
  cache = null;
}