/**
 * learning/confidence.ts — v0.1.3: the ECC continuous-learning-v2 formula.
 *
 * `confidence = success_rate * sqrt(samples) / (1 + sqrt(samples))`, capped
 * at 0.95. It is deliberately hard: 2/2 = 0.59, 10/10 = 0.76, 25/25 = 0.83,
 * ~33/33 = 0.85. A lucky one-shot can never become a short-circuit.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export const EMPIRICAL_CONFIDENCE_CAP = 0.95;
export const SHORT_CIRCUIT_THRESHOLD = 0.85;

export interface ConfidenceInput {
  successes?: number | null;
  failures?: number | null;
  samples?: number | null;
  /** Optional legacy confidence when counts are unavailable. Never used alone for short-circuit. */
  legacyConfidence?: number | null;
}

export interface ConfidenceResult {
  samples: number;
  successes: number;
  failures: number;
  successRate: number;
  confidence: number;
  /** True when the counts are a legacy inference (samples == successes, no failures). */
  inferred: boolean;
}

function n(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Compute the ECC confidence. If successes/failures are absent, infer
 * successes from samples — the hop writer only recorded verified successes,
 * so this migration is honest — but mark it `inferred` so promotion can
 * require fresh evidence.
 */
export function computeInstinctConfidence(input: ConfidenceInput): ConfidenceResult {
  const failures = Math.floor(n(input.failures, 0));
  let successes = Math.floor(n(input.successes, -1));
  let inferred = false;
  if (successes < 0) {
    successes = Math.floor(n(input.samples, 0));
    inferred = successes > 0;
  }
  const samples = successes + failures;
  if (samples <= 0) {
    return { samples: 0, successes: 0, failures: 0, successRate: 0, confidence: 0, inferred };
  }
  const successRate = successes / samples;
  const shrink = Math.sqrt(samples) / (1 + Math.sqrt(samples));
  const confidence = Math.max(0, Math.min(EMPIRICAL_CONFIDENCE_CAP, successRate * shrink));
  return {
    samples,
    successes,
    failures,
    successRate,
    confidence: Math.round(confidence * 1000) / 1000,
    inferred,
  };
}

export function canShortCircuit(confidence: number, quickCircuit: boolean): boolean {
  return quickCircuit === true && confidence >= SHORT_CIRCUIT_THRESHOLD;
}
