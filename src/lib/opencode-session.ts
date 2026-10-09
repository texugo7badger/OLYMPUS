/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * Persistent OpenCode session manager.
 *
 * OLYMPUS keeps ONE warm `opencode serve` instance per app run. The first
 * terminal message lazily spawns it (that is the only cold start); every
 * subsequent message reuses the running server through its HTTP API:
 *
 *   - POST /session              → create a session (one per chat conversation)
 *   - POST /session/{id}/message → run a message (full JSON turn result)
 *   - GET  /event                → SSE feed of ALL live events (deltas, tool
 *                                  parts, step parts, session status)
 *   - GET  /session/{id}/message → full message history of a session
 *
 * The live event feed is mapped to the same UI event shapes that
 * `opencode run --format json` emits (step_start / text / step_finish /
 * tool.call / tool.response / error), so the frontend is unchanged.
 *
 * Lifecycle:
 *   - The server is spawned detached (survives Next.js restarts), bound to
 *     127.0.0.1 with a per-instance random password (OPENCODE_SERVER_PASSWORD),
 *     and logged to ~/.olympus/opencode-server.log.
 *   - A PID file (~/.olympus/opencode-server.pid) records { pid, port, password }
 *     so a leftover server from a previous app run is REUSED (no cold start)
 *     and cleaned up on app exit.
 *   - Port: env OLYMPUS_OPENCODE_PORT || 3777, with a small scan if busy.
 *   - If the server cannot start, callers fall back to the classic one-shot
 *     `opencode run --format json [--session <id>]` path (context retained).
 *
 * Concurrency: one in-flight message per conversation (the interactive
 * terminal is single-flight already; the lock protects the shared server).
 */

import { randomBytes } from 'node:crypto';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnOpencode, freeTierPreflight, authLaneCensus, resolveWorkspaceLane } from '@/lib/opencode-spawn';
import { loadBenchmarkConfig, appendBenchmarkEntry } from '@/lib/benchmarks';
import { LLM_STRATEGIES } from '@/lib/model-strategies';
import { getVaultRoot } from '@/lib/vault-root';
// Issue #41: explicit, revisable permission policy. Replaces the silent
// auto-approve branch in the event pump; the vault prefixes below now seed
// `paths.always` in ~/.olympus/permissions.json instead of living as a
// constant the user cannot see or revoke.
import { loadPermissions, decidePermission } from '@/lib/permissions';

const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');
// Vault root — mirrors src/app/api/olympus/upload/route.ts. Used by the
// permission auto-approval allowlist below.
const VAULT_ROOT = getVaultRoot();
// Seed for `paths.always` in ~/.olympus/permissions.json (freeze-class fix
// 2026-09-29): OpenCode routes reads OUTSIDE the project root through
// `external_directory: ask`, which permanently blocks the run when no client
// answers. Vault paths are always user-owned, so asks under the vault root are
// approved without a prompt. This only SEEDS the policy file — once it exists,
// the file wins, so a user who revokes the rule keeps it revoked.
// OLYMPUS_AUTO_APPROVE_GLOBS (comma-separated absolute prefixes, empty =
// no path grants) overrides the default seed.
const DEFAULT_AUTO_APPROVE_PREFIXES = [`${VAULT_ROOT}/`];
const AUTO_APPROVE_PREFIXES: string[] = (
  process.env.OLYMPUS_AUTO_APPROVE_GLOBS !== undefined
    ? process.env.OLYMPUS_AUTO_APPROVE_GLOBS
    : DEFAULT_AUTO_APPROVE_PREFIXES.join(',')
).split(',').map(s => s.trim()).filter(Boolean);
const PID_FILE = path.join(OLYMPUS_HOME, 'opencode-server.pid');
const LOG_FILE = path.join(OLYMPUS_HOME, 'opencode-server.log');
const SESSION_MAP_FILE = path.join(OLYMPUS_HOME, 'opencode-sessions.json');
const PROVIDERS_FILE = path.join(OLYMPUS_HOME, 'llm-providers.json');

const DEFAULT_PORT = 3777;
const PORT_SCAN = 5;                        // try up to N ports after the default
const SERVER_READY_TIMEOUT_MS = 60_000;     // serve boot is ~2s; 60s is generous
const SERVER_PROBE_TIMEOUT_MS = 2_500;
const REQUEST_TIMEOUT_MS = 15_000;          // default per-API-call timeout
const MAX_CONVERSATIONS = 50;
const CONVERSATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface ServerInfo {
  port: number;
  /** true when a live server was already running (reused, no cold start). */
  warm: boolean;
  password: string | null;
  /** true when the server requires basic auth (we spawned it with a password). */
  authed: boolean;
  /** #99: the workspace lane the serve was spawned with (cold start only). */
  workspaceDir?: string;
  /** #99: true only on the cold start that CREATED the lane — the
   *  first-run ask/notice fires once, never per-run. */
  workspaceFresh?: boolean;
}

/**
 * The currently-active LLM strategy id, read from ~/.olympus/llm-providers.json
 * (persisted by the strategy routes). Falls back to active-strategy.json, then
 * to the default strategy. Custom-* ids are returned as-is.
 */
export function activeStrategyId(): string {
  for (const file of [PROVIDERS_FILE, path.join(OLYMPUS_HOME, 'active-strategy.json')]) {
    try {
      if (fs.existsSync(file)) {
        const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const s = cfg?.strategy;
        if (typeof s === 'string' && /^(go-|zen-|free-|custom-)/.test(s)) return s;
      }
    } catch {}
  }
  return 'go-balanced';
}

/**
 * Compact authoritative strategy block prepended to every message sent to the
 * model. Fixes the strategy self-report: without this, the model infers the
 * strategy from model IDs + AGENTS.md and hallucinates (e.g. quoting
 * "free-nvidia-build" while on free-openrouter). Kept ≤ ~150 tokens.
 */
export function buildStrategyContextBlock(): string {
  const id = activeStrategyId();
  const builtin = LLM_STRATEGIES[id as keyof typeof LLM_STRATEGIES];
  let label = id;
  let plan = 'CUSTOM';
  let tier = '';
  let desc = '';
  let gods: Record<string, string> = {};
  if (builtin) {
    label = builtin.label;
    plan = builtin.plan;
    tier = builtin.tier;
    desc = builtin.description;
    gods = builtin.gods as Record<string, string>;
  } else if (id.startsWith('custom-')) {
    // Custom strategies carry their own per-god map in ~/.olympus/custom-strategies.json.
    try {
      const file = path.join(OLYMPUS_HOME, 'custom-strategies.json');
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const cfg = raw?.[id];
        if (cfg) {
          label = cfg.name || id;
          desc = cfg.description || '';
          gods = cfg.gods || {};
        }
      }
    } catch {}
  }
  const family = plan === 'GO' ? 'GO plan' : plan === 'ZEN' ? 'ZEN plan' : tier === 'free' ? 'FREE (no GO/ZEN plan)' : 'CUSTOM';
  const descShort = desc.length > 130 ? desc.slice(0, 130) + '…' : desc;
  const lines = [
    '[OLYMPUS ACTIVE STRATEGY — authoritative; do NOT infer it from model IDs]',
    `Strategy: ${id} (${label}) — ${family}${descShort ? `. ${descShort}` : ''}`,
  ];
  for (const [god, model] of Object.entries(gods)) lines.push(`  ${god}: ${model}`);
  // Issue #32 (complaint 5: "vault path guessing"). The canonical root is
  // already resolved on the OLYMPUS side; without stating it here the model
  // guesses (observed: it tried ~/Projects/olympus/OLYMPUS-VAULT before the
  // canonical ~/OLYMPUS-VAULT) and burns probe cycles per run.
  lines.push(`Vault root: ${VAULT_ROOT} — never guess vault paths; resolve from this root.`);
  return lines.join('\n');
}

interface ConversationRecord {
  sessionId: string;
  createdAt: string;
  lastUsedAt: string;
}

let serverPromise: Promise<ServerInfo> | null = null;
let serverChild: ChildProcess | null = null;
let serverLogFd: number | null = null;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function basicAuth(password: string): string {
  return 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64');
}

