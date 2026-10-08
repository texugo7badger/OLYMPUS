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

export interface HopStateFile {
  version: 1;
  completed: string[];
  parked: HopPark | null;
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
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : new Date().toISOString(),
  };
}

export function saveHopState(stateDir: string, state: HopStateFile): void {
  const p = hopStatePath(stateDir);
  writeFileSync(p, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
}
