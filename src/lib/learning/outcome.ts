/**
 * learning/outcome.ts — v0.1.3: ONE outcome truth for every learning lane.
 *
 * Before this module the hop writer called a verified hop "completed" while
 * the arsenal resolver and pattern detector only counted "success". The
 * result was 7,899 outcome rows, 0 quick circuits and 0 cross-god patterns.
 * Every consumer must normalize through here.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type Outcome = 'success' | 'failure' | 'unknown';

export interface NormalizeOutcomeOptions {
  /** The deterministic verifier passed. A completed hop without this is not success. */
  verified?: boolean;
  /** E4 contract violation / zero declared artifacts. */
  contractViolation?: boolean;
  /** A provider or tool error was observed. */
  hadError?: boolean;
}

export interface NormalizedOutcome {
  outcome: Outcome;
  reason: string;
}

const SUCCESS = new Set([
  'completed', 'complete', 'success', 'succeeded', 'ok', 'passed', 'done', 'green',
]);

const FAILURE = new Set([
  'failure', 'failed', 'fail', 'error', 'parked', 'blocked', 'cancelled', 'canceled',
  'timeout', 'timed-out', 'contract-violation', 'contract_violation',
]);

/**
 * Normalize a hop status or dispatch outcome.
 *
 * Rules:
 *   - contract violation or observed error => failure;
 *   - completed/ok/success only when `verified !== false`;
 *   - parked-* and every failure synonym => failure;
 *   - anything else => unknown (never counted as a success).
 */
export function normalizeOutcome(
  raw: unknown,
  opts: NormalizeOutcomeOptions = {},
): NormalizedOutcome {
  if (opts.contractViolation) return { outcome: 'failure', reason: 'contract violation' };
  if (opts.hadError) return { outcome: 'failure', reason: 'tool/provider error' };

  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return { outcome: 'unknown', reason: 'missing outcome' };

  if (value.startsWith('parked')) return { outcome: 'failure', reason: value };
  if (SUCCESS.has(value)) {
    if (opts.verified === false) return { outcome: 'failure', reason: `${value} but not verified` };
    return { outcome: 'success', reason: value };
  }
  if (FAILURE.has(value)) return { outcome: 'failure', reason: value };
  return { outcome: 'unknown', reason: `unrecognized outcome: ${value}` };
}

/** Convenience: is this row usable as positive/negative learning evidence? */
export function isLearningOutcome(outcome: Outcome): boolean {
  return outcome === 'success' || outcome === 'failure';
}