async function apiFetch(
  port: number,
  password: string | null,
  pathname: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (password) headers.set('Authorization', basicAuth(password));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  try {
    return await fetch(`http://127.0.0.1:${port}${pathname}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

/** Probe a port: does an opencode server answer? Try unauthenticated first. */
async function probeServer(
  port: number,
  password: string | null,
): Promise<{ ok: boolean; authed: boolean; status?: number; timedOut?: boolean }> {
  let timedOut = false;
  // undici wraps the real cause ("fetch failed" message, ECONNREFUSED /
  // TimeoutError in `cause`) — BOTH must be inspected, or connection-
  // refused ports get misclassified as hung serves (Phase B bug found in
  // live test: the `||` short-circuit never reached `cause`).
  const isRefused = (e: unknown) => {
    const m = `${(e as any)?.message || ''} ${(e as any)?.cause || ''}`;
    return m.includes('ECONNREFUSED') || m.includes('ENOTFOUND') || m.includes('Not Found');
  };
  const isAbort = (e: unknown) => {
    const m = `${(e as any)?.message || ''} ${(e as any)?.cause || ''} ${(e as any)?.name || ''}`;
    return m.includes('aborted') || m.includes('TimeoutError') || m.includes('timeout');
  };
  let saw401 = false;
  try {
    const r = await apiFetch(port, null, '/config', {}, SERVER_PROBE_TIMEOUT_MS);
    if (r.ok) return { ok: true, authed: false };
    // 401 = a password-protected opencode serve. Do NOT early-return yet:
    // when the caller HAS a password (pidfile adoption), the authenticated
    // probe below must get its chance — the previous early-return made
    // adoption unreachable for every password-protected serve (the only
    // kind spawnServer creates), so healthy serves were misclassified as
    // orphans and killed (crash-loop cascade, see issue #57).
    if (r.status === 401) saw401 = true;
    else timedOut = false;
  } catch (e: any) {
    // Aborted = accepted but never answered (hung serve); refused = free.
    // Refused = port free (fails fast, ~11ms); abort/hang = accepted but
    // never answered (costs the full 2.5s). Any non-refused failure counts
    // as hung — conservative, and correct for the boot-hang signature.
    timedOut = !isRefused(e);
  }
  if (password) {
    try {
      const r = await apiFetch(port, password, '/config', {}, SERVER_PROBE_TIMEOUT_MS);
      if (r.ok) return { ok: true, authed: true };
    } catch (e: any) {
      timedOut = !isRefused(e);
    }
  }
  if (saw401) return { ok: false, authed: false, status: 401 };
  return { ok: false, authed: false, timedOut };
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

interface PidFile {
  pid: number;
  port: number;
  password: string | null;
}

function readPidFile(): PidFile | null {
  try {
    const raw = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
    if (typeof raw?.pid === 'number' && typeof raw?.port === 'number') {
      return { pid: raw.pid, port: raw.port, password: typeof raw.password === 'string' ? raw.password : null };
    }
  } catch {}
  return null;
}

function writePidFile(port: number, password: string | null, pid: number) {
  try {
    fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
    fs.writeFileSync(PID_FILE, JSON.stringify({ pid, port, password }, null, 2));
  } catch {}
}

function removePidFile() {
  try { fs.unlinkSync(PID_FILE); } catch {}
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * Drop the cached server state so the next ensureServer() re-probes and
 * (re)spawns. Used when a run fails at the server level (before the message
 * was posted) — the server may have crashed.
 */
export function invalidateServer() {
  serverPromise = null;
  serverChild = null;
}

function nextPort(start: number): number {
  return (start % 65535) + 1;
}

// ---------------------------------------------------------------------------
// Stale-serve reaping (Phase B fix a+b) — orphaned `opencode serve`
// processes contend with the active one on the shared SQLite DB
// (~/.local/share/opencode/opencode.db), which crash-loops the newer serve
// (ServeError) and surfaces "fetch failed" to the client.
// ---------------------------------------------------------------------------

/** True when /proc/<pid>/cmdline contains "opencode" (guards against killing
 *  an unrelated process that happens to own the port). */
function isOpencodeProcess(pid: number): boolean {
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return cmdline.includes('opencode');
  } catch {
    return false;
  }
}

/** Find the PID listening on a TCP port. lsof first, ss as fallback. */
function findPortOwnerPid(port: number): number | null {
  try {
    const out = execSync(`lsof -t -i :${port} -sTCP:LISTEN 2>/dev/null`, { timeout: 3000 }).toString().trim();
    const pid = parseInt(out.split('\n')[0] || '', 10);
    if (Number.isFinite(pid) && pid > 0) return pid;
  } catch {}
  try {
    const out = execSync(`ss -ltnp "sport = :${port}" 2>/dev/null`, { timeout: 3000 }).toString();
    const m = out.match(/pid=(\d+)/);
    if (m) {
      const pid = parseInt(m[1], 10);
      if (Number.isFinite(pid) && pid > 0) return pid;
    }
  } catch {}
  return null;
}

/** SIGTERM → wait ≤3s → SIGKILL a stale opencode serve. No-op when the PID
 *  is not an opencode process (safety) or is already dead. */
async function killStaleServe(pid: number, reason: string): Promise<boolean> {
  if (!isProcessAlive(pid)) return true;
  if (!isOpencodeProcess(pid)) {
    console.log(`[opencode-session] NOT killing pid ${pid} (${reason}) — not an opencode process`);
    return false;
  }
  console.log(`[opencode-session] Killing stale opencode serve (pid ${pid}) — ${reason}`);
  try { process.kill(pid, 'SIGTERM'); } catch { return isProcessAlive(pid) ? false : true; }
  for (let i = 0; i < 15; i++) {
    if (!isProcessAlive(pid)) return true;
    await sleep(200);
  }
  try { process.kill(pid, 'SIGKILL'); } catch {}
  for (let i = 0; i < 10; i++) {
    if (!isProcessAlive(pid)) return true;
    await sleep(200);
  }
  console.log(`[opencode-session] WARNING: pid ${pid} ignored SIGKILL`);
  return false;
}

/**
 * Ensure a warm `opencode serve` instance is running. Returns the server
 * info. Idempotent — concurrent callers share one in-flight start.
 *
 * Reuse order:
 *   1. A live server recorded in the PID file (leftover from a previous
 *      app run) → reuse (warm).
 *   2. Any live opencode server already answering on the port → reuse.
 *   3. Otherwise spawn a fresh server (cold start).
 */
export async function ensureServer(): Promise<ServerInfo> {
  if (serverPromise) {
    // Cache hit — the server was already established by an earlier call.
    // Report it as warm (if it died since, the warm run fails fast and the
    // caller falls back / invalidates).
    return serverPromise.then((info) => ({ ...info, warm: true, workspaceFresh: false }));
  }
  serverPromise = (async (): Promise<ServerInfo> => {
    const configured = parseInt(process.env.OLYMPUS_OPENCODE_PORT || '', 10);
    const startPort = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PORT;

    // 1. Leftover server from a previous run (PID file).
    //    (fix a) If the recorded process is alive but its API is gone or
    //    no longer matches the stored password, it is a stale owner — kill
    //    it so it can't hold the port or contend on the shared SQLite DB.
    //    A dead PID's file is simply removed (stale-file cleanup).
    const pidFile = readPidFile();
    if (pidFile && isProcessAlive(pidFile.pid)) {
      const probe = await probeServer(pidFile.port, pidFile.password);
      if (probe.ok) {
        console.log(`[opencode-session] Reusing warm OpenCode server on port ${pidFile.port} (pid ${pidFile.pid})`);
        return { port: pidFile.port, warm: true, password: pidFile.password, authed: probe.authed };
      }
      await killStaleServe(pidFile.pid, `pid file stale (API unreachable on port ${pidFile.port})`);
      removePidFile();
    } else if (pidFile) {
      // (fix a) Dead PID — stale file cleanup (B.5).
      removePidFile();
    }

    // 2/3. Scan ports: reuse anything that answers, otherwise spawn.
    //    (fix b) A 401 means a password-protected ORPHANED opencode serve
    //    occupies the port — previous lifecycle left it alive with a lost
    //    password. Kill it by port owner (after verifying it IS opencode)
    //    and re-probe the same port instead of spawning a second serve
    //    that would contend on the shared SQLite DB.
    let port = startPort;
    for (let i = 0; i <= PORT_SCAN; i++) {
      const probe = await probeServer(port, null);
      if (probe.ok) {
        console.log(`[opencode-session] Found running OpenCode server on port ${port} — reusing (no cold start)`);
        return { port, warm: true, password: null, authed: false };
      }
      if (probe.status === 401) {
        const ownerPid = findPortOwnerPid(port);
        if (ownerPid) {
          await killStaleServe(ownerPid, `orphaned password-protected serve on port ${port} (401)`);
          continue; // re-probe the same port — the owner is gone now
        }
      }
      if (i < PORT_SCAN) port = nextPort(port);
    }

    // No live server — spawn one (the only cold start).
    port = startPort;
    let lastError: string | null = null;
    for (let attempt = 0; attempt <= PORT_SCAN; attempt++) {
      try {
        const info = await spawnServer(port);
        return info;
      } catch (err: any) {
        lastError = err?.message || String(err);
        if (attempt < PORT_SCAN) port = nextPort(port);
      }
    }
    throw new Error(`failed to start opencode serve: ${lastError || 'unknown error'}`);
  })();
  return serverPromise;
}

async function spawnServer(port: number): Promise<ServerInfo> {
  const password = randomBytes(16).toString('hex');

  try {
    fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
  } catch {}

  // Keep a bounded log: rotate if it exceeds 1 MB.
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size > 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.1');
  } catch {}

  const logFd = fs.openSync(LOG_FILE, 'a');
  // #99: the serve runs IN THE WORKSPACE LANE — never the repo root. The
  // 2026-10-07 UAT created exemplo-landingpage/ inside the working tree
  // because this spawn inherited findOlympusRoot() as cwd.
  const lane = resolveWorkspaceLane();
  const child = spawnOpencode(
    ['serve', '--port', String(port)],
    {
      cwd: lane.dir,
      extraEnv: {
        OPENCODE_SERVER_PASSWORD: password,
        // Tell the OLYMPUS overlay where the OLYMPUS API lives (heartbeat,
        // live.jsonl capture, etc.). Electron runs Next on PORT (3737); the
        // overlay's own default (http://127.0.0.1:3000) points nowhere.
        OLYMPUS_API_BASE: process.env.OLYMPUS_API_BASE
          || (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : 'http://127.0.0.1:3737'),
        // #95 (ROOT-LANE-ADOPT): the app-spawned serve IS the root session —
        // inject the opt-in lane so the Part-3 trio (bus + Atlas + idle)
        // registers without the user exporting anything.
        OLYMPUS_ROOT_SESSION: '1',
      },
      stdio: ['ignore', logFd, logFd] as const,
      detached: true,
    },
  );
  child.unref();
  serverChild = child;
  serverLogFd = logFd;

  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  // Log offset at spawn start — the ServeError fast-fail reads only NEW
  // log bytes (older ServeErrors from previous spawns must not count).
  let logStartSize = 0;
  try { logStartSize = fs.statSync(LOG_FILE).size; } catch {}
  let consecutiveTimeouts = 0;

  for (;;) {
    // Child died before becoming ready — fail fast.
    if (child.exitCode !== null || child.signalCode !== null) {
      try { fs.closeSync(logFd); } catch {}
      serverChild = null;
      throw new Error(`opencode serve exited early (code ${child.exitCode ?? 'signal'})`);
    }
    const probe = await probeServer(port, password);
    if (probe.ok) {
      writePidFile(port, password, child.pid ?? process.pid);
      console.log(`[opencode-session] OpenCode server ready on port ${port} (pid ${child.pid})`);
      return { port, warm: false, password, authed: probe.authed, workspaceDir: lane.dir, workspaceFresh: lane.fresh };
    }
    consecutiveTimeouts = probe.timedOut ? consecutiveTimeouts + 1 : 0;
    // (Phase B) fast-fails for dead ports — each dead port previously
    // burned the full 60s SERVER_READY_TIMEOUT, blowing the route's 120s
    // startup budget (freeze 2026-09-29). Two signatures:
    //   - crash-loop: the child logs "ServeError" repeatedly, never binds.
    //   - boot-hang: the child binds ("listening") but never ANSWERS —
    //     /config requests hang during DB-lock contention with a draining
    //     orphan. A healthy serve answers in <100ms, so 3 consecutive
    //     probe timeouts (≈7.5s) prove the hang.
    let crashLooped = false;
    try {
      const st = fs.statSync(LOG_FILE);
      if (st.size > logStartSize) {
        const len = Math.min(st.size - logStartSize, 64 * 1024);
        const chunk = Buffer.alloc(len);
        const fd = fs.openSync(LOG_FILE, 'r');
        fs.readSync(fd, chunk, 0, len, st.size - len);
        fs.closeSync(fd);
        crashLooped = chunk.toString('utf8').includes('ServeError');
      }
    } catch {}
    if (crashLooped || consecutiveTimeouts >= 3) {
      const why = crashLooped ? 'ServeError in log' : `${consecutiveTimeouts} consecutive probe timeouts (hung serve)`;
      try { child.kill('SIGKILL'); } catch {}
      try { fs.closeSync(logFd); } catch {}
      serverChild = null;
      throw new Error(`opencode serve ${why} on port ${port} — falling through to next port`);
    }
    if (Date.now() > deadline) {
      try { child.kill('SIGTERM'); } catch {}
      try { fs.closeSync(logFd); } catch {}
      serverChild = null;
      throw new Error(`opencode serve did not become ready on port ${port} within ${SERVER_READY_TIMEOUT_MS / 1000}s`);
    }
    await sleep(500);
  }
}

/** Kill the warm server (app exit). Removes the PID file. */
/**
 * Respond to a pending OpenCode permission request. `reply` is one of
 * "once" | "always" | "reject" (matches POST /permission/{requestID}/reply).
 * Returns true when the reply was accepted by the warm server.
 */
export async function respondToPermission(
  requestID: string,
  reply: 'once' | 'always' | 'reject',
): Promise<boolean> {
  const server = await ensureServer();
  const auth = server.authed ? server.password : null;
  const res = await apiFetch(
    server.port,
    auth,
    `/permission/${encodeURIComponent(requestID)}/reply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    },
    10_000,
  );
  return res.ok;
}

export function cleanupServer() {  if (serverChild && serverChild.exitCode === null && serverChild.signalCode === null) {
    try { serverChild.kill('SIGTERM'); } catch {}
  }
  removePidFile();
  if (serverLogFd !== null) {
    try { fs.closeSync(serverLogFd); } catch {}
    serverLogFd = null;
  }
  serverChild = null;
  serverPromise = null;
}

// ---------------------------------------------------------------------------
// Conversation → session mapping
// ---------------------------------------------------------------------------

function loadConversationMap(): Record<string, ConversationRecord> {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSION_MAP_FILE, 'utf8'));
    if (raw && typeof raw === 'object') return raw as Record<string, ConversationRecord>;
  } catch {}
  return {};
}

function pruneConversations(map: Record<string, ConversationRecord>): Record<string, ConversationRecord> {
  const now = Date.now();
  const entries = Object.entries(map)
    .filter(([, v]) => {
      try {
        return v?.sessionId && now - new Date(v.lastUsedAt).getTime() < CONVERSATION_TTL_MS;
      } catch {
        return false;
      }
    })
    .sort((a, b) => {
      try { return new Date(b[1].lastUsedAt).getTime() - new Date(a[1].lastUsedAt).getTime(); } catch { return 0; }
    })
    .slice(0, MAX_CONVERSATIONS);
  return Object.fromEntries(entries);
}

