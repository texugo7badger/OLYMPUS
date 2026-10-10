/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/**
 * dev-server-manager — #86 (MADRUGA-SERVE-1 Batch A): the DURABLE
 * dev-server manager. The thing the user asked Apollo ("start my dev
 * server") and that the interactive lane cannot be (#105's lesson, proven
 * 3x): the bash tool kills the foreground server on timeout, and captured
 * output text is never a live server. This module is the single source of
 * truth for managed dev servers:
 *
 *   - start(slug, port?) spawns DETACHED (detached: true + unref) in the
 *     PROJECT'S LANE DIRECTORY (#99 — never inside the repo), stdio to a
 *     log file, preferred port = the vault note's livePreviewPort (parity
 *     with the Live Preview panel) with an honest ephemeral fallback.
 *   - status(slug|port) is the ONLY legitimate source of the phrase
 *     "running" — it re-probes the port with the #102 dual-stack probe
 *     (probeDevServer); a state file with a dead pid is the honest
 *     "down (stale state, pid dead)" and self-heals. #105: captured output
 *     text is never a source.
 *   - stop(slug) SIGTERMs the process GROUP, verifies death (SIGKILL the
 *     disclosed last resort), verifies the port free, removes the state.
 *   - list() probes every known lane.
 *
 * State (the durable truth, one JSON per slug):
 *   ~/.local/share/olympus/dev-servers/<slug>.json
 *     { pid, port, host, projectPath, startedAt, logFile, lastProbe }
 *
 * The panel<->manager UI integration is #100's design night (AFTER the
 * user's UAT); tonight the manager is the lib surface the next routes ride.
 */

import { spawn } from 'node:child_process';
import {
  existsSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync, appendFileSync, closeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { probeDevServer, type DevServerProbe } from './dev-server-probe';
import { workspaceLaneDir, findOlympusRoot } from './opencode-spawn';
import { getProject, reconcileProjectPath } from './project-context';

export interface DevServerState {
  /** The spawned process's pid (the process-group leader — detached). */
  pid: number;
  /** The port the dev server was asked to serve on. */
  port: number;
  /** The loopback stack the last green probe answered on. */
  host: 'ipv4' | 'ipv6' | null;
  /** The lane project directory the server runs in (never the repo). */
  projectPath: string;
  /** ISO timestamp of the spawn. */
  startedAt: string;
  /** The detached stdio sink (npm + server output). */
  logFile: string;
  /** The last probe this manager ran + when. */
  lastProbe: { at: string; running: boolean } | null;
}

export type DevServerLifecycle = 'running' | 'starting' | 'down' | 'down-stale' | 'none';

export interface DevServerStatus {
  slug: string;
  state: DevServerLifecycle;
  /** PROBE truth — the only legitimate source of the phrase "running" (#105). */
  running: boolean;
  pid: number | null;
  pidAlive: boolean;
  port: number | null;
  host: 'ipv4' | 'ipv6' | null;
  url: string | null;
  responseTimeMs: number | null;
  projectPath: string | null;
  startedAt: string | null;
  logFile: string | null;
  /** true when this call removed a stale state file (the dead-pid self-heal). */
  staleCleared: boolean;
  /** The honest human sentence — what the caller may quote. */
  note: string;
}

export interface DevServerStartResult {
  ok: boolean;
  /** true when a live managed server already owns the port — no second spawn. */
  alreadyRunning: boolean;
  slug: string;
  pid: number | null;
  port: number | null;
  projectPath: string | null;
  state: DevServerState | null;
  error?: string;
}

export interface DevServerStopResult {
  ok: boolean;
  alreadyStopped: boolean;
  slug: string;
  pid: number | null;
  port: number | null;
  portFree: boolean;
  escalatedToSigkill: boolean;
  error?: string;
}

/** The manager's state directory (one <slug>.json per managed server). */
export function devServersDir(): string {
  return join(homedir(), '.local', 'share', 'olympus', 'dev-servers');
}

function stateFilePath(slug: string): string {
  return join(devServersDir(), `${slug}.json`);
}

function readStateFile(slug: string): DevServerState | null {
  try {
    const p = stateFilePath(slug);
    if (!existsSync(p)) return null;
    const s = JSON.parse(readFileSync(p, 'utf-8'));
    if (typeof s?.pid !== 'number' || typeof s?.port !== 'number') return null;
    return s as DevServerState;
  } catch { return null; }
}

function writeStateFile(slug: string, state: DevServerState): void {
  mkdirSync(devServersDir(), { recursive: true });
  writeFileSync(stateFilePath(slug), JSON.stringify(state, null, 2), 'utf-8');
}

/** The #99 never-the-repo guard: no managed spawn ever lands in the working tree. */
function insideOlympusRoot(p: string): boolean {
  const root = findOlympusRoot();
  return !!p && !!root && (p === root || p.startsWith(root + '/'));
}

// ─── #118 (PLANO-MASTER-1 B4): the dignity step — deps BEFORE the spawn ─────

/** The install ceiling, env-tunable (the #107/R3 knob family). Default
 *  300s: a cold next + Tailwind fits; a stuck registry dies at the bound. */
export const DEFAULT_DEPS_TIMEOUT_MS = 300_000;
export function resolveDepsTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.OLYMPUS_DEPS_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DEPS_TIMEOUT_MS;
}

