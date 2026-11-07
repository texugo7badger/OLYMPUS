/**
 * plan-generation.ts — v0.0.88: a campaign is a GENERATION, not a mutable file.
 *
 * THE SPECIMEN (AIME 07/11): `dispatch-plan.json` went 79 → 67 → 72 → 75 → 76
 * → 27 → 35 hops while walks were running. The walker held a 21-hop snapshot,
 * the log said "5/21 done", and the next resume read a 35-hop plan with 61
 * completed ids from older generations — the user could never know where the
 * campaign stood. A plan rewrite in the middle of a walk must be STAGED and
 * applied at a hop boundary, and a completed id only survives if its hop
 * definition (prompt/command/verify/artifacts/deps) is byte-identical.
 *
 * Contract:
 *   - every plan carries `generation`, `createdAt`, `parentGeneration` and
 *     `hopHashes` (sha256 per hop definition);
 *   - `dispatch-plan.next.json` is a staged next generation; it is never
 *     written over a live plan by the planner;
 *   - `.olympus-plan-frozen.json` is the snapshot the live walk uses;
 *   - `applyNextPlan` is the only writer that advances the generation.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DispatchPlan, PlanHop } from './plan-schema';

export const FROZEN_PLAN_FILE = '.olympus-plan-frozen.json';
export const NEXT_PLAN_FILE = 'dispatch-plan.next.json';

/** Stable definition of a hop: a changed prompt/verify/artifact is a NEW hop. */
export function hopDefinition(hop: PlanHop): Record<string, unknown> {
  return {
    id: hop.id,
    kind: hop.kind ?? 'llm',
    god: hop.god,
    prompt: hop.prompt ?? '',
    command: hop.command ?? '',
    artifacts: [...(hop.artifacts ?? [])].sort(),
    after: [...(hop.after ?? [])].sort(),
    verify: hop.verify ?? null,
    skills: [...(hop.skills ?? [])].sort(),
    mcps: [...(hop.mcps ?? [])].sort(),
    demigods: [...(hop.demigods ?? [])].sort(),
    toolBudget: hop.toolBudget ?? null,
  };
}

export function hopDefinitionHash(hop: PlanHop): string {
  return crypto.createHash('sha256').update(JSON.stringify(hopDefinition(hop))).digest('hex').slice(0, 24);
}

export function computeHopHashes(plan: DispatchPlan): Record<string, string> {
  const out: Record<string, string> = {};
  for (const hop of plan.hops ?? []) out[hop.id] = hopDefinitionHash(hop);
  return out;
}

/** Assign a generation and hashes when the plan does not carry them. */
export function ensurePlanGeneration(plan: DispatchPlan, parentGeneration?: number): DispatchPlan {
  const generation = Number.isFinite(Number(plan.generation)) && Number(plan.generation) > 0
    ? Number(plan.generation)
    : 1;
  return {
    ...plan,
    generation,
    createdAt: plan.createdAt ?? new Date().toISOString(),
    ...(parentGeneration ? { parentGeneration } : {}),
    hopHashes: computeHopHashes(plan),
  };
}

export interface PlanDiff {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: string[];
}

export function diffPlans(prev: DispatchPlan | null, next: DispatchPlan): PlanDiff {
  const before = new Map((prev?.hops ?? []).map((h) => [h.id, hopDefinitionHash(h)]));
  const after = new Map((next.hops ?? []).map((h) => [h.id, hopDefinitionHash(h)]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  for (const [id, hash] of after) {
    if (!before.has(id)) added.push(id);
    else if (before.get(id) !== hash) changed.push(id);
    else unchanged.push(id);
  }
  for (const id of before.keys()) if (!after.has(id)) removed.push(id);
  return { added, removed, changed, unchanged };
}

export function readPlanFile(file: string): DispatchPlan | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as DispatchPlan; } catch { return null; }
}

export function planPath(laneRoot: string): string { return path.join(laneRoot, 'dispatch-plan.json'); }
export function frozenPlanPath(laneRoot: string): string { return path.join(laneRoot, FROZEN_PLAN_FILE); }
export function nextPlanPath(laneRoot: string): string { return path.join(laneRoot, NEXT_PLAN_FILE); }

