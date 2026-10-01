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
import { spawnOpencode } from '@/lib/opencode-spawn';
import { loadBenchmarkConfig, appendBenchmarkEntry } from '@/lib/benchmarks';
import { LLM_STRATEGIES } from '@/lib/model-strategies';
import { getVaultRoot } from '@/lib/vault-root';

const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');
// Vault root — mirrors src/app/api/olympus/upload/route.ts. Used by the
// permission auto-approval allowlist below.
const VAULT_ROOT = getVaultRoot();
// Permission auto-approval allowlist (freeze-class fix 2026-09-29): OpenCode
// routes reads OUTSIDE the project root through `external_directory: ask`,
// which permanently blocks the run when no client answers. Vault paths are
// always user-owned, so asks whose patterns all start with the vault root
// are approved automatically ("once"), and the approval is logged in the
// terminal. Override with OLYMPUS_AUTO_APPROVE_GLOBS (comma-separated
// absolute prefixes; empty string disables auto-approval).
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
  try {
    const r = await apiFetch(port, null, '/config', {}, SERVER_PROBE_TIMEOUT_MS);
    if (r.ok) return { ok: true, authed: false };
    // 401 = a password-protected opencode serve we can't authenticate to
    // (an orphan whose password was lost). Callers use this to adopt-or-kill.
    if (r.status === 401) return { ok: false, authed: false, status: 401 };
    timedOut = false;
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
    return serverPromise.then((info) => ({ ...info, warm: true }));
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
  const child = spawnOpencode(
    ['serve', '--port', String(port)],
    {
      extraEnv: {
        OPENCODE_SERVER_PASSWORD: password,
        // Tell the OLYMPUS overlay where the OLYMPUS API lives (heartbeat,
        // live.jsonl capture, etc.). Electron runs Next on PORT (3737); the
        // overlay's own default (http://127.0.0.1:3000) points nowhere.
        OLYMPUS_API_BASE: process.env.OLYMPUS_API_BASE
          || (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : 'http://127.0.0.1:3737'),
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
      return { port, warm: false, password, authed: probe.authed };
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
      if (!state.stepStarted) return;
      if (part.messageID && state.userMessageIds.has(part.messageID)) return;
      const accumulated = state.textBuf.get(part.id);
      const text = typeof part.text === 'string' && part.text.length > 0 ? part.text : accumulated;
      if (text) {
        state.textEmitted.add(part.id);
        state.textBuf.delete(part.id);
        onEvent({ type: 'reasoning', timestamp: Date.now(), sessionID: sessionId, part: { type: 'reasoning', text } });
      }
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
export async function runWarmMessage(opts: WarmRunOptions): Promise<WarmRunResult> {
  const server = await ensureServer();

  return withSessionLock(opts.sessionId, async () => {
    // Retry loop (fix d): one transparent retry when the serve dies with a
    // TRANSPORT failure mid-run (fetch failed / ECONNREFUSED / crash loop).
    // The session id persists in the shared SQLite DB, so the re-posted
    // message keeps its context. Aborts and API-level errors never retry.
    let srv = server;
    for (let attempt = 0; ; attempt++) {
      const result = await runWarmMessageAttempt(srv, opts, attempt === 0);
      const retryable =
        attempt === 0 &&
        !opts.signal?.aborted &&
        !!result.error &&
        result.code !== 0 &&
        TRANSPORT_DEAD_RE.test(result.error);
      if (!retryable) return result;
      console.log(`[opencode-session] Warm server transport failure (${result.error}) — respawning + retrying message once`);
      invalidateServer();
      srv = await ensureServer();
    }
  });
}

/** Transport-dead signatures (undici "fetch failed", refused/hung sockets). */
const TRANSPORT_DEAD_RE = /fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|other side closed|UND_ERR|network/i;

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
    userMessageIds: new Set<string>(),
    // Liveness: the /event pump stamps every received frame here (BEFORE
    // session filtering — any frame proves the feed is alive). Drives the
    // silence watchdog.
    lastFrameAt: Date.now(),
  };
    let receivedEvents = false;
    let postStarted = false;
    let maxTimedOut = false;

    const eventCtrl = new AbortController();
    const postCtrl = new AbortController();
    const outerSignal = opts.signal;

    const onAbort = () => {
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

    // Silence watchdog (freeze-class fix 2026-09-29): if NO frame of any
    // kind arrives from the /event feed for SILENCE_WARN_MS, warn visibly;
    // if it stays silent for SILENCE_STALL_MS, tell the user explicitly that
    // the run is stalled and how to abort. Never auto-kills — the user keeps
    // STOP agency (a wrongly-terminated run loses all progress).
    const SILENCE_WARN_MS = Number(process.env.OLYMPUS_SILENCE_WARN_MS || 60_000);
    const SILENCE_STALL_MS = Number(process.env.OLYMPUS_SILENCE_STALL_MS || 150_000);
    let warnedSilence = false;
    let stalledNotified = false;
    const silenceTimer = setInterval(() => {
      if (postStarted === false || eventCtrl.signal.aborted) return;
      const silent = Date.now() - state.lastFrameAt;
      if (silent >= SILENCE_STALL_MS && !stalledNotified) {
        stalledNotified = true;
        deliver({
          type: 'log',
          msg: `⚠ No stream activity for ${Math.round(silent / 1000)}s — the run looks STALLED (pending permission, provider hang, or dead tool). If this persists, click STOP and resend; nothing is being lost.`,
          ts: new Date().toISOString(),
        });
      } else if (silent >= SILENCE_WARN_MS && !warnedSilence) {
        warnedSilence = true;
        deliver({
          type: 'log',
          msg: `No stream activity for ${Math.round(silent / 1000)}s — Apollo may be thinking, waiting on a permission, or the provider may be stalled. Watching…`,
          ts: new Date().toISOString(),
        });
      }
      if (silent < SILENCE_WARN_MS / 2) { warnedSilence = false; stalledNotified = false; }
    }, 5_000);

    // The wrapped onEvent also marks that we delivered at least one event.
    // Fix A: every mapped event in the run funnels through here, so this is
    // the one place that can census the run without threading counters
    // through mapPart/openEventFeed. readCount is tracked separately because
    // "read one file then went quiet" is the exact stall signature we care
    // about — it is what the old "Task completed (no output)" masked.
    let toolCount = 0;
    let readCount = 0;
    const deliver = (ev: any) => {
      // Auto-approve allowlisted permission asks (vault paths) so the run is
      // never parked on a decision the user already made by policy. Fix C: the
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
      if (ev.type === 'permission_ask' && AUTO_APPROVE_PREFIXES.length > 0
          && Array.isArray(ev.patterns) && ev.patterns.length > 0
          && ev.patterns.every((p: string) => AUTO_APPROVE_PREFIXES.some(pre => p.startsWith(pre)))) {
        respondToPermission(ev.requestID, 'once')
          .then(ok => {
            if (eventCtrl.signal.aborted) return;
            if (ok) {
              // Stamp only now: the client suppresses the card and sends no
              // reply of its own when it sees this flag.
              ev.autoApproved = true;
              opts.onEvent(ev);
              opts.onEvent({ type: 'log', msg: `[permission] auto-approved ${ev.action} (vault path): ${(ev.patterns || []).join(', ')}`, ts: new Date().toISOString() });
            } else {
              // Auto-approve failed — surface the ask so the user can decide.
              opts.onEvent(ev);
              opts.onEvent({ type: 'error', msg: `[permission] auto-approve failed for ${ev.action} — please reply below`, ts: new Date().toISOString() });
            }
          })
          .catch(() => {
            if (eventCtrl.signal.aborted) return;
            opts.onEvent(ev);
            opts.onEvent({ type: 'error', msg: `[permission] auto-approve failed for ${ev.action} — please reply below`, ts: new Date().toISOString() });
          });
        return;
      }
      if (!eventCtrl.signal.aborted || ev.type === 'error') {
        if (ev.type === 'tool.call') {
          toolCount++;
          const name = String(ev.tool?.name || ev.name || '').toLowerCase();
          if (name === 'read' || name === 'readfile' || name === 'read_file') readCount++;
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
        if (infoErr && !state.gotError) {
          state.gotError = true;
          noteSessionError(opts.sessionId);
          const d = infoErr?.data ?? {};
          const status = d?.statusCode != null ? `[${d.statusCode}] ` : '';
          const message = d?.message || infoErr?.message || infoErr?.name || 'unknown API error';
          deliver({ type: 'error', msg: `OpenCode error: ${status}${message}`, raw: info, ts: new Date().toISOString() });
        }
      } else {
        // Non-2xx — surface a clear error.
        let msg = `OpenCode request failed (HTTP ${res.status})`;
        try {
          const body: any = await res.json();
          msg = body?.data?.message || body?.message || body?.error?.message || msg;
        } catch {}
        state.gotError = true;
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
          msg: `[olympus-run] no_output: read_count=${readCount} tool_count=${toolCount} text_count=${state.textEmitted.size}`,
          ts: new Date().toISOString(),
        });
      }

      // 4. Close the feed subscription.
      await sleep(300);
      eventCtrl.abort();
      try { await closeFeed(); } catch {}

      if (state.gotError) {
        return { code: 1, sessionId: opts.sessionId, receivedEvents, postStarted, error: 'OpenCode reported an error during the run' };
      }
      return { code: 0, sessionId: opts.sessionId, receivedEvents, postStarted };
    } catch (err: any) {
      eventCtrl.abort();
      // Server-level failure (before the message was posted) — the serve
      // may have crashed. Drop the cached state so the next request
      // re-probes and respawns if needed.
      if (!postStarted) invalidateServer();
      if (outerSignal?.aborted) {
        return { code: -1, sessionId: opts.sessionId, receivedEvents, postStarted, error: 'aborted' };
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
      };
    } finally {
      clearTimeout(maxTimer);
      clearInterval(silenceTimer);
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
