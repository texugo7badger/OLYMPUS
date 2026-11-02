/**
 * progress.ts — v0.0.31 hotfix: the ceiling must not kill a working hop.
 *
 * THE SPECIMEN (2026-11-01, AIME `v8-back-nav` + `p3-auth-pages`): both hops
 * ran for 25+ minutes on `qwen3.8-flash`, kept listing files and producing
 * SSE events, and were killed by the absolute `OLYMPUS_HOP_TIMEOUT_MS`
 * ceiling (1,500,000 ms). The campaign then hit the ≥50 % park breaker and
 * stopped, quarantining two hops that were demonstrably working.
 *
 * A ceiling exists to bound a STUCK turn, not a long one. This module decides
 * whether a live turn may extend: progress within the window and the hard cap
 * not reached → extend by one slice. No progress → let the ceiling fire; the
 * silence/first-byte timers already own the stalled case.
 *
 * Pure by design (no timers) so every transport and the suite share one rule.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export interface CeilingInput {
  /** When the turn may be killed without progress (epoch ms). */
  deadline: number;
  /** The absolute cap, progress or not (epoch ms). */
  hardDeadline: number;
  /** Last time the turn produced an event/output (epoch ms). */
  lastProgressAt: number;
  /** Now (epoch ms). */
  now: number;
}

export interface CeilingOptions {
  /** Progress newer than this counts as "still working" (default 3 min). */
  progressWindowMs?: number;
  /** How much time one extension grants (default 5 min). */
  extensionMs?: number;
}

export interface CeilingDecision {
  /** True when the turn must be killed now. */
  kill: boolean;
  /** True when the deadline moved. */
  extended: boolean;
  deadline: number;
  /** How long since the last progress (for the telemetry line). */
  idleMs: number;
}

export function decideCeiling(input: CeilingInput, opts: CeilingOptions = {}): CeilingDecision {
  const progressWindowMs = opts.progressWindowMs ?? 3 * 60_000;
  const extensionMs = opts.extensionMs ?? 5 * 60_000;
  const idleMs = Math.max(0, input.now - input.lastProgressAt);
  if (input.now < input.deadline) {
    return { kill: false, extended: false, deadline: input.deadline, idleMs };
  }
  if (input.now >= input.hardDeadline) {
    return { kill: true, extended: false, deadline: input.deadline, idleMs };
  }
  if (idleMs <= progressWindowMs) {
    return {
      kill: false,
      extended: true,
      deadline: Math.min(input.now + extensionMs, input.hardDeadline),
      idleMs,
    };
  }
  return { kill: true, extended: false, deadline: input.deadline, idleMs };
}

/** The hard cap a healthy long hop may reach (2× the base ceiling). */
export function hardCeilingMs(baseTimeoutMs: number): number {
  return Math.max(baseTimeoutMs, baseTimeoutMs * 2);
}