/** Freeze the snapshot the walk will use. Returns the frozen plan. */
export function freezePlan(laneRoot: string, plan: DispatchPlan): DispatchPlan {
  const frozen = ensurePlanGeneration(plan, plan.parentGeneration);
  try { fs.writeFileSync(frozenPlanPath(laneRoot), JSON.stringify(frozen, null, 2) + '\n'); } catch { /* best effort */ }
  return frozen;
}

export function readFrozenPlan(laneRoot: string): DispatchPlan | null {
  return readPlanFile(frozenPlanPath(laneRoot));
}

/**
 * If a live walk is using the frozen plan and the planner rewrote
 * `dispatch-plan.json`, STAGE the rewrite as `dispatch-plan.next.json` and
 * restore the frozen plan. Returns the diff (or null when nothing changed).
 */
export function stagePlanRewriteIfWalking(laneRoot: string): { staged: boolean; diff?: PlanDiff } {
  const frozen = readFrozenPlan(laneRoot);
  if (!frozen) return { staged: false };
  const current = readPlanFile(planPath(laneRoot));
  if (!current) return { staged: false };
  const diff = diffPlans(frozen, current);
  if (diff.added.length + diff.removed.length + diff.changed.length === 0) return { staged: false };
  try {
    // Keep the planner's file as the staged next generation, restore the
    // frozen snapshot so the live walk can never read a half-new DAG.
    fs.writeFileSync(nextPlanPath(laneRoot), JSON.stringify({
      ...current,
      generation: (frozen.generation ?? 1) + 1,
      parentGeneration: frozen.generation ?? 1,
      createdAt: new Date().toISOString(),
      hopHashes: computeHopHashes(current),
    }, null, 2) + '\n');
    fs.writeFileSync(planPath(laneRoot), JSON.stringify(frozen, null, 2) + '\n');
    return { staged: true, diff };
  } catch {
    return { staged: false };
  }
}

export function readNextPlan(laneRoot: string): { plan: DispatchPlan | null; diff: PlanDiff | null } {
  const next = readPlanFile(nextPlanPath(laneRoot));
  if (!next) return { plan: null, diff: null };
  const frozen = readFrozenPlan(laneRoot) ?? readPlanFile(planPath(laneRoot));
  return { plan: next, diff: diffPlans(frozen, next) };
}

/** Apply the staged generation. Only call when no walk is live. */
export function applyNextPlan(laneRoot: string): { applied: boolean; generation?: number; diff?: PlanDiff } {
  const { plan, diff } = readNextPlan(laneRoot);
  if (!plan) return { applied: false };
  const frozen = readFrozenPlan(laneRoot) ?? readPlanFile(planPath(laneRoot));
  const applied = ensurePlanGeneration({ ...plan, parentGeneration: frozen?.generation ?? 1 }, frozen?.generation ?? 1);
  fs.writeFileSync(planPath(laneRoot), JSON.stringify(applied, null, 2) + '\n');
  try { fs.unlinkSync(nextPlanPath(laneRoot)); } catch { /* gone */ }
  try { fs.unlinkSync(frozenPlanPath(laneRoot)); } catch { /* gone */ }
  return { applied: true, generation: applied.generation, diff: diff ?? undefined };
}

export function discardNextPlan(laneRoot: string): boolean {
  try { fs.unlinkSync(nextPlanPath(laneRoot)); return true; } catch { return false; }
}

/**
 * Filter a completed set against the current hop definitions. Legacy state
 * without hashes keeps ids that exist in the plan (compatibility), but a
 * changed definition always invalidates.
 */
export function validCompletedForPlan(
  completed: string[],
  plan: DispatchPlan,
  stateHashes?: Record<string, string> | null,
): { valid: string[]; invalidated: string[] } {
  const hashes = plan.hopHashes ?? computeHopHashes(plan);
  const known = new Set((plan.hops ?? []).map((h) => h.id));
  const valid: string[] = [];
  const invalidated: string[] = [];
  for (const id of completed) {
    if (!known.has(id)) { invalidated.push(id); continue; }
    const stateHash = stateHashes?.[id];
    if (stateHash && hashes[id] && stateHash !== hashes[id]) { invalidated.push(id); continue; }
    valid.push(id);
  }
  return { valid, invalidated };
}