function saveConversationMap(map: Record<string, ConversationRecord>) {
  try {
    fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
    fs.writeFileSync(SESSION_MAP_FILE, JSON.stringify(map, null, 2));
  } catch {}
}

/**
 * Forget a conversation's session mapping (issue #21).
 *
 * `reset-session` kills the warm `opencode serve` and the client rotates its
 * conversationId, but the OLD conversationId kept its entry in
 * ~/.olympus/opencode-sessions.json. That entry is not merely stale — the
 * serve it points at was just killed, so it is a dangling reference: asking
 * for context on the old conversationId reports the pre-reset percentage of a
 * session that no longer exists. Deleting it keeps the map from accumulating
 * one dead entry per reset.
 *
 * Best-effort and idempotent: a missing key is not an error, and any write
 * failure is swallowed like every other writer of this file.
 */
export function forgetConversation(conversationId: string): boolean {
  if (!conversationId) return false;
  const map = loadConversationMap();
  if (!(conversationId in map)) return false;
  delete map[conversationId];
  saveConversationMap(map);
  return true;
}

/**
 * Get the opencode session ID for a chat conversation, creating it on the
 * warm server on first use. Session IDs survive app restarts (persisted to
 * ~/.olympus/opencode-sessions.json), so context is retained even across
 * cold app starts as long as the client keeps the same conversationId.
 */
