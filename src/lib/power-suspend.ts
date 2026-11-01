/**
 * power-suspend.ts — v0.0.32 (Epic N): OS suspend/hibernate awareness.
 *
 * THE SPECIMEN (2026-11-01): the app's hop timers are wall-clock based. After
 * an OS suspend the process is frozen, not killed; on resume a 5-minute
 * silence window looks like a provider stall, and a healthy hop parks. The
 * DB and hop state are durable — the LIE is the timer, not the work.
 *
 * The Electron main writes this marker on `powerMonitor` suspend/resume (it
 * cannot import this module: it lives in the Next bundle). The Next side
 * reads the same file to distinguish "the provider went silent" from "the
 * machine was asleep".
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface SuspendState {
  /** When the machine suspended (ISO), or null. */
  suspendedAt: string | null;
  /** When it resumed (ISO), or null while suspended / never resumed. */
  resumedAt: string | null;
  /** True between suspend and resume. */
  active: boolean;
}

const DEFAULT_FILE = path.join(
  process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'),
  'suspend.json',
);

export function suspendFilePath(): string {
  return DEFAULT_FILE;
}

export function readSuspendState(file: string = DEFAULT_FILE): SuspendState {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return {
      suspendedAt: typeof raw?.suspendedAt === 'string' ? raw.suspendedAt : null,
      resumedAt: typeof raw?.resumedAt === 'string' ? raw.resumedAt : null,
      active: raw?.active === true,
    };
  } catch {
    return { suspendedAt: null, resumedAt: null, active: false };
  }
}

function write(state: SuspendState, file: string): SuspendState {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  } catch { /* diagnostics only — never block a resume */ }
  return state;
}

export function markSuspend(at: Date = new Date(), file: string = DEFAULT_FILE): SuspendState {
  return write({ suspendedAt: at.toISOString(), resumedAt: null, active: true }, file);
}

export function markResume(at: Date = new Date(), file: string = DEFAULT_FILE): SuspendState {
  const prev = readSuspendState(file);
  return write({
    suspendedAt: prev.suspendedAt ?? null,
    resumedAt: at.toISOString(),
    active: false,
  }, file);
}

/**
 * Does the interval [startMs, endMs] overlap a suspend window?
 *
 * A timer that began before the suspend and fired after the resume returns
 * true ONCE; the caller then resets its baseline, so the next interval no
 * longer overlaps. A still-suspended machine (resumedAt null) extends to
 * Infinity.
 */
export function suspendCovers(
  startMs: number,
  endMs: number,
  state: SuspendState = readSuspendState(),
): boolean {
  if (!state.suspendedAt) return false;
  const suspended = Date.parse(state.suspendedAt);
  const resumed = state.resumedAt ? Date.parse(state.resumedAt) : Infinity;
  if (!Number.isFinite(suspended)) return false;
  return endMs >= suspended && startMs <= resumed;
}

/** True when the machine resumed within the last `windowMs` (default 2 min). */
export function isRecentlyResumed(
  windowMs = 2 * 60_000,
  now = Date.now(),
  state: SuspendState = readSuspendState(),
): boolean {
  if (!state.resumedAt) return false;
  const resumed = Date.parse(state.resumedAt);
  return Number.isFinite(resumed) && now - resumed >= 0 && now - resumed <= windowMs;
}
