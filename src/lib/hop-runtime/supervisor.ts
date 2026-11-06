/**
 * supervisor.ts — v0.0.73: the walk survives the app (detached supervisor).
 *
 * THE SPECIMEN: every campaign walked inside the Next server process. When
 * the server died — a rebuild, a crash, the user closing the window — the
 * walker died with it mid-hop. The disk carried the campaign (state, plan,
 * telemetry), but nothing brought the walk back, and the user saw a campaign
 * frozen at "in flight" with no process behind it.
 *
 * The supervisor is a DETACHED process per lane:
 *
 *   - `startDetachedWalk()` spawns `tsx scripts/walk-lane.ts` with its own
 *     session (detached), its own log (`~/.olympus/supervisor/<slug>.log`)
 *     and its own state (`~/.olympus/supervisor/<slug>.json`);
 *   - the runner takes the lane lock (one campaign per lane, unchanged),
 *     walks the plan and marks the state finished/failed;
 *   - the app only READS the state and the hop telemetry — killing the app
 *     does not kill the walk;
 *   - `resumeOrphanedSupervisors()` runs at boot: a state marked running
 *     whose pid is dead is resumed once (bounded), with the reason written.
 *
 * The walker itself is unchanged; this is the process boundary it was
 * missing. No new surface, no new tokens.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { bootIdOf } from './walk-lock';
import { findOlympusRoot } from '../opencode-spawn';

export interface SupervisorState {
  slug: string;
  laneRoot: string;
  pid: number;
  bootId: string;
  startedAt: string;
  logFile: string;
  /** Resume the walk once if this process dies (the crash contract). */
  autoResume: boolean;
  status: 'running' | 'finished' | 'failed';
  finishedAt?: string;
  /** The runner's honest last word: walked/parked/summary. */
  outcome?: string;
  /** How many times a resume was attempted for this lane (bounded). */
  resumeAttempts?: number;
}

export interface SupervisorView {
  state: SupervisorState | null;
  alive: boolean;
  ageMs: number;
}

const MAX_RESUME_ATTEMPTS = 2;

