/**
 * warm-server.ts — a per-lane `opencode serve` for the hop runtime (#241).
 *
 * The old path spawned `opencode run` per hop (~1.1s cold start + a process
 * per hop). This module keeps ONE warm HTTP server per project lane:
 *
 *   - `POST /session` (v1) / `POST /api/session` (v2) creates a fresh session
 *     per hop (sessions are lanes; the disk carries the campaign);
 *   - `POST /session/:id/message` (v1) / `POST /api/session/:id/prompt` (v2)
 *     runs the turn;
 *   - `GET /event` (v1) / `GET /api/event` (v2) is watched for first-byte,
 *     rolling silence, errors and permission asks (auto-approved `once`);
 *   - the server is idle-killed after 2 minutes and on process exit.
 *
 * Every failure is NAMED; the transport wrapper falls back to spawn in
 * `auto` mode. No orphan `opencode serve` survives a campaign.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnOpencode } from '@/lib/opencode-spawn';
import { symlinkSync, mkdirSync as mkdirSyncFs, existsSync as existsSyncFs } from 'node:fs';
import { classifyDestructiveCommand } from '@/lib/destructive-guard';
import { suspendCovers } from '@/lib/power-suspend';

export interface WarmServerInfo {
  port: number;
  password: string;
  protocol: 'v1' | 'v2';
  child: ReturnType<typeof spawnOpencode>;
  laneRoot: string;
  lastUsed: number;
  /** Turns currently running on this server — the idle sweeper must not kill it. */
  activeTurns: number;
  logFile: string;
}

export class WarmTransportUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WarmTransportUnavailable';
  }
}

const SERVERS = new Map<string, WarmServerInfo>();
const IDLE_MS = 2 * 60_000;
const MAX_SERVER_AGE_MS = 2 * 60 * 60_000;
let sweeper: ReturnType<typeof setInterval> | null = null;
let exitHookInstalled = false;

/**
 * v0.0.31 (R31-03) — THE HOP-SERVER REGISTRY.
 *
 * Hop servers are spawned `detached` so a Next request cannot kill them
 * mid-hop. The cost: when the owning process dies (or the walk is abandoned),
 * the child survives forever with a full MCP fleet — the 2026-11-01 specimen
 * was a 57-minute-old `opencode serve` on :41741 holding 8 MCP servers.
 *
 * Every hop server registers `{pid, port, lane, appPid, startedAt}`; the app
 * reaps entries whose owner is dead, whose pid is gone, or that outlive the
 * hard age. The reaper verifies the target is an `opencode serve` before
 * killing (no pid-reuse accidents).
 */
interface HopServerRegistryEntry {
  pid: number;
  port: number;
  lane: string;
  appPid: number;
  startedAt: string;
}

function hopRegistryPath(): string {
  return path.join(olympusHome(), 'hop-servers.json');
}