export async function getOrCreateSession(conversationId: string): Promise<string> {
  const server = await ensureServer();

  const map = loadConversationMap();
  const existing = map[conversationId];
  if (existing?.sessionId) {
    existing.lastUsedAt = new Date().toISOString();
    saveConversationMap(pruneConversations(map));
    return existing.sessionId;
  }

  const res = await apiFetch(
    server.port,
    server.authed ? server.password : null,
    '/session',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Olympus Terminal — ${new Date().toISOString()}` }),
    },
  );
  if (!res.ok) {
    throw new Error(`create session failed (HTTP ${res.status})`);
  }
  const data: any = await res.json().catch(() => null);
  const sessionId = typeof data?.id === 'string' ? data.id : null;
  if (!sessionId) {
    throw new Error('create session returned no id');
  }

  map[conversationId] = {
    sessionId,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };
  saveConversationMap(pruneConversations(map));
  return sessionId;
}

// ---------------------------------------------------------------------------
// Warm message execution
// ---------------------------------------------------------------------------

export interface WarmRunResult {
  code: number;
  sessionId: string;
  /** Human-readable error (when code !== 0). */
  error?: string;
  /** True if events were delivered before the failure (prevents double-send fallback). */
  receivedEvents: boolean;
  /** True if the message POST was sent to the server. */
  postStarted: boolean;
  /** Provider/transport HTTP status when the failure carried one structurally
   *  (APIError data.statusCode, or a non-2xx POST). Absent when the failure had
   *  no status — classifyRetry then falls back to matching the error string. */
  statusCode?: number;
  /** #60 (BATCH 13): set when the client went away mid-run and the
   *  server-side prompt was aborted after the grace window. The route emits
   *  this as the run_abandoned telemetry event. */
  abandoned?: {
    session_id: string;
    last_event_ts: string;
    grace_ms: number;
  };
}

export interface WarmRunOptions {
  sessionId: string;
  text: string;
  /** Agent id (apollo, callimachus, ...). Defaults to the session's agent. */
  agent?: string;
  /** Receives mapped UI events (step_start / text / step_finish / tool.* / error / log). */
  onEvent: (ev: any) => void;
  /** Abort signal (client disconnect). */
  signal?: AbortSignal;
  /** Hard cap on the whole message run. */
  maxRuntimeMs?: number;
  /** #62 (BATCH 13): the run's task class — scales the watchdog's idle
   *  budget (complex/architectural get 3x). Absent = base budget. */
  complexity?: string | null;
}

/**
 * Per-conversation in-flight lock: the interactive terminal is single-flight,
 * but this protects the shared server from overlapping runs on the same
 * session (e.g. an answer arriving while a prompt is still streaming).
 */
const sessionLocks = new Map<string, Promise<void>>();

async function withSessionLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const chain = prev.then(() => gate);
  sessionLocks.set(key, chain);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (sessionLocks.get(key) === chain) sessionLocks.delete(key);
  }
}

/**
 * Benchmark accumulator (issue #28).
 *
 * One window per (sessionID, agent). Sums step-finish token/cost counters and
 * wall-clock, then emits one row per agent on flush.
 *
 * R-C FINDING — why `agent` is null for now, not "multi":
 *  message.updated's AssistantMessage (SDK types.gen.d.ts:98-127) carries
 *  modelID/providerID/mode/parentID but NO agent-name field, so the join key
 *  R-A assumes does not exist. The only agent name on the wire is a `subtask`
 *  Part (types.gen.d.ts:349-352), which appears only for dispatched
 *  subagents — god turns have no counterpart, so per-agent rows would
 *  attribute demigod work while leaving god turns unattributed (asymmetric,
 *  silently wrong totals). Per R-C this module therefore keeps the per-agent
 *  sub-map SHAPE (so R-A lands as a one-line change once an agent name is
 *  available) but parks unattributed counters under the reserved key
 *  MULTI_KEY. Corroborating: `god_working` — the event the UI would use to
 *  learn agent names — was never emitted by this module (or any other); its
 *  single consumer was removed as dead code in issue #31, so it is now
 *  unreferenced rather than merely unreachable.
 *
 * The key is deliberately not the literal "multi": if real agent names ever
 * arrive, a god or demigod could legitimately be called "multi" and would
 * then collide with this bucket.
 */
const MULTI_KEY = '__multi__';

interface AgentBucket {
  agentName: string;
  tokens_input: number;
  tokens_output: number;
  tokens_reasoning: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  spend_usd: number;
  tool_call_count: number;
  had_error: boolean;
  /** messageID -> model, from message.updated (runtime beats registry config). */
  modelByMessage: Map<string, string>;
  /** messageID -> providerID, from message.updated. */
  providerByMessage: Map<string, string>;
  /** step-finish part IDs already counted — re-sent parts must not double-count. */
  countedSteps: Set<string>;
  taskSignature: string;
  firstTs: number;
  lastTs: number;
}

/** sessionID -> agentName -> bucket */
const accumulators = new Map<string, Map<string, AgentBucket>>();

function getBucket(sessionID: string, agentName: string): AgentBucket {
  let byAgent = accumulators.get(sessionID);
  if (!byAgent) {
    byAgent = new Map();
    accumulators.set(sessionID, byAgent);
  }
  let b = byAgent.get(agentName);
  if (!b) {
    b = {
      agentName,
      tokens_input: 0,
      tokens_output: 0,
      tokens_reasoning: 0,
      tokens_cache_read: 0,
      tokens_cache_write: 0,
      spend_usd: 0,
      tool_call_count: 0,
      had_error: false,
      modelByMessage: new Map(),
      providerByMessage: new Map(),
      countedSteps: new Set(),
      taskSignature: '',
      firstTs: Date.now(),
      lastTs: Date.now(),
    };
    byAgent.set(agentName, b);
  }
  return b;
}

/** message.updated: remember the runtime model for this messageID. */
function noteMessageModel(sessionID: string, info: any): void {
  if (!info || typeof info.id !== 'string') return;
  const b = getBucket(sessionID, MULTI_KEY);
  if (typeof info.modelID === 'string' && info.modelID) b.modelByMessage.set(info.id, info.modelID);
  if (typeof info.providerID === 'string' && info.providerID) b.providerByMessage.set(info.id, info.providerID);
}

/** step-finish: fold this step's tokens + cost into the bucket. */
function noteStepFinish(sessionID: string, part: any): void {
  if (!part || typeof part.id !== 'string') return;
  const b = getBucket(sessionID, MULTI_KEY);
  if (b.countedSteps.has(part.id)) return; // re-sent part, already counted
  b.countedSteps.add(part.id);
  const t = part.tokens || {};
  const cache = t.cache || {};
  b.tokens_input += num(t.input);
  b.tokens_output += num(t.output);
  b.tokens_reasoning += num(t.reasoning);
  b.tokens_cache_read += num(cache.read);
  b.tokens_cache_write += num(cache.write);
  b.spend_usd += num(part.cost);
  b.lastTs = Date.now();
}

function noteToolCall(sessionID: string): void {
  const b = getBucket(sessionID, MULTI_KEY);
  b.tool_call_count++;
  b.lastTs = Date.now();
}

function noteSessionError(sessionID: string): void {
  getBucket(sessionID, MULTI_KEY).had_error = true;
}

/**
 * Issue #35: app-side error marker for failure paths OUTSIDE the event feed
 * (route-level fail(), runWarmMessage HTTP failures). Deliberately does NOT
 * create a bucket via getBucket() — if the window already flushed, creating
 * one would re-arm a zero-activity ghost row. Marks only live buckets.
 */
export function markSessionError(sessionID: string): void {
  const byAgent = accumulators.get(sessionID);
  if (!byAgent) return;
  for (const b of byAgent.values()) b.had_error = true;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Set the content-free task signature for this window. Only the hash of it is
 * ever persisted, so the raw string stays in memory.
 */
function setBenchmarkTaskSignature(sessionID: string, taskSignature: string): void {
  const byAgent = accumulators.get(sessionID);
  if (!byAgent) return;
  for (const b of byAgent.values()) b.taskSignature = taskSignature;
}

/**
 * Emit one row per agent for this session, then reset the window.
 *
 * Recording OFF is a strict no-op: if nothing accumulated we return before any
 * config read, so no dir or file is ever created. Failures never propagate —
 * this runs on the SSE path.
 */
function flushBenchmarkAccumulator(sessionID: string): void {
  try {
    const byAgent = accumulators.get(sessionID);
    if (!byAgent || byAgent.size === 0) return; // empty guard: dedupes double flush
    if (!loadBenchmarkConfig().recordingEnabled) {
      accumulators.delete(sessionID);
      return;
    }
    const strategy = activeStrategyId();
    const stack = Array.isArray(process.env.OLYMPUS_ACTIVE_STACK)
      ? process.env.OLYMPUS_ACTIVE_STACK
      : (process.env.OLYMPUS_ACTIVE_STACK || null);
    const project = process.env.OLYMPUS_ACTIVE_PROJECT || null;

    for (const b of byAgent.values()) {
      // Runtime model wins; fall back to the most recent message's model.
      let model: string | null = null;
      for (const m of b.modelByMessage.values()) model = m;
      if (!model) for (const m of b.providerByMessage.values()) model = m;
      const unattributed = b.agentName === MULTI_KEY;
      appendBenchmarkEntry({
        sessionID,
        taskSignature: b.taskSignature || sessionID,
        stack,
        project,
        model,
        strategy,
        tokens_input: b.tokens_input,
        tokens_output: b.tokens_output,
        tokens_reasoning: b.tokens_reasoning,
        tokens_cache_read: b.tokens_cache_read,
        tokens_cache_write: b.tokens_cache_write,
        spend_usd: b.spend_usd,
        had_error: b.had_error,
        tool_call_count: b.tool_call_count,
        duration_ms: b.lastTs - b.firstTs,
        god: unattributed ? 'multi' : b.agentName,
        demigod: unattributed ? null : b.agentName,
      });
    }
    accumulators.delete(sessionID);
  } catch (err: any) {
    console.error('[olympus:benchmarks] flush failed:', err?.message);
  }
}

/** Best-effort flush of every open window (toggle-off, app shutdown). */
function flushAllBenchmarkAccumulators(): void {
  for (const sessionID of Array.from(accumulators.keys())) flushBenchmarkAccumulator(sessionID);
}

/**
 * Issue #40: hold reasoning that arrives before the first step-start.
 *
 * The stepStarted gate exists to keep the user's own message parts out of the
 * assistant's stream. On some models (DeepSeek R1-style, glm-5.3) the
 * reasoning part lands BEFORE step-start, so the gate threw it away — and
 * because reasoning is emitted once, final-text-only, nothing ever recovered
 * it. The terminal's own comment claimed it "can arrive before step_start",
 * which this path made unreachable.
 *
 * Buffering is capped: an unbounded reasoning prelude would be an
 * unbounded transcript for a model that thinks at length.
 */
const PRE_STEP_REASONING_MAX = 8 * 1024;

function bufferPreStepReasoning(state: { reasoningPre?: string }, text: string): void {
  if (!text) return;
  const held = (state.reasoningPre ?? '') + text;
  state.reasoningPre =
    held.length <= PRE_STEP_REASONING_MAX
      ? held
      : `${held.slice(0, PRE_STEP_REASONING_MAX)}\n\n[reasoning truncated at ${PRE_STEP_REASONING_MAX / 1024} KB]`;
}

/** Emit anything buffered before the step began, then clear it. */
function flushPreStepReasoning(
  state: { reasoningPre?: string },
  sessionId: string | undefined,
  onEvent: (ev: any) => void,
): void {
  const held = state.reasoningPre;
  if (!held) return;
  state.reasoningPre = '';
  onEvent({
    type: 'reasoning',
    timestamp: Date.now(),
    sessionID: sessionId,
    part: { type: 'reasoning', text: held, prelude: true },
  });
}

/** Map a server SSE event / message part into the UI event format. */
function mapEvent(
  ev: any,
  sessionId: string,
  state: {
    textBuf: Map<string, string>;
    textEmitted: Set<string>;
    toolEmitted: Set<string>;
    stepStarted: boolean;
    stepFinished: boolean;
    gotError: boolean;
    userMessageIds: Set<string>;
    lastFrameAt: number;
    /** Issue #40: reasoning that arrived BEFORE the first step-start is held
     *  here instead of being dropped, then flushed with a prelude marker. */
    reasoningPre?: string;
  },
  onEvent: (ev: any) => void,
) {
  const props = ev?.properties;
  const part = props?.part;

  switch (ev?.type) {
    case 'message.updated': {
      // Track user messages so we never echo the user's own text as a
      // `text` event (the one-shot `--format json` path only emits the
      // assistant's response).
      if (props?.sessionID === sessionId && props?.info?.role === 'user' && typeof props?.info?.id === 'string') {
        state.userMessageIds.add(props.info.id);
      }
      // Benchmark: retain the runtime model for this messageID. Note there is
      // no agent name here (see R-C finding above).
      if (props?.sessionID === sessionId && props?.info?.role === 'assistant') {
        noteMessageModel(sessionId, props.info);
      }
      return;
    }
    case 'message.part.delta': {
      if (props?.field === 'text' && typeof props?.partID === 'string') {
        const cur = state.textBuf.get(props.partID) || '';
        state.textBuf.set(props.partID, cur + (typeof props.delta === 'string' ? props.delta : ''));
      }
      return;
    }
    case 'message.part.updated': {
      if (!part || part.sessionID !== sessionId) return;
      mapPart(part, state, onEvent);
      return;
    }
    case 'session.status': {
      if (props?.sessionID !== sessionId) return;
      const st = props.status;
      if (st?.type === 'error') {
        state.gotError = true;
        noteSessionError(sessionId);
        onEvent({
          type: 'error',
          msg: `OpenCode session error: ${st.message || 'unknown'}`,
          raw: props,
          ts: new Date().toISOString(),
        });
        return;
      }
      // R-D: idle is the run-end signal. Previously fell through and returned
      // silently, so nothing ever closed a benchmark window.
      if (st?.type === 'idle') flushBenchmarkAccumulator(sessionId);
      return;
    }
    case 'session.idle': {
      // SDK types.gen.d.ts:413-418 — { sessionID }. The pump's `belongs`
      // filter already admits this frame (properties.sessionID matches).
      // Both this and session.status/idle fire on run end; the accumulator's
      // empty guard makes the second one a no-op.
      if (props?.sessionID !== sessionId) return;
      flushBenchmarkAccumulator(sessionId);
      return;
    }
    case 'permission.asked': {
      // Surface OpenCode permission prompts (the run BLOCKS until one is
      // answered — an unanswered ask previously rendered as an eternal
      // "waiting for Apollo...", freeze class #3 of 2026-09-29).
      if (props?.sessionID !== sessionId) return;
      onEvent({
        type: 'permission_ask',
        requestID: props.id,
        sessionID: sessionId,
        action: props.permission || 'permission',
        patterns: Array.isArray(props.patterns) ? props.patterns : [],
        ts: new Date().toISOString(),
      });
      return;
    }
    case 'permission.replied': {
      onEvent({
        type: 'permission_replied',
        requestID: props?.id || '',
        sessionID: props?.sessionID || '',
        reply: props?.response || props?.reply || '',
        ts: new Date().toISOString(),
      });
      return;
    }
    default:
      return;
  }
}

function mapPart(
  part: any,
  state: {
    textBuf: Map<string, string>;
    textEmitted: Set<string>;
    toolEmitted: Set<string>;
    stepStarted: boolean;
    stepFinished: boolean;
    gotError: boolean;
    userMessageIds: Set<string>;
    lastFrameAt: number;
    /** Issue #40: reasoning that arrived BEFORE the first step-start is held
     *  here instead of being dropped, then flushed with a prelude marker. */
    reasoningPre?: string;
    /** #98: the last in-run error text — captured here so classifyRetry and
     *  the exhaustion guidance see the provider's own words. */
    lastErrorText?: string;
  },
  onEvent: (ev: any) => void,
) {
  const sessionId = part.sessionID;
  const ts = new Date().toISOString();
  switch (part.type) {
    case 'step-start': {
      if (!state.stepStarted) {
        state.stepStarted = true;
        onEvent({ type: 'step_start', timestamp: Date.now(), sessionID: sessionId, part });
        // Issue #40: reasoning that preceded the step surfaces here rather
        // than being lost. Emitted after step_start so the terminal's own
        // ordering is unchanged — the prelude flag marks it as out of order.
        flushPreStepReasoning(state, sessionId, onEvent);
      }
      return;
    }
    case 'step-finish': {
      // Benchmark: fold tokens+cost in BEFORE the emit gate. The gate below is
      // a single boolean per session, so a multi-step turn would otherwise
      // only ever count its first step.
      noteStepFinish(sessionId, part);
      if (!state.stepFinished) {
        state.stepFinished = true;
        onEvent({ type: 'step_finish', timestamp: Date.now(), sessionID: sessionId, part });
      }
      return;
    }
    case 'text': {
      if (state.textEmitted.has(part.id)) return;
      // Gate on stepStarted: only the assistant's response parts are emitted
      // after the step starts. The user's own message parts always arrive
      // BEFORE the step-start part, so this filters out user echoes.
      if (!state.stepStarted) return;
      // Belt-and-braces: never echo a tracked user message as assistant text.
      if (part.messageID && state.userMessageIds.has(part.messageID)) return;
      const accumulated = state.textBuf.get(part.id);
      const text = typeof part.text === 'string' && part.text.length > 0 ? part.text : accumulated;
      if (text) {
        state.textEmitted.add(part.id);
        state.textBuf.delete(part.id);
        onEvent({ type: 'text', timestamp: Date.now(), sessionID: sessionId, part: { type: 'text', text } });
      }
      return;
    }
    case 'tool': {
      const status = part.state?.status;
      const callKey = `${part.id}:${part.callID || 'call'}`;
      const callEmitted = state.toolEmitted.has(callKey + ':call');
      // Benchmark: count each distinct call once, deduped on the same key the
      // emit gate uses so re-sent parts don't inflate the count.
      if (status !== undefined && !state.toolEmitted.has(callKey + ':bench')) {
        state.toolEmitted.add(callKey + ':bench');
        noteToolCall(sessionId);
      }
      if (status === 'running' && !callEmitted) {
        // Emit tool.call on 'running' (the `pending` update has an empty
        // input object — waiting for 'running' gives the real args).
        state.toolEmitted.add(callKey + ':call');
        onEvent({
          type: 'tool.call',
          timestamp: Date.now(),
          sessionID: sessionId,
          part,
          tool: { name: part.tool, input: part.state?.input },
        });
      } else if (status === 'completed' || status === 'error') {
        if (!callEmitted) {
          // Direct completion without a 'running' update — emit the call
          // (with input) so the UI still sees the tool invocation.
          state.toolEmitted.add(callKey + ':call');
          onEvent({
            type: 'tool.call',
            timestamp: Date.now(),
            sessionID: sessionId,
            part,
            tool: { name: part.tool, input: part.state?.input },
          });
        }
        if (!state.toolEmitted.has(callKey + ':resp')) {
          state.toolEmitted.add(callKey + ':resp');
          onEvent({
            type: 'tool.response',
            timestamp: Date.now(),
            sessionID: sessionId,
            part,
            tool: {
              name: part.tool,
              output: part.state?.output,
              error: status === 'error' ? part.state?.error : undefined,
            },
          });
        }
      }
      return;
    }
    case 'error': {
      state.gotError = true;
      // Issue #35: part-level provider errors must poison the benchmark
      // window too, not just the UI — otherwise the flush writes
      // outcome=success for a dead run (observed live on Nvidia 503s).
      noteSessionError(sessionId);
      const msg = part.error?.message || part.text || 'unknown error';
      // #98: the retry classifier must never be starved of the real text.
      state.lastErrorText = msg;
      onEvent({ type: 'error', msg: `OpenCode error: ${msg}`, raw: part, ts });
      return;
    }
    case 'reasoning': {
      // Reasoning tokens (DeepSeek R1-style, glm-5.3, GPT o-series…).
      // Emitted for the reasoning-expansion UI (Phase 4.1.2) — dim italic
      // text below the thinking counter. Final text only: deltas for
      // reasoning arrive as message.part.delta on a reasoning part, which
      // mapEvent buffers per part id in textBuf — surface accumulated
      // text exactly like the 'text' case does.
      if (state.textEmitted.has(part.id)) return;
      if (part.messageID && state.userMessageIds.has(part.messageID)) return;
      const accumulated = state.textBuf.get(part.id);
      const text = typeof part.text === 'string' && part.text.length > 0 ? part.text : accumulated;
      if (!text) return;
      // Issue #40: hold pre-step reasoning instead of dropping it. Only a
      // user echo is discarded outright; the stepStarted gate no longer eats
      // the model's own thinking.
      if (!state.stepStarted) {
        state.textEmitted.add(part.id);
        state.textBuf.delete(part.id);
        bufferPreStepReasoning(state, text);
        return;
      }
      state.textEmitted.add(part.id);
      state.textBuf.delete(part.id);
      onEvent({ type: 'reasoning', timestamp: Date.now(), sessionID: sessionId, part: { type: 'reasoning', text } });
      return;
    }
    // Issue #36: a subtask part IS a god->demigod dispatch. It used to fall to
    // default and vanish, which is why telemetry attributed everything to
    // __multi__ — this Part is the only place the delegated agent is named.
    // Gated like the text cases so user-side echoes stay out; start frame only,
    // completion tracking is a later batch.
    case 'subtask': {
      if (!state.stepStarted) return;
      if (part.messageID && state.userMessageIds.has(part.messageID)) return;
      onEvent({
        type: 'delegation',
        timestamp: Date.now(),
        sessionID: sessionId,
        god: part.agent ?? '',
        description: part.description || part.prompt || '',
      });
      return;
    }
    default:
      return;
  }
}

/**
 * Run one message on the warm server and stream mapped UI events via
 * `onEvent`. Resolves when the turn completes.
 *
 * The /event SSE subscription is opened BEFORE the message POST so no
 * events are missed. After the POST resolves, the subscription is aborted
 * and the message's own parts are fed through the same mapper (deduped) as
 * a belt-and-braces guarantee that text/step events always arrive.
 */
/** #61 (BATCH 13): the warm-run retry plan — one source of truth for the
 * loop, the transcript lines, and the exhaustion guidance.
 * #107 (FLUENCY-1): the plan became class-aware + env-overridable — the
 * 20s hard-coded patience died with the user's 2026-10-09 UAT run (a
 * rush-hour burst outlived retry 2/2 at ~80% through, ~5.5 min lost). The
 * default crescendo buys ~7.5 min of patience — it costs $0 on free;
 * only time. Env overrides: OLYMPUS_RETRY_BACKOFF_MS (comma list, ms —
 * the overload crescendo), OLYMPUS_RETRY_RATE_LIMIT_MS (the fixed 429
 * lane), OLYMPUS_RETRY_JITTER (0–1, default 0.30). */
const DEFAULT_RETRY_BACKOFF_MS = [5_000, 30_000, 120_000, 300_000] as const;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60_000;
const DEFAULT_RETRY_JITTER = 0.30;

export interface RetryPlan {
  /** The overload-class crescendo — pool contention recovers on minute scales, not 15s. */
  backoffMs: readonly number[];
  /** The 429 key-limit lane: fixed, cap-aware, never hammering (the free
   *  tier is ~40 requests/minute PER KEY aggregate — the honest spacing). */
  rateLimitBackoffMs: number;
  /** 1 + backoffMs.length — the initial attempt plus one per backoff entry. */
  maxAttempts: number;
  /** 0–1 fraction — the 0–30% jitter spread on overload-class delays. */
  jitterFraction: number;
}

/** Parse a comma list of non-negative ints; junk entries dropped; empty/junk-only -> the default. */
function parseBackoffList(raw: string | undefined, fallback: readonly number[]): number[] {
  if (typeof raw !== 'string' || !raw.trim()) return [...fallback];
  const parsed = raw.split(',').map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parsed.length > 0 ? parsed : [...fallback];
}

/** #107: resolve the retry plan from the env — the single patience source. */
export function resolveRetryPlan(env: NodeJS.ProcessEnv = process.env): RetryPlan {
  const backoffMs = parseBackoffList(env.OLYMPUS_RETRY_BACKOFF_MS, DEFAULT_RETRY_BACKOFF_MS);
  const rl = Number.parseInt(env.OLYMPUS_RETRY_RATE_LIMIT_MS ?? '', 10);
  const rateLimitBackoffMs = Number.isFinite(rl) && rl >= 0 ? rl : DEFAULT_RATE_LIMIT_BACKOFF_MS;
  const j = Number.parseFloat(env.OLYMPUS_RETRY_JITTER ?? '');
  const jitterFraction = Number.isFinite(j) ? Math.min(1, Math.max(0, j)) : DEFAULT_RETRY_JITTER;
  return { backoffMs, rateLimitBackoffMs, maxAttempts: backoffMs.length + 1, jitterFraction };
}

/** #107: the 0–30% jitter spread — the burst window is wide, not exact.
 * Pure + injectable rand so the fixture asserts the exact transform. */
export function applyRetryJitter(
  ms: number,
  rand: number = Math.random(),
  fraction: number = DEFAULT_RETRY_JITTER,
): number {
  const r = Math.min(1, Math.max(0, rand));
  return Math.round(ms * (1 + fraction * r));
}

/** #107: the patience ledger — what the exhaustion card reports it absorbed. */
export interface RetryLedger {
  waitedMs: number;
  labels: string[];
}

function summarizeLedger(ledger: RetryLedger): string {
  const counts = new Map<string, number>();
  for (const l of ledger.labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  const parts = [...counts.entries()].map(([label, n]) => `${label}${n > 1 ? ` x${n}` : ''}`);
  return `waited ${ledger.waitedMs}ms across ${ledger.labels.length} retries (${parts.join(', ')})`;
}

export async function runWarmMessage(opts: WarmRunOptions): Promise<WarmRunResult> {
  const server = await ensureServer();

  // #99: the first-run ask seam — when THIS cold start created the workspace
  // lane, say so loudly ONCE (the terminal renders log events): where
  // projects land, how to override, and that the repo is never the default.
  if (server.workspaceFresh && server.workspaceDir) {
    opts.onEvent({
      type: 'log',
      msg: `Workspace lane ready at ${server.workspaceDir} — interactive projects land here, never inside the OLYMPUS repo. Set OLYMPUS_WORKSPACE to override.`,
      ts: new Date().toISOString(),
    });
  }

  return withSessionLock(opts.sessionId, async () => {
    // Retry loop (fix d + issue #39): a TRANSPORT failure mid-run (fetch
    // failed / ECONNREFUSED / crash loop) respawns the server; a transient
    // PROVIDER failure (429/5xx — the free-tier pools 503 constantly) must
    // NOT respawn, because the server is alive and healthy. Up to 3 attempts
    // total, 5s then 15s. The session id persists in the shared SQLite DB, so
    // a re-posted message keeps its context.
    //
    // DUPLICATE SIDE-EFFECT RISK: re-posting a turn that already began
    // executing tools can run them TWICE (a bash write, an outbound POST, a
    // file edit). A provider 503 only surfaces at the END of a failed attempt,
    // so partial execution is entirely possible and there is no transactional
    // rollback here. The backoff is long (5s/15s) so the upstream pool can
    // recover, which also widens the window for work already in flight.
    // Retries are best-effort resumption, not a safety guarantee.
    // (#61 BATCH 13: hoisted reference — the module-level constants below
    // keep one source of truth for the loop and the exhaustion guidance.)
    // #107: the plan is now class-aware + env-overridable, resolved fresh
    // per run so env changes apply without a server restart.
    const plan = resolveRetryPlan();
    // #107: the patience ledger — the exhaustion card reports what it
    // waited and which classes it absorbed (the honest card, more honest).
    const ledgerLabels: string[] = [];
    let ledgerWaitedMs = 0;
    // Issue #35/#39: snapshot the poison state BEFORE the loop. A transient
    // failure calls noteSessionError, which flags the window; if a retry then
    // succeeds we must undo that flag or the flush records outcome=error for a
    // turn that actually completed (the #35 invariant, wrongly applied).
    // Read via the raw map, never getBucket(): creating a bucket here would
    // re-arm a zero-activity ghost row (same rule as markSessionError).
    const preRunPoisoned = accumulators.get(opts.sessionId)?.get(MULTI_KEY)?.had_error === true;
    let srv = server;
    for (let attempt = 0; ; attempt++) {
      const result = await runWarmMessageAttempt(srv, opts, attempt === 0);
      // Issue #35/#39: the window outcome must reflect the TURN's final result,
      // and the retries themselves are already visible in the terminal log.
      // Narrowest correct clear: only the poison WE introduced (flag clean
      // before the loop). If the window was already flagged, that error came
      // from an earlier turn and is not ours to erase.
      if (attempt > 0 && result.code === 0 && !result.error) {
        const bucket = accumulators.get(opts.sessionId)?.get(MULTI_KEY);
        const cleared = !!bucket && bucket.had_error && !preRunPoisoned;
        if (cleared) bucket!.had_error = false;
        const n = `${attempt} transient ${attempt === 1 ? 'retry' : 'retries'}`;
        opts.onEvent({
          type: 'log',
          msg: cleared
            ? `Run recovered after ${n} — benchmark window recorded as success`
            : `Run recovered after ${n} — benchmark window still flagged from an earlier error`,
          ts: new Date().toISOString(),
        });
      }
      if (attempt >= plan.maxAttempts - 1) {
        // #61 (BATCH 13): retries exhausted — fail LOUDLY with #56-style
        // explicit guidance naming the alternative free strategies whose
        // keys ARE present. NO cross-strategy auto-switch (no-silent-
        // downgrade doctrine): the guidance names alternatives; the
        // operator switches.
        // #107: the card now carries the patience ledger (what it waited,
        // which classes it absorbed) and the retry count follows the env
        // list — the honest card gets more honest.
        opts.onEvent({
          type: 'log',
          msg: retryExhaustionGuidance(result.error, result.statusCode, {
            waitedMs: ledgerWaitedMs,
            labels: [...ledgerLabels],
            // #R2: the card prints the plan THIS loop resolved (the env
            // override included) — the self-reconciling card.
          }, undefined, plan),
          ts: new Date().toISOString(),
        });
        return result;
      }
      // Aborts never retry (checked before every retry, per the contract).
      if (opts.signal?.aborted) return result;
      const kind = classifyRetry(result);
      if (!kind) return result;
      // #107: class-aware delay — the overload class rides the crescendo
      // (with the 0-30% jitter spread), the 429 class rides the fixed
      // cap-aware lane, transport takes the raw element (the respawn path).
      const base = kind === 'provider-rate-limit'
        ? plan.rateLimitBackoffMs
        : plan.backoffMs[attempt];
      const delay = kind === 'provider-overload'
        ? applyRetryJitter(base, Math.random(), plan.jitterFraction)
        : base;
      // #98: the label must name the FAILURE CLASS, not default every
      // status-less failure to "Transport failure" — an in-stream provider
      // overload (no statusCode, real text threaded) is a PROVIDER error.
      const label = typeof result.statusCode === 'number'
        ? `upstream ${result.statusCode}`
        : kind === 'provider-rate-limit' ? 'Provider rate limit'
          : kind === 'provider-overload' ? 'Provider error' : 'Transport failure';
      // #107: the patience ledger accumulates BEFORE the sleep.
      ledgerLabels.push(label);
      ledgerWaitedMs += delay;
      // Issue #39: visible in the OLYMPUS terminal, never console-only.
      // Emitting BEFORE the sleep also pins firstEventAt in the route's
      // startup timer, so STARTUP_TIMEOUT_MS (action/route.ts:503, 120s —
      // it only fires while firstEventAt === null) cannot kill a retry that is
        // deliberately waiting out a rate limit.
      // #61: transcript line format "retry N/<list-length>: <label>".
      opts.onEvent({
        type: 'log',
        msg: `retry ${attempt + 1}/${plan.backoffMs.length}: ${label} — retrying in ${Math.round(delay / 1000)}s; session context preserved${result.error ? ` [${result.error}]` : ''}`,
        ts: new Date().toISOString(),
      });
      if (kind === 'transport') {
        invalidateServer();
        srv = await ensureServer();
      }
      await sleep(delay);
    }
  });
}

/** Transport-dead signatures (undici "fetch failed", refused/hung sockets). */
const TRANSPORT_DEAD_RE = /fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|other side closed|UND_ERR|network/i;
/** #61: upstream overload signals (opencode's provider_overloaded + the generic form). */
const PROVIDER_OVERLOADED_RE = /provider[ _-]?overloaded|overloaded/i;
/** #61: stream idle timeout — the watchdog class name when an idle kill fires (#62's pre-kill path). */
const STREAM_IDLE_TIMEOUT_RE = /stream[ _-]?idle[ _-]?timeout/i;

/** Provider statuses worth re-posting: rate limits + upstream/gateway faults. */
const RETRYABLE_PROVIDER_STATUS = new Set([429, 500, 502, 503, 504]);
/** Deterministic client/auth failures — a retry just burns the route budget. */
const NEVER_RETRY_STATUS = new Set([400, 401, 403, 404]);
/** Display-string fallback mirroring TRANSPORT_DEAD_RE, used only when no
 *  status was threaded. Kept deliberately tight to avoid matching stray ids. */
const PROVIDER_TRANSIENT_RE = /\b(?:429|500|502|503|504)\b/;
/** Conditions that must never retry regardless of any status code. */
const NEVER_RETRY_RE = /rejected permission|permission to use|aborted|session (?:error|not found)/i;

type RetryClass = 'transport' | 'provider-overload' | 'provider-rate-limit';

/**
 * Classify a failed attempt. The structured `statusCode` wins outright: when it
 * is present and not transient we return null instead of falling through to
 * string parsing, so a 400/401/403/404 can never be rescued by a loose regex.
 *
 * #107 (FLUENCY-1): the provider class SPLIT — 429 is the key-limit lane
 * (fixed cap-aware backoff, never the crescendo); the pool-contention class
 * (503 / provider_overloaded / stream_idle_timeout / 5xx) rides the
 * crescendo. Exported so the #107 fixture asserts the classes directly.
 */
export function classifyRetry(result: WarmRunResult): RetryClass | null {
  if (result.code === 0 || !result.error) return null;
  if (NEVER_RETRY_RE.test(result.error)) return null;
  const sc = result.statusCode;
  if (typeof sc === 'number') {
    if (NEVER_RETRY_STATUS.has(sc)) return null;
    if (sc === 429) return 'provider-rate-limit';
    return RETRYABLE_PROVIDER_STATUS.has(sc) ? 'provider-overload' : null;
  }
  if (TRANSPORT_DEAD_RE.test(result.error)) return 'transport';
  // #107: an in-stream 429 (no statusCode threaded) takes the key-limit
  // lane too — the display string is the only signal.
  if (/\b429\b/.test(result.error)) return 'provider-rate-limit';
  // #61: provider_overloaded and stream_idle_timeout are transient by
  // spec — absorbed by the overload crescendo.
  if (PROVIDER_OVERLOADED_RE.test(result.error)) return 'provider-overload';
  if (STREAM_IDLE_TIMEOUT_RE.test(result.error)) return 'provider-overload';
  return PROVIDER_TRANSIENT_RE.test(result.error) ? 'provider-overload' : null;
}

/**
 * #61 (BATCH 13): the loud exhaustion message. Names the failing strategy,
 * the last error, and — reusing the #56 preflight's key-presence chain —
 * the ALTERNATIVE free strategies whose keys ARE present. Never
 * auto-switches (no-silent-downgrade): guidance only, the operator
 * decides. Exported for the deterministic fixture.
 *
 * #107 (FLUENCY-1): the retry count follows the env list, and the card
 * carries the patience ledger — what it waited, which classes it absorbed.
 *
 * #108 (FLUENCY-1): the key-sight — the card lists every REAL switch
 * available (the full auth census, free AND paid) and names the GO valve
 * explicitly when a GO-plan auth shape is present. The card's job is
 * SIGHT; the no-silent-downgrade rule stands. Optional `authDirs` lets
 * the fixture inject its own auth trees.
 */
export function retryExhaustionGuidance(
  lastError: string | null | undefined,
  lastStatusCode: number | undefined,
  ledger?: RetryLedger,
  authDirs?: string[],
  // #R2 (SMOKE-1, the auditor's rider): the plan the LOOP resolved. Default
  // re-resolves for legacy callers — but the loop passes its own, so the
  // card's printed plan can never diverge from the plan that ran (the
  // FLUENCY-1 live-proof specimen printed the DEFAULT list against an
  // env-shaped ledger: "after 4 retries … across 2 retries … [5,30,120,300]s").
  plan: RetryPlan = resolveRetryPlan(),
): string {
  const strategy = activeStrategyId();
  const errLabel = typeof lastStatusCode === 'number' ? `upstream ${lastStatusCode}` : (lastError || 'unknown error');
  // #108: the full census — every configured lane, free AND paid. The
  // card's alternatives come from the CENSUS (not the preflight harvest):
  // a pool-contention death is a REAL reason to switch providers even when
  // the dying strategy's own key is present (different pools entirely).
  const census = authLaneCensus(authDirs);
  const alternatives: string[] = [];
  if (census.hasOpenRouter) alternatives.push('free-openrouter / free-big-pickle (OpenRouter key present)');
  if (census.hasNvidia) alternatives.push('free-nvidia-build (NVIDIA key present)');
  const altLine = alternatives.length
    ? `  Alternatives whose key IS present: ${alternatives.join('; ')}\n`
    : '  No alternative free strategy has a key present either (per the auth census).\n';
  const lanesLine = census.providerIds.length
    ? `  Lanes with keys present: ${census.providerIds.join(', ')}\n`
    : '  No lane has a key present (per the auth census — both auth.json paths).\n';
  const goLine = census.hasGoValve
    ? '  GO key present: node scripts/apply-strategy.js --strategy go-balanced (premium valve)\n'
    : '';
  // #R2: the self-reconciling card — the headline count IS the ledger count
  // whenever a ledger exists (they describe the same run by construction),
  // and the printed plan is the plan the loop passed in.
  const retryCount = ledger && ledger.labels.length > 0 ? ledger.labels.length : plan.backoffMs.length;
  const lines = [
    `RETRY EXHAUSTED after ${retryCount} retries — strategy '${strategy}' failed with: ${errLabel}.`,
  ];
  if (ledger && ledger.labels.length > 0) {
    // #R2: when any absorbed retry rode the 429 key-limit lane (the FIXED
    // rateLimitBackoffMs, not a crescendo element), the card names it — else
    // the ledger total can never be reconciled against the printed list.
    const hasRateLimited = ledger.labels.some((l) => /429|rate limit/i.test(l));
    const laneNote = hasRateLimited ? `; the 429 key-limit lane: ${plan.rateLimitBackoffMs}ms fixed per retry` : '';
    lines.push(`  Patience ledger: ${summarizeLedger(ledger)} — the plan was [${plan.backoffMs.join(', ')}] ms${laneNote}.`);
  }
  lines.push(
    `  The run stopped. NO strategy was auto-switched (no silent downgrade).`,
    lanesLine.trimEnd(),
    altLine.trimEnd(),
  );
  if (goLine) lines.push(goLine.trimEnd());
  lines.push(
    `  To switch explicitly: node scripts/apply-strategy.js --strategy <id>   (free-openrouter | free-big-pickle | free-nvidia-build)`,
    `  To absorb a rate-limited pool, simply resend — the warm session and its context are preserved.`,
  );
  return lines.join('\n');
}

/**
 * #62 (BATCH 13): class scale for the idle budget. Architectural/complex
 * long-form work gets 3x — the spec-writing step is exactly where PetLove
 * F5/F6 stalled at the default budget.
 */
export function complexityScale(complexity?: string | null): number {
  return complexity === 'complex' || complexity === 'architectural' ? 3 : 1;
}

/**
 * #62 (BATCH 13): the pure watchdog decision, exported for the
 * injected-timestamp fixture (never wall-clock). Decision table:
 *   - silent < warnMs                        → 'quiet'
 *   - warnMs <= silent < stallMs             → 'warn'
 *   - silent >= stallMs, permission pending  → 'permission-pending'
 *     (legitimate human wait: DISTINCT renderer-keyed state, never nudged,
 *     never killed)
 *   - silent >= stallMs, no permission wait  → 'nudge-abort' (the auto-
 *     continue: abort with stream_idle_timeout; the #61 retry layer re-
 *     posts against the same warm session)
 */
export function watchdogDecision(args: {
  silentForMs: number;
  warnMs: number;
  stallMs: number;
  permissionPending: boolean;
}): 'quiet' | 'warn' | 'permission-pending' | 'nudge-abort' {
  if (args.silentForMs >= args.stallMs) {
    return args.permissionPending ? 'permission-pending' : 'nudge-abort';
  }
  if (args.silentForMs >= args.warnMs) return 'warn';
  return 'quiet';
}

/**
 * #65 (BATCH 13): decision-checkpoint census. Detects a tool call writing
 * (or appending) to a `.decisions.md` checkpoint file — any of the shapes
 * the gods use: write/edit with a filePath, or bash with an
 * append/tee/redirect mentioning the path. Pure; exported for the fixture.
 */
export function checkpointWriteTarget(toolName: string, args: any): string | null {
  const name = String(toolName || '').toLowerCase();
  const a = args && typeof args === 'object' ? args : {};
  const candidate = (s: unknown) => (typeof s === 'string' && /\.decisions\.md$/.test(s) ? s : null);
  if (name === 'write' || name === 'edit') {
    return candidate(a.filePath) ?? candidate(a.file_path) ?? candidate(a.path);
  }
  if (name === 'bash') {
    const cmd = String(a.command ?? '');
    const m = cmd.match(/([\w./-]+\.decisions\.md)/);
    if (m && /(>>|tee|-a\s|append)/.test(cmd)) return m[1];
  }
  return null;
}

/**
 * One warm-message attempt. `allowRetry` reserved for future use; the retry
 * decision lives in runWarmMessage's loop (which respawns the server before
 * re-invoking this).
 */
async function runWarmMessageAttempt(
  server: ServerInfo,
  opts: WarmRunOptions,
  _allowRetry: boolean,
): Promise<WarmRunResult> {
  // NOTE (fix d revision, 2026-09-29): the original pre-send health check
  // (2.5s probe → invalidateServer → ensureServer) was REMOVED after live
  // testing: a freshly-booted serve's first requests are slow (DB open,
  // session init), the 2.5s probe false-negatived, and ensureServer's
  // stale-owner kill terminated healthy serves — a respawn thrash that
  // burned the route's 120s budget. The mid-run transport-failure retry in
  // runWarmMessage (TRANSPORT_DEAD_RE) covers the serve-died-mid-run case:
  // the POST rejects, the loop respawns via ensureServer (whose fix-a now
  // reaps the dead owner) and re-posts once. Orphan reaping (fix a+b)
  // prevents the crash-loop that caused the original "fetch failed".

  const state = {
    textBuf: new Map<string, string>(),
    textEmitted: new Set<string>(),
    toolEmitted: new Set<string>(),
    stepStarted: false,
    stepFinished: false,
    gotError: false,
    // #98 (UAT-BUILD-1 Batch B): the LAST in-run error text, captured at
    // every ingestion path (in-stream error parts + message-level
    // info.error + non-2xx POSTs). Threaded into the attempt's return so
    // classifyRetry sees the REAL provider message — the 2026-10-07 UAT
    // death was an UnknownError "Service temporarily overloaded" collapsed
    // to the generic 'OpenCode reported an error during the run', which
    // matches no retry regex: no retry, no backoff, no guidance, bare
    // exit -1.
    lastErrorText: '',
    userMessageIds: new Set<string>(),
    reasoningPre: '',
    // Liveness: the /event pump stamps every received frame here (BEFORE
    // session filtering — any frame proves the feed is alive). Drives the
    // silence watchdog.
    lastFrameAt: Date.now(),
    // #62: starts false; the pump sets it when the latest visible part is a
    // tool awaiting permission approval, clears it on any other event.
    permissionPending: false,
  };
    let receivedEvents = false;
    let postStarted = false;
    let maxTimedOut = false;
    // Issue #39: the provider HTTP status behind this attempt's failure, so
    // classifyRetry can prefer a structured code over display-string parsing.
    let providerStatus: number | undefined;

    const eventCtrl = new AbortController();
    const postCtrl = new AbortController();
    const outerSignal = opts.signal;

    // #60 (BATCH 13): bound the server-side run after the SSE client is
    // gone. Client abort no longer only stops WATCHING — after a grace
    // window it POSTs /session/<id>/abort so the opencode serve cancels the
    // in-flight prompt (probe B5 kept executing 25+ min past its deadline:
    // self-approved design doc, built artifacts, two review dispatches, all
    // unobserved). Attended runs get the ~10s deliberate-detachment grace
    // (OLYMPUS_ABORT_GRACE_MS); unattended_mode runs (the [OLYMPUS
    // UNATTENDED MODE] marker in the run text) abort immediately — no human
    // is coming back. STOP agency is untouched for CONNECTED clients: only
    // client-gone runs become killable.
    const ABORT_GRACE_MS = (opts.text || '').includes('[OLYMPUS UNATTENDED MODE]')
      ? 0
      : Number(process.env.OLYMPUS_ABORT_GRACE_MS || 10_000);
    let clientGoneAt: number | null = null;
    let serverAbortSent = false;
    const sendServerAbort = async () => {
      if (serverAbortSent) return;
      serverAbortSent = true;
      try {
        const auth = server.authed ? server.password : null;
        await apiFetch(server.port, auth, `/session/${opts.sessionId}/abort`, { method: 'POST' }, 5_000);
      } catch {
        // Best-effort: if the serve is already gone, there is nothing to kill.
      }
    };
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    // Kill order is load-bearing (#60 fixture): AWAIT the server-side abort
    // BEFORE aborting the local controllers, so the /session/<id>/abort has
    // provably landed (and been counted by any watcher) before the attempt
    // returns — no fire-and-forget race.
    const killServerSide = async () => {
      await sendServerAbort();
      eventCtrl.abort();
      postCtrl.abort();
    };
    const onAbort = () => {
      if (clientGoneAt === null && outerSignal?.aborted) {
        // Client-gone: grace first, then kill the server-side run.
        clientGoneAt = Date.now();
        if (ABORT_GRACE_MS <= 0) {
          void killServerSide();
          return;
        }
        graceTimer = setTimeout(() => { void killServerSide(); }, ABORT_GRACE_MS);
        return;
      }
      // Watchdog / max-runtime aborts (client still connected or already gone):
      // stop watching immediately; the server-side kill only matters for
      // client-gone runs (the connected client still owns its session).
      eventCtrl.abort();
      postCtrl.abort();
    };
    if (outerSignal) {
      if (outerSignal.aborted) onAbort();
      else outerSignal.addEventListener('abort', onAbort, { once: true });
    }

    const maxTimer = setTimeout(() => {
      maxTimedOut = true;
      onAbort();
    }, opts.maxRuntimeMs ?? 10 * 60_000);

    // Silence watchdog (#62, BATCH 13): if NO frame of any kind arrives from
    // the /event feed for SILENCE_WARN_MS, warn visibly; if it stays silent
    // for SILENCE_STALL_MS, inject the auto-continue nudge — the abort with
    // a stream_idle_timeout error that the #61 retry layer turns into an
    // automated same-session re-post (PetLove F5/F6: manual "Continue!"
    // always recovered; this automates it). If the latest visible part is a
    // tool awaiting PERMISSION, the run is in a legitimate human wait: emit a
    // DISTINCT permission_pending event (renderer-keyed), never nudge, never
    // kill — the MAX_RUNTIME timer remains the only bound. The idle budget is
    // CLASS-SCALED: architectural/complex long-form work gets ~3x (the
    // spec-writing step is exactly where F5/F6 stalled).
    const SILENCE_SCALE = complexityScale(opts.complexity);
    const SILENCE_WARN_MS = Number(process.env.OLYMPUS_SILENCE_WARN_MS || 60_000) * SILENCE_SCALE;
    const SILENCE_STALL_MS = Number(process.env.OLYMPUS_SILENCE_STALL_MS || 150_000) * SILENCE_SCALE;
    let warnedSilence = false;
    let stalledNotified = false;
    let idleNudged = false;
    let idleTimedOut = false;
    const silenceTimer = setInterval(() => {
      if (postStarted === false || eventCtrl.signal.aborted) return;
      const decision = watchdogDecision({
        silentForMs: Date.now() - state.lastFrameAt,
        warnMs: SILENCE_WARN_MS,
        stallMs: SILENCE_STALL_MS,
        permissionPending: state.permissionPending,
      });
      if (decision === 'permission-pending') {
        if (!stalledNotified) {
          stalledNotified = true;
          deliver({
            type: 'permission_pending',
            msg: `⏸ Awaiting your permission approval (${Math.round((Date.now() - state.lastFrameAt) / 1000)}s) — the run is paused on a permission ask, not stalled. Approve or reject in the terminal; this wait is never auto-killed.`,
            ts: new Date().toISOString(),
          });
        }
        return;
      }
      if (decision === 'nudge-abort' && !idleNudged) {
        idleNudged = true;
        idleTimedOut = true;
        deliver({
          type: 'log',
          msg: `⚠ No stream activity for ${Math.round((Date.now() - state.lastFrameAt) / 1000)}s — sending the auto-continue nudge (#62): aborting this attempt with stream_idle_timeout; the retry layer re-posts against the same warm session automatically.`,
          ts: new Date().toISOString(),
        });
        onAbort();
        return;
      }
      if (decision === 'warn' && !warnedSilence) {
        warnedSilence = true;
        deliver({
          type: 'log',
          msg: `No stream activity for ${Math.round((Date.now() - state.lastFrameAt) / 1000)}s — Apollo may be thinking, waiting on a permission, or the provider may be stalled. Watching…`,
          ts: new Date().toISOString(),
        });
      }
      if (decision === 'quiet') { warnedSilence = false; stalledNotified = false; }
    }, 5_000);

    // The wrapped onEvent also marks that we delivered at least one event.
    // Fix A: every mapped event in the run funnels through here, so this is
    // the one place that can census the run without threading counters
    // through mapPart/openEventFeed. readCount is tracked separately because
    // "read one file then went quiet" is the exact stall signature we care
    // about — it is what the old "Task completed (no output)" masked.
    let toolCount = 0;
    let readCount = 0;
    // #65: decision-checkpoint writes this run (census surface).
    let checkpointWrites = 0;
    // Prime the policy store with the legacy path allowlist so the first
    // permission ask of a cold process seeds the file with the vault rule.
    loadPermissions({ pathAlwaysPrefixes: AUTO_APPROVE_PREFIXES });
    const deliver = (ev: any) => {
      // Settle asks the policy store already answers so the run is never
      // parked on a decision the user made by policy. Fix C: the
      // client used to render the card anyway AND send its own reply, so the
      // second reply 502'd ("Permission reply failed") for a permission that
      // had in fact been granted (issue #17).
      //
      // The reply is only reported as auto-approved once the POST has actually
      // succeeded. respondToPermission resolves false on a non-2xx and rejects
      // on timeout, so if it fails we fall through to the normal path and the
      // user gets the real card plus the real error — the same honesty Fix A
      // established for empty runs. Never delivered in its own right, so it
      // never sets receivedEvents on its own.
      if (ev.type === 'permission_ask') {
        // Issue #41: the policy store owns the ruling. `always` and `denied`
        // are decided on the server so the client never renders a card for a
        // decision the user already made — and `ask` falls through to the
        // normal path untouched.
        const verdict = decidePermission(ev.action, ev.patterns || []);
        if (verdict !== 'ask') {
          const reply = verdict === 'always' ? 'once' : 'reject';
          respondToPermission(ev.requestID, reply)
            .then(ok => {
              if (eventCtrl.signal.aborted) return;
              if (ok) {
                // Stamp only now: the client suppresses the card and sends no
                // reply of its own when it sees this flag.
                ev.autoApproved = true;
                ev.policyVerdict = verdict;
                opts.onEvent(ev);
                // Issue #32 (complaint 4): the forwarded event above is the ONE
                // line for this ruling — the client renders it from
                // ev.autoApproved. A parallel `log` event here used to produce a
                // second line in the same stream. Do not re-add it.
              } else {
                // The ruling failed — surface the ask so the user can decide.
                opts.onEvent(ev);
                opts.onEvent({ type: 'error', msg: `[permission] policy (${verdict}) failed for ${ev.action} — please reply below`, ts: new Date().toISOString() });
              }
            })
            .catch(() => {
              if (eventCtrl.signal.aborted) return;
              opts.onEvent(ev);
              opts.onEvent({ type: 'error', msg: `[permission] policy (${verdict}) failed for ${ev.action} — please reply below`, ts: new Date().toISOString() });
            });
          return;
        }
      }
      if (!eventCtrl.signal.aborted || ev.type === 'error') {
        if (ev.type === 'tool.call') {
          toolCount++;
          const name = String(ev.tool?.name || ev.name || '').toLowerCase();
          if (name === 'read' || name === 'readfile' || name === 'read_file') readCount++;
          // #65: census counts decision-checkpoint writes — the durable state
          // the resume path replays from (PetLove FC-5: 6 turns, 0 files).
          const ckpt = checkpointWriteTarget(name, ev.tool?.input ?? ev.tool?.args ?? ev.args);
          if (ckpt) {
            checkpointWrites++;
            opts.onEvent({
              type: 'log',
              msg: `[olympus-run] checkpoint_write #${checkpointWrites}: ${ckpt}`,
              ts: new Date().toISOString(),
            });
          }
        }
        receivedEvents = true;
        opts.onEvent(ev);
      }
    };

    try {
      // 1. Subscribe to the global event feed BEFORE posting the message.
      //    openEventFeed resolves once the SSE connection is established
      //    (fetch resolved) — the message POST is only sent afterwards, so
      //    no events can be missed (the server starts emitting for a message
      //    only once it receives the POST).
      const closeFeed = await openEventFeed(server, opts.sessionId, state, deliver, eventCtrl.signal);

      // 2. Post the message (waits for the full turn).
      const auth = server.authed ? server.password : null;
      postStarted = true;
      // Issue #32 (complaint 1: 66s of silence between "Routing to Apollo..."
      // and opencode actually starting). Emitted at the moment the POST goes
      // out, so the gap is explained rather than blank. Agent stands in for
      // the model here: the model id only arrives later on message.updated,
      // long after this line is the only thing the user can see.
      opts.onEvent({
        type: 'log',
        msg: `▶ dispatching to warm session ${String(opts.sessionId).slice(-8)} (${opts.agent || 'apollo'})`,
        ts: new Date().toISOString(),
      });
      // Benchmark: remember this turn's task signature (raw text stays in
      // memory; only its sha256 prefix is ever written to the log). Recorded
      // before the post so an immediate crash still leaves a flushable row.
      setBenchmarkTaskSignature(opts.sessionId, opts.text);
      const res = await apiFetch(
        server.port,
        auth,
        `/session/${opts.sessionId}/message`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Prepend the authoritative strategy block so the model never has
            // to infer the active strategy from model IDs (it hallucinated
            // "free-nvidia-build" / "via OpenRouter" before this existed).
            parts: [{ type: 'text', text: `${buildStrategyContextBlock()}\n\n${opts.text}` }],
            ...(opts.agent ? { agent: opts.agent } : {}),
          }),
        },
        // The message itself can legitimately take minutes; the maxTimer
        // above is the real bound. Use a generous per-call timeout.
        (opts.maxRuntimeMs ?? 10 * 60_000) + 15_000,
        postCtrl.signal,
      );

      let info: any = null;
      let parts: any[] = [];
      if (res.ok) {
        const data: any = await res.json().catch(() => null);
        info = data?.info ?? null;
        parts = Array.isArray(data?.parts) ? data.parts : [];
        // Belt and braces: feed the message's own parts through the mapper.
        // The response is the ASSISTANT message by construction — mark the
        // step as started so text parts aren't suppressed by the gate.
        state.stepStarted = true;
        for (const p of parts) mapPart(p, state, deliver);
        if (info?.finish === 'error') {
          state.gotError = true;
          noteSessionError(opts.sessionId);
        }
        // Surface provider-level APIErrors stored on the assistant message
        // (e.g. the fireworks upstream rejecting cache params with HTTP 400).
        // opencode records these on message.error and completes the run with
        // zero parts — previously invisible (terminal showed "Task completed.").
        const infoErr = info?.error;
        if (infoErr) {
          const d = infoErr?.data ?? {};
          const message = d?.message || infoErr?.message || infoErr?.name || 'unknown API error';
          // #98: capture the REAL text ALWAYS — even when the UI deliver below
          // is deduped away (a finish==='error' message already flagged
          // gotError at :1804 and would otherwise skip this block entirely,
          // starving the retry classifier a second way).
          state.lastErrorText = message;
          // Issue #39: keep the structured status; the display string below is
          // lossy (it drops the code when a message is present).
          if (typeof d?.statusCode === 'number') providerStatus = d.statusCode;
          if (!state.gotError) {
            state.gotError = true;
            noteSessionError(opts.sessionId);
            const status = d?.statusCode != null ? `[${d.statusCode}] ` : '';
            deliver({ type: 'error', msg: `OpenCode error: ${status}${message}`, raw: info, ts: new Date().toISOString() });
          }
        }
      } else {
        // Non-2xx — surface a clear error.
        let msg = `OpenCode request failed (HTTP ${res.status})`;
        providerStatus = res.status; // Issue #39: structured, captured before the
        // body overwrite below discards the code from the display string.
        try {
          const body: any = await res.json();
          msg = body?.data?.message || body?.message || body?.error?.message || msg;
        } catch {}
        state.gotError = true;
        state.lastErrorText = msg; // #98: the classifier + guidance get the real text.
        noteSessionError(opts.sessionId);
        deliver({ type: 'error', msg: `OpenCode error: ${msg}`, raw: null, ts: new Date().toISOString() });
      }

      // 3. Final safety net: if the event feed missed everything (e.g. a
      //    very fast turn) and no text arrived, pull the session history
      //    and synthesize from the newest assistant message.
      if (state.textEmitted.size === 0 && !state.gotError) {
        await synthesizeFromHistory(server, opts.sessionId, state, deliver);
      }

      // Fix A: no_output telemetry. A code-0 run that produced no text and no
      // error is a silent failure — the model stalled. Emit it as a log line
      // so the transcript carries the stall's shape instead of the UI merely
      // not saying "Task completed".
      //
      // MUST run before the eventCtrl.abort() below: deliver() is a no-op
      // once the feed is aborted (except for errors), so a log emitted after
      // that point would be silently dropped.
      if (!state.gotError && state.textEmitted.size === 0) {
        deliver({
          type: 'log',
          msg: `[olympus-run] no_output: read_count=${readCount} tool_count=${toolCount} text_count=${state.textEmitted.size} checkpoint_writes=${checkpointWrites}`,
          ts: new Date().toISOString(),
        });
      }

      // Issue #40: if the turn ended with no step-start (fast model, or a
      // feed that dropped it), the held reasoning would never flush. Emit it
      // now, before the feed closes — after eventCtrl.abort() deliver() is a
      // no-op and the thought would be lost for good.
      flushPreStepReasoning(state, opts.sessionId, deliver);

      // 4. Close the feed subscription.
      await sleep(300);
      eventCtrl.abort();
      try { await closeFeed(); } catch {}

      if (state.gotError) {
        // #98: the REAL in-run error text wins; the generic string stays only
        // as the last-resort fallback. classifyRetry sees the provider's own
        // words ("Service temporarily overloaded" → PROVIDER_OVERLOADED_RE)
        // and the existing #61 engine takes over — retries with backoff, then
        // the loud exhaustion guidance. The code:1 + statusCode contracts are
        // unchanged.
        return { code: 1, sessionId: opts.sessionId, receivedEvents, postStarted, error: state.lastErrorText || 'OpenCode reported an error during the run', statusCode: providerStatus };
      }
      return { code: 0, sessionId: opts.sessionId, receivedEvents, postStarted };
    } catch (err: any) {
      eventCtrl.abort();
      // Server-level failure (before the message was posted) — the serve
      // may have crashed. Drop the cached state so the next request
      // re-probes and respawns if needed.
      if (!postStarted) invalidateServer();
      if (outerSignal?.aborted) {
        // #60: client-gone — the server-side prompt was (or is being) killed
        // after the grace window; carry the run_abandoned telemetry payload.
        if (clientGoneAt !== null) {
          return {
            code: -1,
            sessionId: opts.sessionId,
            receivedEvents,
            postStarted,
            error: 'aborted',
            abandoned: {
              session_id: opts.sessionId,
              last_event_ts: new Date(state.lastFrameAt).toISOString(),
              grace_ms: ABORT_GRACE_MS,
            },
          };
        }
        return { code: -1, sessionId: opts.sessionId, receivedEvents, postStarted, error: 'aborted' };
      }
      if (idleTimedOut) {
        // #62: the auto-continue nudge's abort — a retryable class (#61's
        // classifyRetry matches stream_idle_timeout), so the retry layer
        // re-posts against the same warm session automatically.
        return {
          code: 1,
          sessionId: opts.sessionId,
          receivedEvents,
          postStarted,
          error: `stream_idle_timeout: no visible stream activity for ${Math.round(SILENCE_STALL_MS / 1000)}s${opts.complexity ? ` (class '${opts.complexity}', budget scaled ${SILENCE_SCALE}x)` : ''} — auto-continue nudge fired; the retry layer re-posts this run`,
        };
      }
      if (maxTimedOut) {
        return {
          code: 1,
          sessionId: opts.sessionId,
          receivedEvents,
          postStarted,
          error: `OpenCode exceeded the maximum runtime of ${((opts.maxRuntimeMs ?? 10 * 60_000) / 60000).toFixed(0)} minutes`,
        };
      }
      return {
        code: 1,
        sessionId: opts.sessionId,
        receivedEvents,
        postStarted,
        error: err?.message || String(err),
        // Issue #39: fetch/APIError surfaces often carry a numeric status.
        statusCode: typeof err?.statusCode === 'number' ? err.statusCode : typeof err?.status === 'number' ? err.status : undefined,
      };
    } finally {
      clearTimeout(maxTimer);
      clearInterval(silenceTimer);
      if (graceTimer) clearTimeout(graceTimer);
      if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
    }
}