function homeDir(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

export function supervisorDir(): string {
  return path.join(homeDir(), 'supervisor');
}

export function supervisorStatePath(slug: string): string {
  return path.join(supervisorDir(), `${slug.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
}

export function supervisorLogPath(slug: string): string {
  return path.join(supervisorDir(), `${slug.replace(/[^a-zA-Z0-9._-]/g, '_')}.log`);
}

function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e: any) { return e?.code === 'EPERM'; }
}

function readState(slug: string): SupervisorState | null {
  try {
    return JSON.parse(fs.readFileSync(supervisorStatePath(slug), 'utf-8')) as SupervisorState;
  } catch { return null; }
}

/** Read one supervisor. `alive` requires the pid AND the same boot. */
export function readSupervisor(slug: string): SupervisorView {
  const state = readState(slug);
  if (!state) return { state: null, alive: false, ageMs: 0 };
  let ageMs = 0;
  try { ageMs = Date.now() - fs.statSync(supervisorStatePath(slug)).mtimeMs; } catch { /* gone */ }
  const sameBoot = state.bootId === bootIdOf();
  return { state, alive: state.status === 'running' && sameBoot && pidAlive(state.pid), ageMs };
}

/** Every supervisor on disk, newest first. */
export function listSupervisors(): SupervisorView[] {
  let files: string[] = [];
  try { files = fs.readdirSync(supervisorDir()).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out: SupervisorView[] = [];
  for (const file of files) {
    const slug = file.replace(/\.json$/, '');
    const view = readSupervisor(slug);
    if (view.state) out.push(view);
  }
  return out.sort((a, b) => String(b.state?.startedAt).localeCompare(String(a.state?.startedAt)));
}

export function markSupervisor(slug: string, patch: Partial<SupervisorState>): SupervisorState | null {
  const current = readState(slug);
  if (!current) return null;
  const next = { ...current, ...patch };
  try {
    fs.mkdirSync(supervisorDir(), { recursive: true });
    fs.writeFileSync(supervisorStatePath(slug), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  } catch { return null; }
  return next;
}

export interface StartResult {
  ok: boolean;
  pid?: number;
  logFile?: string;
  reason?: string;
}

/**
 * Spawn the detached runner for a lane. Idempotent: a live supervisor for the
 * same slug is returned as `already-running`, never duplicated (the lane lock
 * would refuse the second walk anyway — this fails earlier and cheaper).
 */
export function startDetachedWalk(opts: {
  slug: string;
  laneRoot: string;
  autoResume?: boolean;
  /** v0.0.85 — the boot auto-resume keeps the quarantine; a human start
   *  retries the parked hops (the docs' contract). */
  keepQuarantine?: boolean;
}): StartResult {
  const existing = readSupervisor(opts.slug);
  if (existing.alive) return { ok: false, reason: 'already-running', pid: existing.state?.pid, logFile: existing.state?.logFile };

  const root = findOlympusRoot();
  const runner = path.join(root, 'scripts', 'walk-lane.ts');
  const tsx = path.join(root, 'node_modules', '.bin', 'tsx');
  if (!fs.existsSync(runner)) return { ok: false, reason: `runner not found: ${runner}` };
  if (!fs.existsSync(tsx)) return { ok: false, reason: `tsx not found: ${tsx}` };

  fs.mkdirSync(supervisorDir(), { recursive: true });
  const logFile = supervisorLogPath(opts.slug);
  const fd = fs.openSync(logFile, 'a');
  let child;
  try {
    child = spawn(tsx, [runner, '--lane', opts.laneRoot, '--slug', opts.slug, ...(opts.keepQuarantine ? ['--keep-quarantine'] : [])], {
      cwd: root,
      detached: true,
      stdio: ['ignore', fd, fd],
      env: { ...process.env, OLYMPUS_DETACHED_WALK: '1' },
    });
  } catch (e: any) {
    try { fs.closeSync(fd); } catch { /* gone */ }
    return { ok: false, reason: e?.message || String(e) };
  } finally {
    try { fs.closeSync(fd); } catch { /* the child owns the duplicate */ }
  }
  if (!child.pid) return { ok: false, reason: 'spawn returned no pid' };
  child.unref();

  const state: SupervisorState = {
    slug: opts.slug,
    laneRoot: opts.laneRoot,
    pid: child.pid,
    bootId: bootIdOf(),
    startedAt: new Date().toISOString(),
    logFile,
    // v0.0.81 — ASK, don't auto-continue. A restart is a decision point:
    // the state says `interrupted` and the UI offers resume; only an explicit
    // `autoResume: true` (a user choice) adopts the lane on boot.
    autoResume: opts.autoResume === true,
    status: 'running',
    resumeAttempts: 0,
  };
  fs.writeFileSync(supervisorStatePath(opts.slug), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  return { ok: true, pid: child.pid, logFile };
}

/** Stop a detached walk (SIGTERM, then the state says why). */
export function stopSupervisor(slug: string, reason = 'stopped by the user'): { ok: boolean; reason?: string } {
  const view = readSupervisor(slug);
  if (!view.state) return { ok: false, reason: 'no supervisor for this lane' };
  if (!view.alive) {
    markSupervisor(slug, { status: 'failed', finishedAt: new Date().toISOString(), outcome: reason });
    return { ok: true };
  }
  try { process.kill(view.state.pid, 'SIGTERM'); } catch (e: any) { return { ok: false, reason: e?.message || String(e) }; }
  markSupervisor(slug, { status: 'failed', finishedAt: new Date().toISOString(), outcome: reason });
  return { ok: true };
}

/**
 * Boot adoption: a state says `running` but the process is gone (the app or
 * the machine died). Resume it once — bounded — with the reason on disk.
 * Only lanes that opted into `autoResume` are touched; a lane the user
 * stopped on purpose says `failed` and is never resumed.
 */
export function resumeOrphanedSupervisors(): Array<{ slug: string; resumed: boolean; reason: string }> {
  const out: Array<{ slug: string; resumed: boolean; reason: string }> = [];
  for (const view of listSupervisors()) {
    const state = view.state;
    if (!state || state.status !== 'running' || view.alive) continue;
    if (!state.autoResume) { out.push({ slug: state.slug, resumed: false, reason: 'autoResume is off' }); continue; }
    const attempts = Number(state.resumeAttempts) || 0;
    if (attempts >= MAX_RESUME_ATTEMPTS) {
      markSupervisor(state.slug, { status: 'failed', finishedAt: new Date().toISOString(), outcome: `resume budget exhausted (${attempts}/${MAX_RESUME_ATTEMPTS})` });
      out.push({ slug: state.slug, resumed: false, reason: 'resume budget exhausted' });
      continue;
    }
    const started = startDetachedWalk({ slug: state.slug, laneRoot: state.laneRoot, autoResume: true, keepQuarantine: true });
    if (started.ok) {
      markSupervisor(state.slug, { resumeAttempts: attempts + 1, startedAt: new Date().toISOString(), outcome: `resumed after the process died (attempt ${attempts + 1}/${MAX_RESUME_ATTEMPTS})` });
      out.push({ slug: state.slug, resumed: true, reason: `pid ${started.pid}` });
    } else {
      out.push({ slug: state.slug, resumed: false, reason: started.reason || 'spawn failed' });
    }
  }
  return out;
}