function readHopRegistry(): HopServerRegistryEntry[] {
  try {
    const raw = fs.readFileSync(hopRegistryPath(), 'utf-8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((e) => Number.isFinite(Number(e?.pid))) : [];
  } catch {
    return [];
  }
}

function writeHopRegistry(entries: HopServerRegistryEntry[]): void {
  try {
    fs.mkdirSync(olympusHome(), { recursive: true });
    fs.writeFileSync(hopRegistryPath(), JSON.stringify(entries, null, 2) + '\n', 'utf-8');
  } catch { /* diagnostics only — never kill a hop for a registry write */ }
}

function registerHopServer(info: WarmServerInfo): void {
  if (!info.child.pid) return;
  const entries = readHopRegistry().filter((e) => e.pid !== info.child.pid);
  entries.push({
    pid: info.child.pid,
    port: info.port,
    lane: info.laneRoot,
    appPid: process.pid,
    startedAt: new Date().toISOString(),
  });
  writeHopRegistry(entries);
}

function unregisterHopServer(pid: number | undefined): void {
  if (!pid) return;
  writeHopRegistry(readHopRegistry().filter((e) => e.pid !== pid));
}

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Linux-only cmdline guard against pid reuse; permissive elsewhere. */
function looksLikeOpencodeServe(pid: number): boolean {
  if (process.platform !== 'linux') return true;
  try {
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8');
    return /opencode/i.test(cmd) && /serve/i.test(cmd);
  } catch {
    return false;
  }
}

/**
 * Kill every hop server whose owner is gone, whose pid is gone, or that is
 * older than the hard cap. Returns the reaped pids (for logs/doctor).
 */
export function reapOrphanHopServers(now = Date.now()): number[] {
  const entries = readHopRegistry();
  const keep: HopServerRegistryEntry[] = [];
  const reaped: number[] = [];
  for (const e of entries) {
    const age = Number.isFinite(Date.parse(e.startedAt)) ? now - Date.parse(e.startedAt) : Infinity;
    const ownerAlive = e.appPid === process.pid ? true : isPidAlive(e.appPid);
    const pidAlive = isPidAlive(e.pid);
    const stale = !pidAlive || !ownerAlive || age > MAX_SERVER_AGE_MS;
    if (!stale) { keep.push(e); continue; }
    if (pidAlive && looksLikeOpencodeServe(e.pid)) {
      try { process.kill(e.pid, 'SIGTERM'); reaped.push(e.pid); } catch { /* gone */ }
      const killTimer = setTimeout(() => {
        try { if (isPidAlive(e.pid)) process.kill(e.pid, 'SIGKILL'); } catch { /* gone */ }
      }, 1_500);
      killTimer.unref?.();
    } else if (pidAlive) {
      keep.push(e); // pid reused by something else — never kill it
      continue;
    }
  }
  if (keep.length !== entries.length) writeHopRegistry(keep);
  return reaped;
}

function olympusHome(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

function basicAuth(password: string): string {
  return 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64');
}

function httpRequest(
  port: number,
  password: string,
  method: string,
  pathname: string,
  body?: unknown,
  timeoutMs = 30_000,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers: Record<string, string> = {
      Authorization: basicAuth(password),
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(payload));
    }
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once('exit', () => {
    for (const info of SERVERS.values()) {
      try { info.child.kill('SIGTERM'); } catch { /* gone */ }
    }
  });
}

function startSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, info] of SERVERS) {
      if (info.activeTurns > 0) continue;
      if (now - info.lastUsed < IDLE_MS) continue;
      try { info.child.kill('SIGTERM'); } catch { /* gone */ }
      unregisterHopServer(info.child.pid);
      SERVERS.delete(key);
    }
    // R31-03 — the registry also catches servers this process no longer
    // tracks (a dead owner, a crashed map, an app restart).
    try { reapOrphanHopServers(now); } catch { /* never kill the sweeper */ }
  }, 60_000);
  sweeper.unref?.();
}