interface DepsStepResult {
  ok: boolean;
  skipped: boolean;
  detail?: string;
}

/**
 * #118: THE DIGNITY STEP. The user's UAT died on its absence verbatim
 * (s0 log: `next dev -p 3011` -> `sh: 1: next: not found` — the spawn ran
 * with the deps never installed, and the terminal saw 15s of silence
 * instead of the death). Deterministic (0 LLM), BOUNDED
 * (OLYMPUS_DEPS_TIMEOUT_MS), LOGGED to the same trigger log; an install
 * failure is the HONEST REFUSAL naming the step — never a silent probe
 * over a corpse. Skips when node_modules already exists (idempotent) and
 * when the project declares zero dependencies (nothing to install — npm
 * would not even create the dir; verified empirically on this box).
 */
function ensureProjectDeps(projectPath: string, outFd: number, npmCmd: string): Promise<DepsStepResult> {
  if (existsSync(join(projectPath, 'node_modules'))) {
    return Promise.resolve({ ok: true, skipped: true, detail: 'node_modules present — install skipped' });
  }
  let pkg: { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> } | null = null;
  try {
    pkg = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf-8'));
  } catch {
    return Promise.resolve({ ok: false, skipped: false, detail: 'package.json unreadable — the deps step cannot even attempt an install' });
  }
  const depCount = Object.keys({ ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }).length;
  if (depCount === 0) {
    return Promise.resolve({ ok: true, skipped: true, detail: 'no dependencies declared — nothing to install' });
  }
  return new Promise<DepsStepResult>((resolveStep) => {
    const child = spawn(npmCmd, ['install', '--no-audit', '--no-fund'], {
      cwd: projectPath,
      stdio: ['ignore', outFd, outFd],
    });
    let settled = false;
    const ceilingMs = resolveDepsTimeoutMs();
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      resolveStep({ ok: false, skipped: false, detail: `deps install exceeded ${ceilingMs}ms (OLYMPUS_DEPS_TIMEOUT_MS) — the installer was killed` });
    }, ceilingMs);
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveStep({ ok: false, skipped: false, detail: `deps install failed to start: ${e.message}` });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolveStep({ ok: true, skipped: false, detail: 'npm install exit 0' });
      else resolveStep({ ok: false, skipped: false, detail: `deps install failed (npm install exit ${code}) — the dev server is NOT spawned` });
    });
  });
}

/**
 * #112 follow-on (PREVIEW-2 live garnish): the port argv must match the dev
 * server's CLI. The vite class rejects the next-class's bare `-p` (vite's
 * CACError killed the first live preview — served-dir, right lane, dead
 * argv); `--strictPort` additionally keeps vite on the PROBED port (without
 * it vite silently hops on a busy port and the probe would name a lie).
 * The next class (`next dev`) and bare `node` fixtures keep `-p`.
 */
export function devServerPortArgs(devScript: string, port: number): string[] {
  // Evidence-bounded: only the vite class is PROVEN to need the long flag
  // (tonight's CACError); every other dev script keeps the SERVE-1 shape
  // (`-p`) — unproven flag dialects are not invented here (the PORT env is
  // also threaded at spawn as the vendor-neutral channel).
  return /\bvite\b/.test(devScript) ? ['--port', String(port), '--strictPort'] : ['-p', String(port)];
}

function isPidAlive(pid: number | null | undefined): boolean {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (e: any) { return e?.code === 'EPERM'; }
}

