/**
 * plan-health.ts — v0.0.98-13: the plan's own guardrails.
 *
 * The AIME gen-44 plan reached 51 hops; the verification guard then had to
 * stop individual gates. The plan itself should tell the user it is oversized,
 * that a hop's tool budget is below the work it declares, and that a delivery
 * profile (0.0.98-15) is the right move before the walk.
 *
 * This module is advisory and pure: the walker never blocks on it. The UI
 * (Logs → Plan) and the release report use it to name the risk before a hop
 * fails.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export interface PlanHealthHop {
  id: string;
  god?: string;
  status?: string;
  toolBudget?: number | null;
  artifacts?: string[];
  after?: string[];
  checks?: string[];
  promptExcerpt?: string;
  /** Full source length; the Logs payload truncates the excerpt. */
  promptChars?: number;
}

export interface PlanHealth {
  hops: number;
  pending: number;
  verification: number;
  tightBudgets: number;
  largeHops: number;
  oversized: boolean;
  reasons: string[];
  recommendation: string | null;
}

/** Soft cap: a campaign above this is a profile conversation, not a hop list. */
export const PLAN_SOFT_HOP_CAP = 20;
export const PLAN_HARD_HOP_CAP = 40;

/**
 * The budget a hop's declared work suggests. It is an ESTIMATE, never a
 * hidden override; a plan can still set a lower budget deliberately and the
 * Plan Health tab will name it.
 */
export function estimateHopToolBudget(hop: PlanHealthHop): number {
  const artifacts = Array.isArray(hop.artifacts) ? hop.artifacts.length : 0;
  const checks = Array.isArray(hop.checks) ? hop.checks.length : 0;
  const promptLength = Math.max(String(hop.promptExcerpt ?? '').length, Number(hop.promptChars ?? 0) || 0);
  let budget = 16;
  if (artifacts > 1) budget += 4;
  if (artifacts > 3) budget += 4;
  if (promptLength > 3_000) budget += 4;
  if (promptLength > 6_000) budget += 4;
  if (checks > 2) budget += 4;
  if (checks > 6) budget += 4;
  return Math.min(36, budget);
}

export function planHealth(hops: PlanHealthHop[]): PlanHealth {
  const total = hops.length;
  const pending = hops.filter((h) => h.status !== 'completed').length;
  const verification = hops.filter((h) => /^(qa|gate|design-gate)[-_]/i.test(String(h.id ?? ''))).length;
  const tightBudgets = hops.filter((h) => {
    const declared = Number(h.toolBudget);
    return Number.isFinite(declared) && declared > 0 && declared < estimateHopToolBudget(h) - 4;
  }).length;
  const largeHops = hops.filter((h) => {
    const checks = Array.isArray(h.checks) ? h.checks.length : 0;
    const promptLength = Math.max(String(h.promptExcerpt ?? '').length, Number(h.promptChars ?? 0) || 0);
    return checks > 6 || promptLength > 6_000;
  }).length;
  const reasons: string[] = [];
  if (total > PLAN_SOFT_HOP_CAP) reasons.push(`${total} hops > ${PLAN_SOFT_HOP_CAP} — a delivery profile or split is recommended`);
  if (total > PLAN_HARD_HOP_CAP) reasons.push(`${total} hops > ${PLAN_HARD_HOP_CAP} — oversized for a single campaign`);
  if (verification > 6) reasons.push(`${verification} verification hops — each is a judge; consider grouping`);
  if (tightBudgets > 0) reasons.push(`${tightBudgets} hop(s) have a tool budget below the declared work estimate`);
  if (largeHops > 0) reasons.push(`${largeHops} hop(s) carry >6 checks or a >6k prompt — split before the walk`);
  const recommendation = total > PLAN_SOFT_HOP_CAP || tightBudgets > 0 || largeHops > 0
    ? 'Open a delivery profile (0.0.98-15) or split the flagged hops; the walker can run it, but the guard will park the broad ones.'
    : null;
  return {
    hops: total,
    pending,
    verification,
    tightBudgets,
    largeHops,
    oversized: total > PLAN_SOFT_HOP_CAP,
    reasons,
    recommendation,
  };
}