/** Ensure one warm server for the lane; throws WarmTransportUnavailable on failure. */
export async function ensureHopServer(laneRoot: string): Promise<WarmServerInfo> {
  const key = path.resolve(laneRoot);
  const cached = SERVERS.get(key);
  if (cached) {
    try {
      const probe = await httpRequest(cached.port, cached.password, 'GET', '/config', undefined, 5_000);
      if (probe.status > 0 && probe.status < 500) {
        cached.lastUsed = Date.now();
        return cached;
      }
    } catch { /* dead — respawn below */ }
    try { cached.child.kill('SIGTERM'); } catch { /* gone */ }
    unregisterHopServer(cached.child.pid);
    SERVERS.delete(key);
  }

  installExitHook();
  startSweeper();
  // R31-03 — clear hop servers whose owner died before spawning a new one.
  try {
    const reaped = reapOrphanHopServers();
    if (reaped.length) console.log(`[hop-runtime] reaped ${reaped.length} orphan hop server(s): ${reaped.join(', ')}`);
  } catch { /* the spawn below is the source of truth */ }

  const port = await freePort();
  const password = randomBytes(16).toString('hex');
  // The hop server gets its OWN OpenCode data dir. Reusing the chat's shared
  // DB hit "Database is not empty and has no session table" (the chat and a
  // standalone serve raced the same schema). The auth file is symlinked so
  // every provider the user registered stays available.
  const hopData = path.join(olympusHome(), 'hop-data');
  const hopDataOpencode = path.join(hopData, 'opencode');
  try {
    mkdirSyncFs(hopDataOpencode, { recursive: true });
    const authSrc = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'opencode', 'auth.json');
    const authDst = path.join(hopDataOpencode, 'auth.json');
    if (existsSyncFs(authSrc) && !existsSyncFs(authDst)) {
      try { symlinkSync(authSrc, authDst); } catch { /* copy fallback */ }
    }
  } catch { /* the server still starts; auth may be missing */ }
  const logFile = path.join(olympusHome(), `hop-server-${port}.log`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const logFd = fs.openSync(logFile, 'a');
  let child: ReturnType<typeof spawnOpencode>;
  try {
    child = spawnOpencode(['serve', '--port', String(port)], {
      cwd: key,
      extraEnv: {
        OPENCODE_SERVER_PASSWORD: password,
        OPENCODE_DISABLE_AUTOUPDATE: '1',
        XDG_DATA_HOME: hopData,
      },
      stdio: ['ignore', logFd, logFd] as const,
      detached: true,
    });
    child.unref();
  } catch (e: any) {
    try { fs.closeSync(logFd); } catch { /* ignore */ }
    throw new WarmTransportUnavailable(`could not spawn opencode serve: ${e?.message || e}`);
  }

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) {
      try { fs.closeSync(logFd); } catch { /* ignore */ }
      throw new WarmTransportUnavailable(`opencode serve exited early (code ${child.exitCode ?? 'signal'}) — ${logFile}`);
    }
    try {
      const probe = await httpRequest(port, password, 'GET', '/config', undefined, 3_000);
      if (probe.status > 0 && probe.status < 500) break;
    } catch { /* not ready */ }
    if (Date.now() > deadline) {
      try { child.kill('SIGKILL'); } catch { /* gone */ }
      try { fs.closeSync(logFd); } catch { /* ignore */ }
      throw new WarmTransportUnavailable(`opencode serve did not become ready on :${port} within 60s — ${logFile}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  // v0.0.29 — #266 CURED. opencode 2.2.5 removed `POST /session` (405) and
  // serves the v2 API instead: `POST /api/session` 200, and the per-session
  // `/api/session/:id/agent` + `/model` selectors answer 204. The old
  // assumption below ("v1 is present, v2 cannot select an agent/model") was
  // true of an older build and kept every hop on the spawn fallback. Probe
  // `GET /api/session` once (a 2xx read, no garbage session): that is the
  // protocol. Older builds keep v1.
  let protocol: 'v1' | 'v2' = 'v1';
  try {
    const api = await httpRequest(port, password, 'GET', '/api/session', undefined, 4_000);
    if (api.status >= 200 && api.status < 300) protocol = 'v2';
  } catch { /* older build — keep v1 */ }

  const server: WarmServerInfo = { port, password, protocol, child, laneRoot: key, lastUsed: Date.now(), activeTurns: 0, logFile };
  SERVERS.set(key, server);
  registerHopServer(server);
  return server;
}

/** The prompt POST path (v2 differs from the message GET path). */
function promptPath(server: WarmServerInfo, sessionId: string): string {
  return server.protocol === 'v2' ? `/api/session/${sessionId}/prompt` : `/session/${sessionId}/message`;
}

function v2Path(server: WarmServerInfo, v1: string): string {
  if (server.protocol !== 'v2') return v1;
  if (v1 === '/session') return '/api/session';
  if (v1 === '/event') return '/api/event';
  return v1
    // GET message stays `message`; the PROMPT post has its own path below.
    .replace(/^\/session\/([^/]+)\/message$/, '/api/session/$1/message')
    .replace(/^\/session\/([^/]+)\/abort$/, '/api/session/$1/interrupt')
    .replace(/^\/session\//, '/api/session/');
}

interface SseWatch {
  close: () => void;
  firstByte: () => boolean;
  errors: string[];
  permissionIds: string[];
}

function openSse(server: WarmServerInfo, onEvent: (ev: any) => void): SseWatch {
  const state = { bytes: 0, errors: [] as string[], permissionIds: [] as string[] };
  let closed = false;
  let req: http.ClientRequest | null = null;
  const pathname = v2Path(server, '/event');
  try {
    req = http.request({
      host: '127.0.0.1',
      port: server.port,
      path: pathname,
      method: 'GET',
      headers: { Authorization: basicAuth(server.password), Accept: 'text/event-stream' },
    }, (res) => {
      res.setEncoding('utf-8');
      let buf = '';
      res.on('data', (chunk) => {
        state.bytes += chunk.length;
        buf += chunk;
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const ev = JSON.parse(payload);
            if (ev?.type === 'error') {
              state.errors.push(typeof ev.error === 'string' ? ev.error : JSON.stringify(ev.error ?? ev).slice(0, 400));
            }
            const pid = ev?.properties?.permissionID ?? ev?.permissionID ?? ev?.properties?.id;
            if ((ev?.type === 'permission.updated' || ev?.type === 'permission.asked') && pid) {
              state.permissionIds.push(String(pid));
            }
            onEvent(ev);
          } catch { /* not JSON */ }
        }
      });
      res.on('error', () => { closed = true; });
    });
    req.on('error', () => { closed = true; });
    req.end();
  } catch { closed = true; }

  return {
    close: () => {
      closed = true;
      try { req?.destroy(); } catch { /* gone */ }
    },
    firstByte: () => state.bytes > 0,
    errors: state.errors,
    permissionIds: state.permissionIds,
  };
}

function collectParts(obj: any, out: { text: string; reasoning: string; tokensIn: number; tokensOut: number; sessionId: string | null }) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { for (const v of obj) collectParts(v, out); return; }
  const type = obj.type;
  if (type === 'text' && typeof obj.text === 'string') out.text += obj.text;
  else if (type === 'reasoning' && typeof obj.text === 'string') out.reasoning += (out.reasoning ? '\n' : '') + obj.text;
  else if (type === 'step-finish' || type === 'step_finish') {
    const t = obj.tokens ?? obj.usage;
    if (t && typeof t === 'object') {
      out.tokensIn += Number(t.input) || 0;
      out.tokensOut += Number(t.output) || 0;
    }
  }
  const sid = obj.sessionID ?? obj.sessionId;
  if (typeof sid === 'string' && sid && !out.sessionId) out.sessionId = sid;
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'tokens' || k === 'usage') continue;
    if (v && typeof v === 'object') collectParts(v, out);
  }
}

export interface WarmHopResult {
  code: number | null;
  stdout: string;
  stderr: string;
  transport: 'warm';
  sessionId: string | null;
}

/**
 * Read the session's cumulative token totals from the hop DB (R31-07).
 *
 * The synthesized stdout only carried the LAST assistant step's tokens, and
 * the v2 assistant message has no `step-finish` part at all — so every warm
 * hop reported null. The truth is in `session_v2.tokens_*` (cumulative for
 * the session). Read-only; never blocks the turn.
 */
async function readSessionTotals(
  sessionId: string | null,
): Promise<{ input: number; output: number; cacheRead: number; reasoning: number } | null> {
  if (!sessionId) return null;
  const dbPath = path.join(olympusHome(), 'hop-data', 'opencode', 'opencode.db');
  if (!fs.existsSync(dbPath)) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const mod: any = await import('better-sqlite3');
      const Database = mod?.default ?? mod;
      const db = new Database(dbPath, { readonly: true });
      try {
        const row = db
          .prepare('SELECT tokens_input, tokens_output, tokens_cache_read, tokens_reasoning FROM session_v2 WHERE id = ?')
          .get(sessionId) as any;
        if (row) {
          const input = Number(row.tokens_input) || 0;
          const output = Number(row.tokens_output) || 0;
          if (input > 0 || output > 0) {
            return {
              input,
              output,
              cacheRead: Number(row.tokens_cache_read) || 0,
              reasoning: Number(row.tokens_reasoning) || 0,
            };
          }
        }
      } finally {
        db.close();
      }
    } catch { /* native module or lock — retry, then give up honestly */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/** Read the session message list (v2 envelope normalized). */
async function readMessages(server: WarmServerInfo, sessionId: string): Promise<any[]> {
  const pathname = v2Path(server, `/session/${sessionId}/message`);
  const r = await httpRequest(server.port, server.password, 'GET', pathname, undefined, 10_000);
  if (r.status < 200 || r.status >= 300) return [];
  try {
    const parsed = JSON.parse(r.text);
    const arr = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
    return arr;
  } catch { return []; }
}

function newestAssistant(messages: any[]): any | null {
  const assistants = messages.filter((m) => {
    const role = m?.info?.role ?? m?.role;
    return role === 'assistant';
  });
  if (assistants.length === 0) return null;
  return assistants.reduce((best, cur) => {
    const bt = Number(best?.info?.time?.created ?? best?.time?.created ?? 0);
    const ct = Number(cur?.info?.time?.created ?? cur?.time?.created ?? 0);
    return ct >= bt ? cur : best;
  });
}

/**
 * Run one hop turn on the lane's warm server. The returned stdout is the
 * same JSONL dialect `opencode run --format json` emits, so the walker's
 * existing parser/classifier work unchanged.
 */
export async function runWarmHop(opts: {
  laneRoot: string;
  agent: string;
  /** The model lane id, e.g. `opencode-go/deepseek-v4.1-flash`. */
  model?: string;
  text: string;
  timeoutMs: number;
  firstByteMs: number;
  silenceMs: number;
  onNotice?: (msg: string) => void;
}): Promise<WarmHopResult> {
  const server = await ensureHopServer(opts.laneRoot);
  server.lastUsed = Date.now();
  server.activeTurns += 1;
  try {

  // 1) session
  let sessionId: string | null = null;
  try {
    const created = await httpRequest(server.port, server.password, 'POST', v2Path(server, '/session'), { title: `hop-${Date.now().toString(36)}` }, 20_000);
    if (created.status < 200 || created.status >= 300) {
      throw new Error(`create session HTTP ${created.status}: ${created.text.slice(0, 200)}`);
    }
    const parsed = JSON.parse(created.text);
    sessionId = parsed?.id ?? parsed?.data?.id ?? parsed?.session?.id ?? null;
  } catch (e: any) {
    throw new WarmTransportUnavailable(`create session failed: ${e?.message || e}`);
  }
  if (!sessionId) throw new WarmTransportUnavailable('create session returned no id');

  // 1b) v2 selects the god and the model ON THE SESSION — the prompt body
  // does not carry an agent/model (the OpenAPI schema: {prompt:{text}}).
  if (server.protocol === 'v2') {
    const agentRes = await httpRequest(server.port, server.password, 'POST', `/api/session/${sessionId}/agent`, { agent: opts.agent }, 10_000);
    if (agentRes.status < 200 || agentRes.status >= 300) {
      throw new WarmTransportUnavailable(`select agent ${opts.agent} failed: HTTP ${agentRes.status} ${agentRes.text.slice(0, 200)}`);
    }
    if (opts.model && opts.model.includes('/')) {
      const idx = opts.model.indexOf('/');
      const providerID = opts.model.slice(0, idx);
      const modelID = opts.model.slice(idx + 1);
      const modelRes = await httpRequest(server.port, server.password, 'POST', `/api/session/${sessionId}/model`, { model: { providerID, id: modelID } }, 10_000);
      if (modelRes.status < 200 || modelRes.status >= 300) {
        throw new WarmTransportUnavailable(`select model ${opts.model} failed: HTTP ${modelRes.status} ${modelRes.text.slice(0, 200)}`);
      }
    }
  }

  // 2) SSE watch (first-byte, silence, errors, permissions)
  const errors: string[] = [];
  // v0.0.30 — pid -> the permission payload. The auto-approve must READ the
  // ask before saying yes; a destructive bash command is not a "once" yes.
  const permissions = new Map<string, string>();
  let sawFirstByte = false;
  let lastEventAt = Date.now();
  const sse = openSse(server, (ev) => {
    if (!sawFirstByte) sawFirstByte = true;
    lastEventAt = Date.now();
    server.lastUsed = Date.now();
    if (ev?.type === 'error') {
      errors.push(typeof ev.error === 'string' ? ev.error : JSON.stringify(ev.error ?? ev).slice(0, 400));
    }
    const pid = ev?.properties?.permissionID ?? ev?.permissionID ?? ev?.properties?.id;
    if ((ev?.type === 'permission.updated' || ev?.type === 'permission.asked') && pid) {
      permissions.set(String(pid), JSON.stringify(ev).slice(0, 8000));
    }
  });

  // Auto-approve permission asks for hop sessions (unattended by design).
  const permissionTimer = setInterval(async () => {
    for (const [pid, payload] of [...permissions]) {
      permissions.delete(pid);
      // v0.0.30 (#C6) — a destructive ask is NEVER auto-approved in an
      // unattended hop. Abort the turn with a typed error the walker parks.
      const verdict = classifyDestructiveCommand(payload);
      if (verdict.destructive) {
        errors.push(`destructive-command-denied (${verdict.reason}): ${verdict.pattern ?? 'matched pattern'} — a hop may not run this unattended; the walker backs up first and parks for human approval`);
        try {
          await httpRequest(server.port, server.password, 'POST', v2Path(server, `/session/${sessionId}/abort`), undefined, 5_000);
        } catch { /* the ceiling still bounds the turn */ }
        opts.onNotice?.(`permission ${pid} DENIED (destructive: ${verdict.reason})`);
        continue;
      }
      try {
        const v1 = await httpRequest(server.port, server.password, 'POST', `/session/${sessionId}/permissions/${encodeURIComponent(pid)}`, { response: 'once' }, 5_000);
        if (v1.status < 200 || v1.status >= 300) {
          await httpRequest(server.port, server.password, 'POST', `/permission/${encodeURIComponent(pid)}/reply`, { reply: 'once' }, 5_000);
        }
        opts.onNotice?.(`permission ${pid} auto-approved (hop session)`);
      } catch { /* the ceiling still bounds the turn */ }
    }
  }, 500);
  permissionTimer.unref?.();

  let startedAt = Date.now();
  const firstByteTimer = setInterval(() => {
    if (sawFirstByte) return;
    // Epic N: the machine was asleep, not the provider.
    if (suspendCovers(startedAt, Date.now())) { startedAt = Date.now(); return; }
    if (Date.now() - startedAt > opts.firstByteMs) {
      errors.push(`hop-first-byte-timeout (OLYMPUS_HOP_FIRST_BYTE_MS ${opts.firstByteMs}ms): the turn produced ZERO output — the provider pool stalled before the first token`);
      try { void httpRequest(server.port, server.password, 'POST', v2Path(server, `/session/${sessionId}/abort`), undefined, 5_000); } catch { /* gone */ }
    }
  }, 1_000);
  const silenceTimer = setInterval(() => {
    if (!sawFirstByte) return;
    if (suspendCovers(lastEventAt, Date.now())) { lastEventAt = Date.now(); return; }
    if (Date.now() - lastEventAt > opts.silenceMs) {
      errors.push(`hop-first-byte-timeout (OLYMPUS_HOP_SILENCE_MS ${opts.silenceMs}ms rolling): the turn went SILENT mid-run after producing output — a step's provider request stalled`);
      try { void httpRequest(server.port, server.password, 'POST', v2Path(server, `/session/${sessionId}/abort`), undefined, 5_000); } catch { /* gone */ }
    }
  }, 2_000);

  // 3) prompt
  let code: number | null = null;
  let raw = '';
  try {
    // v0.0.28 — THE DIALECT IS PROBED, NOT ASSUMED (both lanes, one rule).
    // opencode 2.2.2 has shipped BOTH v2 bodies: `{ text }` and
    // `{ prompt: { text } }`. The 21:51 chat specimen died on
    // `Missing key at ["text"]` with the wrapped form; THIS lane hardcoded
    // the wrapped form and would die identically the moment the warm
    // transport actually serves a hop (#266's 405 on POST /session forces
    // the spawn fallback today, which masked it — a latent blocker).
    const modelRef = opts.model && opts.model.includes('/')
      ? { providerID: opts.model.slice(0, opts.model.indexOf('/')), modelID: opts.model.slice(opts.model.indexOf('/') + 1) }
      : undefined;
    const body = (dialect: 'text' | 'wrapped') => server.protocol === 'v2'
      ? (dialect === 'text' ? { text: opts.text } : { prompt: { text: opts.text } })
      : { parts: [{ type: 'text', text: opts.text }], agent: opts.agent, ...(modelRef ? { model: modelRef } : {}) };
    let dialect: 'text' | 'wrapped' = 'text';
    let res = await httpRequest(server.port, server.password, 'POST', promptPath(server, sessionId), body(dialect), opts.timeoutMs);
    if (server.protocol === 'v2' && res.status === 400 && /Missing key[\s\S]{0,80}\["(prompt|text)"\]/.test(res.text)) {
      dialect = dialect === 'text' ? 'wrapped' : 'text';
      res = await httpRequest(server.port, server.password, 'POST', promptPath(server, sessionId), body(dialect), opts.timeoutMs);
    }
    raw = res.text;
    code = res.status >= 200 && res.status < 300 ? 0 : 1;
    if (res.status === 401 || res.status === 403) errors.push(`auth: HTTP ${res.status}`);
    if (res.status >= 400) errors.push(`HTTP ${res.status}: ${res.text.slice(0, 300)}`);

    if (code === 0 && server.protocol === 'v2') {
      // v2 POST is an ACK (the user message is queued); the assistant turn
      // arrives asynchronously. Poll the session until it completes, while
      // the SSE watcher keeps first-byte/silence/error truth.
      let deadline = startedAt + opts.timeoutMs;
      let done = false;
      while (!done) {
        // Epic N: a resume extends the budget; the freeze was not the hop's fault.
        if (suspendCovers(startedAt, Date.now())) { startedAt = Date.now(); deadline = startedAt + opts.timeoutMs; }
        if (Date.now() >= deadline) break;
        await new Promise((r) => setTimeout(r, 1000));
        if (errors.length > 0 && errors.some((e) => /hop-first-byte-timeout|provider\.|auth:/i.test(e))) break;
        server.lastUsed = Date.now();
        const msgs = await readMessages(server, sessionId);
        const assistant = newestAssistant(msgs);
        if (!assistant) continue;
        const info = assistant?.info ?? assistant;
        if (info?.error) {
          errors.push(typeof info.error === 'string' ? info.error : JSON.stringify(info.error).slice(0, 400));
          break;
        }
        const completed = info?.time?.completed != null;
        if (completed) {
          raw = JSON.stringify(assistant);
          sawFirstByte = true;
          done = true;
        }
      }
      if (!done && errors.length === 0) {
        errors.push(`ceiling-kill (OLYMPUS_HOP_TIMEOUT_MS ${opts.timeoutMs}ms): the turn did not complete in time`);
        code = null;
      }
    }
  } catch (e: any) {
    const msg = e?.message || String(e);
    errors.push(/abort|timeout/i.test(msg) ? `ceiling-kill (OLYMPUS_HOP_TIMEOUT_MS ${opts.timeoutMs}ms): ${msg}` : `transport: ${msg}`);
    code = null;
    try { await httpRequest(server.port, server.password, 'POST', v2Path(server, `/session/${sessionId}/abort`), undefined, 5_000); } catch { /* gone */ }
  } finally {
    clearInterval(firstByteTimer);
    clearInterval(silenceTimer);
    clearInterval(permissionTimer);
    sse.close();
    server.lastUsed = Date.now();
  }

  // 3b) A STALL IS A FAILURE, EVEN WHEN THE POST RETURNED 200 (R31-01).
  //
  // The v2 prompt POST is an ACK: it returns 200 as soon as the message is
  // queued. When the SSE watcher later aborts the turn for first-byte/silence
  // (or the poll hits the ceiling), `code` was still 0 — so AutoTransport never
  // saw a failure and never failed over to spawn. The AIME `v8-back-nav` hop
  // parked twice on exactly this path (20m43s + 10m28s) while the spawn lane
  // was healthy. A typed stall now clears the ACK.
  const stalled = [...errors, ...sse.errors].some((e) =>
    /hop-first-byte-timeout|ceiling-kill|provider\.|SILENT/i.test(String(e)));
  if (stalled) code = null;

  // 4) synthetic stdout (the walker's existing parser reads this dialect)
  const acc = { text: '', reasoning: '', tokensIn: 0, tokensOut: 0, sessionId };
  try { collectParts(JSON.parse(raw), acc); } catch { /* not JSON */ }
  // The session row is the only truthful token source on v2 (R31-07).
  const totals = await readSessionTotals(sessionId);
  const cacheRead = totals?.cacheRead ?? 0;
  if (totals) { acc.tokensIn = totals.input; acc.tokensOut = totals.output; }
  const lines: string[] = [];
  if (acc.text) lines.push(JSON.stringify({ type: 'text', text: acc.text }));
  if (acc.reasoning) lines.push(JSON.stringify({ type: 'reasoning', text: acc.reasoning }));
  if (acc.tokensIn || acc.tokensOut) {
    lines.push(JSON.stringify({
      type: 'step-finish',
      tokens: {
        input: acc.tokensIn,
        output: acc.tokensOut,
        ...(cacheRead ? { cache: { read: cacheRead } } : {}),
      },
    }));
  }
  if (sessionId) lines.push(JSON.stringify({ sessionID: sessionId }));
  for (const err of [...new Set([...errors, ...sse.errors])]) lines.push(JSON.stringify({ type: 'error', error: { type: 'warm-transport', message: err } }));

  return {
    code,
    stdout: lines.join('\n'),
    stderr: [...new Set([...errors, ...sse.errors])].join('\n'),
    transport: 'warm',
    sessionId: acc.sessionId,
  };
  } finally {
    server.activeTurns = Math.max(0, server.activeTurns - 1);
    server.lastUsed = Date.now();
  }
}

/** Kill every warm hop server (tests / app exit). */
export function shutdownHopServers(): void {
  for (const info of SERVERS.values()) {
    try { info.child.kill('SIGTERM'); } catch { /* gone */ }
    unregisterHopServer(info.child.pid);
  }
  SERVERS.clear();
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
}

/** Test/diagnostic snapshot. */
export function hopServerCount(): number {
  return SERVERS.size;
}

/** Test seam: register a fake server without spawning opencode. */
export function __registerHopServerForTest(laneRoot: string, info: Omit<WarmServerInfo, 'lastUsed' | 'child' | 'laneRoot' | 'logFile'>): void {
  SERVERS.set(path.resolve(laneRoot), {
    ...info,
    laneRoot: path.resolve(laneRoot),
    lastUsed: Date.now(),
    activeTurns: 0,
    child: { kill: () => true, exitCode: null, signalCode: null } as any,
    logFile: '(test)',
  });
}

/** Test seam: clear every cached server (no process kill). */
export function __clearHopServersForTest(): void {
  SERVERS.clear();
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
}