/** An honest ephemeral port (bind 0, read, release) for the no-note fallback. */
function freeEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

function findStateByPort(port: number): { slug: string; state: DevServerState } | null {
  try {
    for (const f of readdirSync(devServersDir())) {
      if (!f.endsWith('.json')) continue;
      const slug = f.slice(0, -'.json'.length);
      const st = readStateFile(slug);
      if (st && st.port === port) return { slug, state: st };
    }
  } catch {}
  return null;
}

function probeState(state: DevServerState): Promise<DevServerProbe> {
  return probeDevServer(state.port, 1500);
}

function baseStatus(slug: string): DevServerStatus {
  return {
    slug, state: 'none', running: false, pid: null, pidAlive: false, port: null,
    host: null, url: null, responseTimeMs: null, projectPath: null, startedAt: null,
    logFile: null, staleCleared: false,
    note: `no managed dev server for "${slug}"`,
  };
}

/**
 * start(slug, port?) — spawn the project's dev server DETACHED in its lane
 * directory. Idempotent: a live managed server answers "already running"
 * with the SAME state (never a second spawn on the same port); a busy port
 * this manager does not own is an honest refusal, never a double-spawn.
 */
export async function start(projectSlug: string, port?: number): Promise<DevServerStartResult> {
  const laneDirRoot = workspaceLaneDir();
  // #112 (PREVIEW-2): the lane-aware truth. The #110 autonomous intake
  // registers projects at 02_Projects/<slug> (the user's pinned directive);
  // a workspaceLaneDir()-only derivation refused ALL of them (SMOKE-1's
  // live refusal, reproduced in the A13 fixture). reconcileProjectPath()
  // answers the ONLY acceptable spawn dir per the #99/#103 doctrine: the
  // note path when alive outside the repo, the lane copy when present, the
  // lane (never the repo) when the note points inside the root. A note-less
  // slug keeps the legacy derivation; reconcile's lane-ROOT placeholder
  // answer (inside-repo note + no lane copy) NEVER hands a spawn the bare
  // workspace root — that shape degrades to the legacy refusal below.
  const reconciled = reconcileProjectPath(projectSlug);
  const legacyPath = join(laneDirRoot, projectSlug);
  const projectPath = reconciled && reconciled.path !== laneDirRoot ? reconciled.path : legacyPath;
  if (!existsSync(projectPath)) {
    return {
      ok: false, alreadyRunning: false, slug: projectSlug, pid: null, port: null,
      projectPath: null, state: null,
      error: `no lane project directory at ${projectPath} — the manager spawns dev servers only in a real project lane (the workspace lane, or the reconciled project note path for intake-registered projects — #99/#112), never the repo`,
    };
  }
  // The #99 incident shape, defense in depth: even a misresolved lane can
  // never put a managed spawn inside the working tree.
  if (insideOlympusRoot(projectPath)) {
    return {
      ok: false, alreadyRunning: false, slug: projectSlug, pid: null, port: null,
      projectPath: null, state: null,
      error: `refusing to spawn inside the OLYMPUS root (${projectPath}) — the never-the-repo guard (#99)`,
    };
  }

  // Idempotence + the honest port owner check.
  const existing = readStateFile(projectSlug);
  if (existing && isPidAlive(existing.pid)) {
    const p = await probeState(existing);
    if (p.running) {
      const state = { ...existing, host: p.host, lastProbe: { at: new Date().toISOString(), running: true } };
      writeStateFile(projectSlug, state);
      return { ok: true, alreadyRunning: true, slug: projectSlug, pid: state.pid, port: state.port, projectPath: state.projectPath, state };
    }
    // pid alive but the port is not bound yet: the honest "starting" — a
    // second spawn would double-own the project; the SAME state answers.
    return { ok: true, alreadyRunning: true, slug: projectSlug, pid: existing.pid, port: existing.port, projectPath: existing.projectPath, state: existing };
  }
  if (existing && !isPidAlive(existing.pid)) {
    // the crash-orphan shape: heal the file before any fresh spawn
    try { unlinkSync(stateFilePath(projectSlug)); } catch {}
  }

  // Port resolution: explicit > the note's livePreviewPort (panel parity)
  // > an honest ephemeral fallback.
  let resolvedPort = port ?? null;
  if (resolvedPort === null || resolvedPort === undefined) {
    const project = getProject(projectSlug);
    resolvedPort = project?.livePreviewPort ?? null;
  }
  if (resolvedPort === null || resolvedPort === undefined) {
    resolvedPort = await freeEphemeralPort();
  }

  // A busy port this manager does not own: refuse — never a double-spawn,
  // never a claim on a process we did not create (#105).
  const pre = await probeDevServer(resolvedPort, 1000);
  if (pre.running) {
    return {
      ok: false, alreadyRunning: false, slug: projectSlug, pid: null, port: resolvedPort,
      projectPath, state: null,
      error: `port ${resolvedPort} is busy by a process this manager does not own (probe running, no matching state) — refusing to double-spawn; stop it or pass another port`,
    };
  }

  const logDir = join(devServersDir(), 'logs');
  mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, `${projectSlug}-${Date.now()}.log`);
  const outFd = openSync(logFile, 'a');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  // #118 (PLANO-MASTER-1 B4): THE DIGNITY STEP — deps BEFORE the spawn.
  // Deterministic (0 LLM), bounded (OLYMPUS_DEPS_TIMEOUT_MS), logged to
  // this trigger log; a failed install = the honest refusal naming the
  // step + the log — never a spawned corpse, never a silent probe.
  const depsStep = await ensureProjectDeps(projectPath, outFd, npmCmd);
  if (!depsStep.ok) {
    try { closeSync(outFd); } catch { /* already closed */ }
    return {
      ok: false, alreadyRunning: false, slug: projectSlug, pid: null, port: resolvedPort,
      projectPath, state: null,
      error: `deps step failed: ${depsStep.detail ?? 'unknown install failure'} — see ${logFile}`,
    };
  }

  // #112 follow-on: the port argv matches the dev script's CLI class
  // (vite gets --port/--strictPort; the next/node classes keep -p).
  let devScript = '';
  try {
    devScript = String(JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf-8'))?.scripts?.dev ?? '');
  } catch { /* an unreadable package.json keeps the default argv class */ }
  const child = spawn(npmCmd, ['run', 'dev', '--', ...devServerPortArgs(devScript, resolvedPort)], {
    cwd: projectPath,
    detached: true,          // the durable lane: a new process group, immune to the spawning session's death
    stdio: ['ignore', outFd, outFd],
    env: { ...process.env, PORT: String(resolvedPort) }, // belt-and-braces for env-port servers
  });
  child.unref();             // the manager's session does not wait for the server

  if (typeof child.pid !== 'number') {
    return {
      ok: false, alreadyRunning: false, slug: projectSlug, pid: null, port: resolvedPort,
      projectPath, state: null,
      error: `spawn failed for "${projectSlug}" (npm run dev did not produce a pid) — see ${logFile}`,
    };
  }

  const state: DevServerState = {
    pid: child.pid,
    port: resolvedPort,
    host: null,
    projectPath,
    startedAt: new Date().toISOString(),
    logFile,
    lastProbe: null,
  };
  mkdirSync(devServersDir(), { recursive: true });
  writeFileSync(stateFilePath(projectSlug), JSON.stringify(state, null, 2), 'utf-8');

  return { ok: true, alreadyRunning: false, slug: projectSlug, pid: state.pid, port: state.port, projectPath, state };
}

