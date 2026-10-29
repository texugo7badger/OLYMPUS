/**
 * hop-state.ts — #109 the hop runtime (FLUENCY-1, Batch C): the park/resume
 * state file. On retry exhaustion (or a failed deterministic verify) the
 * hop PARKS — session artifacts preserved, the resume point recorded — and
 * the campaign never dies with a pool burst. The state lives ON DISK in
 * the project lane (the disk carries the campaign).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const HOP_STATE_FILENAME = '.olympus-hop-state.json';

export interface HopPark {
  hopId: string;
  /** 'retry-exhausted' | 'verify-failed' | 'dispatch-failed' */
  reason: string;
  ts: string;
  /** The last error text (the exhaustion card's error class, if any). */
  error?: string;
}

export interface HopInFlight {
  hopId: string;
  startedAt: string;
}

export interface HopStateFile {
  version: 1;
  completed: string[];
  parked: HopPark | null;
  /** W-D2 (v0.0.6 MISSION-CONTROL-TRUE): the hops RUNNING right now —
   *  written at every launch/settle so the tasks sheet has GROUND TRUTH
   *  (telemetry rows land only at hop settle; before this, a running hop
   *  was indistinguishable from a pending one — the first-hop lie). */
  inFlight?: HopInFlight[];
  updatedAt: string;
}

export function hopStatePath(stateDir: string): string {
  return join(stateDir, HOP_STATE_FILENAME);
}

/** Load the state; null when absent. A CORRUPT state file dies loudly —
 *  never silently treated as fresh (that would re-run completed hops). */
export function loadHopState(stateDir: string): HopStateFile | null {
  const p = hopStatePath(stateDir);
  if (!existsSync(p)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(p, 'utf-8'));
  } catch (e) {
    throw new Error(`[hop-state] corrupt state file ${p} — ${e instanceof Error ? e.message : String(e)} (fix or delete it; never re-run completed hops blind)`);
  }
  const s = parsed as Partial<HopStateFile>;
  if (s.version !== 1 || !Array.isArray(s.completed)) {
    throw new Error(`[hop-state] unrecognized state shape in ${p} (version !== 1 or completed not an array)`);
  }
  return {
    version: 1,
    completed: [...s.completed],
    parked: s.parked ?? null,
    inFlight: Array.isArray(s.inFlight) ? s.inFlight.map((f) => ({
      hopId: String(f?.hopId ?? ''),
      startedAt: String(f?.startedAt ?? new Date().toISOString()),
    })).filter((f) => f.hopId) : [],
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : new Date().toISOString(),
  };
}

/**
 * #244 (v0.0.23) — STALE IN-FLIGHT RECONCILIATION.
 *
 * The spec: a hop left `inFlight` by a dead campaign (f3-4, stuck since
 * 2026-10-24) blocked every new walk on the same lane. A hop is in flight
 * only while a process carries it; the walk lock is the process evidence.
 * A resumed walk therefore drops inFlight entries older than `maxAgeMs`
 * and reports them — never a silent block, never a lost hop (it is not in
 * `completed`, so the DAG re-runs it).
 */
export function pruneStaleInFlight(
  state: HopStateFile,
  maxAgeMs = 20 * 60_000,
): { state: HopStateFile; dropped: string[] } {
  const now = Date.now();
  const keep: HopStateFile['inFlight'] = [];
  const dropped: string[] = [];
  for (const f of state.inFlight ?? []) {
    const started = Date.parse(f.startedAt);
    if (Number.isFinite(started) && now - started > maxAgeMs) dropped.push(f.hopId);
    else keep.push(f);
  }
  return { state: { ...state, inFlight: keep }, dropped };
}

export function saveHopState(stateDir: string, state: HopStateFile): void {
  const p = hopStatePath(stateDir);
  writeFileSync(p, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
}
