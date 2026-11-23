/**
 * verification-hop.ts — v0.0.98-10: one definition for every gate that only
 * VERIFIES. The v0.0.98-9.1 loop guard learned `qa-*`; the next AIME
 * generation parked `gate-back-parity` eight times because a `gate-*` was
 * treated as an implementation hop (20 tools, 25.5 minutes, no repair).
 *
 * The contract lives here so the walker, the post-run repair, the recovery
 * ledger and the UI agree on what a verification hop is:
 *
 *   - id starts with `qa-`, `gate-` or `design-gate`;
 *   - kind is `design-gate`;
 *   - or the prompt declares a hard gate (CHECKS + PASS/FAIL) and carries
 *     at least three deterministic checks.
 *
 * Verification hops get a small tool budget, a hard wall-clock ceiling and
 * the repair/judge path. They never get a blind budget inflation.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import type { PlanHop } from './plan-schema';

type HopShape = Pick<PlanHop, 'id' | 'kind' | 'prompt'> & { verify?: PlanHop['verify'] | null };

export function isVerificationHopId(hopId: string | null | undefined): boolean {
  return /^(qa|gate|design-gate)[-_]/i.test(String(hopId ?? ''));
}

export function isVerificationHop(hop: HopShape | null | undefined): boolean {
  if (!hop) return false;
  const id = String(hop.id ?? '');
  if (isVerificationHopId(id)) return true;
  if (hop.kind === 'design-gate') return true;
  const prompt = String(hop.prompt ?? '');
  const checks = Array.isArray(hop.verify?.checks) ? hop.verify.checks.length : 0;
  return checks >= 3 && /(HARD GATE|CHECKS:|Overall:\s*PASS|PASS\s*\/\s*FAIL)/i.test(prompt);
}

/** A verification hop is a judge, not an explorer. */
export function verificationToolBudget(hop: HopShape): number {
  const id = String(hop.id ?? '');
  if (/^qa[-_]/i.test(id)) return 16;
  if (/^gate[-_]/i.test(id)) return 20;
  if (hop.kind === 'design-gate' || /^design-gate/i.test(id)) return 24;
  return 20;
}

/** The hard ceiling; the transport's +300s extension stops here. */
export function verificationDeadlineMs(hop: HopShape): number {
  const id = String(hop.id ?? '');
  if (/^qa[-_]/i.test(id)) return 12 * 60_000;
  if (/^gate[-_]/i.test(id)) return 18 * 60_000;
  return 20 * 60_000;
}

/** The judge budget after a repair/harness run. */
export function verificationJudgeBudget(hop: HopShape): number {
  const id = String(hop.id ?? '');
  if (/^gate[-_]/i.test(id)) return 14;
  if (hop.kind === 'design-gate' || /^design-gate/i.test(id)) return 14;
  return 10;
}

/** Human label used by the repair prompt and the UI. */
export function verificationLabel(hop: HopShape): string {
  const id = String(hop.id ?? '');
  if (/^gate[-_]/i.test(id)) return 'GATE';
  if (/^design-gate/i.test(id) || hop.kind === 'design-gate') return 'DESIGN GATE';
  return 'QA GATE';
}