/**
 * status(slugOrPort) — the ONLY legitimate source of the phrase "running".
 * The state file is the durable claim; the probe is the live truth; the
 * two are reconciled honestly on every call:
 *   - probe green  → 'running' (running: true — probe-verified)
 *   - probe silent + pid alive → 'starting' (running: false — honest)
 *   - probe silent + pid dead  → 'down-stale' (the file self-heals; never a false "running")
 */
export async function status(slugOrPort: string | number): Promise<DevServerStatus> {
  let slug: string | null = null;
  let state: DevServerState | null = null;
  if (typeof slugOrPort === 'number') {
    const hit = findStateByPort(slugOrPort);
    if (hit) { slug = hit.slug; state = hit.state; }
    else {
      const s = baseStatus(String(slugOrPort));
      s.note = `no managed dev server on port ${slugOrPort}`;
      return s;
    }
  } else {
    slug = slugOrPort;
    state = readStateFile(slug);
  }
  if (!state) return baseStatus(slug);

  const probe = await probeState(state);
  const pidAlive = isPidAlive(state.pid);

  if (probe.running) {
    const updated: DevServerState = { ...state, host: probe.host, lastProbe: { at: new Date().toISOString(), running: true } };
    writeStateFile(slug, updated);
    return {
      slug, state: 'running', running: true, pid: state.pid, pidAlive, port: state.port,
      host: probe.host, url: probe.url, responseTimeMs: probe.responseTimeMs,
      projectPath: state.projectPath, startedAt: state.startedAt, logFile: state.logFile,
      staleCleared: false,
      note: `running (probe-verified on ${probe.host}, ${probe.responseTimeMs}ms) — pid ${state.pid} on port ${state.port}`,
    };
  }

  if (!pidAlive) {
    // the crash-orphan shape: the durable state outlived its process — the
    // honest "down (stale state, pid dead)" + the self-heal.
    try { unlinkSync(stateFilePath(slug)); } catch {}
    return {
      slug, state: 'down-stale', running: false, pid: state.pid, pidAlive: false, port: state.port,
      host: null, url: probe.url, responseTimeMs: probe.responseTimeMs,
      projectPath: state.projectPath, startedAt: state.startedAt, logFile: state.logFile,
      staleCleared: true,
      note: `down (stale state, pid dead) — the state file self-healed; port ${state.port} is silent`,
    };
  }

  const updated: DevServerState = { ...state, lastProbe: { at: new Date().toISOString(), running: false } };
  writeStateFile(slug, updated);
  return {
    slug, state: 'starting', running: false, pid: state.pid, pidAlive: true, port: state.port,
    host: null, url: probe.url, responseTimeMs: probe.responseTimeMs,
    projectPath: state.projectPath, startedAt: state.startedAt, logFile: state.logFile,
    staleCleared: false,
    note: `starting (pid ${state.pid} alive, port ${state.port} not listening yet — probe-verified silence)`,
  };
}