/**
 * Open GET /event and pump mapped events for `sessionId` into `onEvent`.
 * Resolves once the SSE connection is ESTABLISHED (fetch resolved) with a
 * close() function that stops the pump and waits for it to wind down.
 */
async function openEventFeed(
  server: ServerInfo,
  sessionId: string,
  state: {
    textBuf: Map<string, string>;
    textEmitted: Set<string>;
    toolEmitted: Set<string>;
    stepStarted: boolean;
    stepFinished: boolean;
    gotError: boolean;
    userMessageIds: Set<string>;
    lastFrameAt: number;
    /** #62: the latest visible part is a tool awaiting permission approval. */
    permissionPending: boolean;
    /** Issue #40: reasoning that arrived BEFORE the first step-start is held
     *  here instead of being dropped, then flushed with a prelude marker. */
    reasoningPre?: string;
  },
  onEvent: (ev: any) => void,
  signal: AbortSignal,
): Promise<() => Promise<void>> {
  const auth = server.authed ? server.password : null;
  const headers = new Headers();
  if (auth) headers.set('Authorization', basicAuth(auth));
  const res = await fetch(`http://127.0.0.1:${server.port}/event`, {
    headers,
    signal,
    cache: 'no-store',
  });
  if (!res.ok || !res.body) {
    throw new Error(`event feed failed (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let closing = false;
  let closeResolve!: () => void;
  const closedPromise = new Promise<void>((r) => { closeResolve = r; });

  const pump = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const ev = JSON.parse(payload);
            // Liveness: only SESSION-OWNED frames count. The feed is
            // process-global — heartbeats (~20s), plugin bursts, and other
            // sessions' traffic would otherwise mask a dead run.
            const belongs =
              ev?.properties?.sessionID === sessionId ||
              (ev?.type === 'message.part.updated' && ev?.properties?.part?.sessionID === sessionId);
            if (belongs) {
              // B2: liveness means VISIBILITY, not frame arrival. Stamping
              // lastFrameAt here (before mapping) kept the silence clock
              // alive with frames that map to nothing the user can see:
              // message.part.delta buffers and returns (:720), re-emitted
              // text/reasoning parts are dropped by the textEmitted gate
              // (:809, :883), tool + step churn is deduped (:828, :853, :802)
              // and non-error session.status frames return silently (:733).
              // During a real stall opencode keeps streaming exactly those
              // invisible frames, so the watchdog could never reach its own
              // threshold. Stamp only when a mapped event actually reaches the
              // client.
              //
              // Deliberately NOT done inside deliver(): synthetic events (this
              // watchdog's own WARN/STALL lines, the auto-approve notice) flow
              // through deliver and would postpone the STALL countdown right
              // after the WARN fired.
              mapEvent(ev, sessionId, state, (mapped) => {
                state.lastFrameAt = Date.now();
                // #62 (BATCH 13): permission-pending detection — the LATEST
                // visible part being a tool in 'pending' state means the run
                // is waiting for the HUMAN's permission approval: a legitimate
                // wait, not a stall. Any other event clears the flag.
                if (mapped?.type === 'tool_use' || mapped?.type === 'tool_call' || mapped?.part?.type === 'tool') {
                  const st = mapped.part?.state?.status ?? mapped.part?.status;
                  state.permissionPending = st === 'pending';
                } else {
                  state.permissionPending = false;
                }
                onEvent(mapped);
              });
            }
          } catch {
            // Non-JSON data line — ignore.
          }
        }
      }
    } catch {
      // Aborted or connection error — the caller is responsible for
      // deciding whether that matters.
    } finally {
      try { reader.releaseLock(); } catch {}
      closeResolve();
    }
  })();

  return async () => {
    if (closing) { await closedPromise; return; }
    closing = true;
    try { await reader.cancel(); } catch {}
    await closedPromise;
  };
}

/**
 * Last-resort synthesis: pull the session's message history and feed the
 * newest assistant message's parts through the mapper. Covers the rare case
 * where the event feed delivered nothing for a very fast turn.
 */
async function synthesizeFromHistory(
  server: ServerInfo,
  sessionId: string,
  state: {
    textBuf: Map<string, string>;
    textEmitted: Set<string>;
    toolEmitted: Set<string>;
    stepStarted: boolean;
    stepFinished: boolean;
    gotError: boolean;
    userMessageIds: Set<string>;
    lastFrameAt: number;
    /** Issue #40: reasoning that arrived BEFORE the first step-start is held
     *  here instead of being dropped, then flushed with a prelude marker. */
    reasoningPre?: string;
  },
  onEvent: (ev: any) => void,
) {
  try {
    const auth = server.authed ? server.password : null;
    const res = await apiFetch(server.port, auth, `/session/${sessionId}/message`, {}, 10_000);
    if (!res.ok) return;
    const messages: any[] = await res.json().catch(() => []);
    if (!Array.isArray(messages)) return;
    // Newest assistant message (the one we just generated).
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.info?.role !== 'assistant') continue;
      const parts = Array.isArray(m?.parts) ? m.parts : [];
      state.stepStarted = true;
      for (const p of parts) mapPart(p, state, onEvent);
      return;
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// App-exit cleanup
// ---------------------------------------------------------------------------

let cleanupRegistered = false;

function registerExitCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  process.on('exit', () => {
    cleanupServer();
  });
}

registerExitCleanup();

/**
 * Best-effort flush on process exit (R-D). Registered at module load so it
 * covers any exit path — including one the explicit cleanup path misses.
 * `once` + a synchronous writer keep this from racing the exit itself.
 */
let exitFlushRegistered = false;
function registerBenchmarkExitFlush(): void {
  if (exitFlushRegistered) return;
  exitFlushRegistered = true;
  const flush = () => {
    try {
      flushAllBenchmarkAccumulators();
    } catch {}
  };
  process.once('exit', flush);
  process.once('SIGINT', flush);
  process.once('SIGTERM', flush);
  process.once('beforeExit', flush);
}
registerBenchmarkExitFlush();

/**
 * Flush any open benchmark windows. Called when benchmark recording is
 * toggled off so the in-flight conversation's counters are not lost — without
 * this, disabling recording silently discards everything accumulated so far.
 */
export function flushBenchmarkWindows(): void {
  flushAllBenchmarkAccumulators();
}