/**
 * stop(slug) — SIGTERM the process GROUP (detached spawn = the pid is the
 * group leader, so npm AND the server die together — no orphans), verify
 * death, SIGKILL the disclosed last resort, verify the port free, remove
 * the state file.
 */
export async function stop(projectSlug: string, waitMs = 5000): Promise<DevServerStopResult> {
  const state = readStateFile(projectSlug);
  if (!state) {
    return { ok: true, alreadyStopped: true, slug: projectSlug, pid: null, port: null, portFree: true, escalatedToSigkill: false };
  }
  if (!isPidAlive(state.pid)) {
    // stale state: heal + answer honestly — nothing to kill.
    try { unlinkSync(stateFilePath(projectSlug)); } catch {}
    return { ok: true, alreadyStopped: true, slug: projectSlug, pid: state.pid, port: state.port, portFree: true, escalatedToSigkill: false };
  }

  const groupKill = (sig: 'SIGTERM' | 'SIGKILL') => {
    try { process.kill(-state.pid, sig); return; } catch {}
    try { process.kill(state.pid, sig); } catch {}
  };

  groupKill('SIGTERM');
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline && isPidAlive(state.pid)) {
    await new Promise(r => setTimeout(r, 100));
  }
  let escalated = false;
  if (isPidAlive(state.pid)) {
    groupKill('SIGKILL');
    escalated = true;
    try { appendFileSync(state.logFile, `\n[dev-server-manager] SIGKILL escalated at ${new Date().toISOString()} — SIGTERM did not end pid ${state.pid}\n`); } catch {}
    const hardDeadline = Date.now() + 3000;
    while (Date.now() < hardDeadline && isPidAlive(state.pid)) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // the port must actually be free before the state goes — the probe decides.
  let portFree = false;
  for (let i = 0; i < 20; i++) {
    const p = await probeDevServer(state.port, 800);
    if (!p.running) { portFree = true; break; }
    await new Promise(r => setTimeout(r, 150));
  }

  try { unlinkSync(stateFilePath(projectSlug)); } catch {}

  return {
    ok: true, alreadyStopped: false, slug: projectSlug, pid: state.pid, port: state.port,
    portFree, escalatedToSigkill: escalated,
  };
}

/** list() — every known managed lane + its probed state. */
export async function list(): Promise<DevServerStatus[]> {
  const out: DevServerStatus[] = [];
  try {
    for (const f of readdirSync(devServersDir())) {
      if (!f.endsWith('.json')) continue;
      out.push(await status(f.slice(0, -'.json'.length)));
    }
  } catch {}
  return out;
}
