/**
 * rlm/envelope.ts — v0.1.4: recursive context envelopes, bounded.
 *
 * RLM is not a second orchestration engine. OLYMPUS already has a
 * deterministic spine walking small LLM hops; the envelope maps recursion
 * onto that DAG:
 *
 *   root envelope (the campaign goal, one budget)
 *     └─ depth-1 hop (a slice, its own budget, its own artifacts)
 *          └─ depth-2 hop (a narrower slice, never deeper)
 *
 * The envelope is a CONTEXT contract: the child sees the goal, its parent's
 * artifact paths and its own budget — never the whole campaign. The plan is
 * rejected when a tree exceeds depth 2, 4 children per parent, or the budget.
 *
 * Flag: `OLYMPUS_RLM=1` enables the prompt block. Off by default in v0.1.4;
 * the plan schema still validates declared envelopes so a bad plan dies at
 * plan time, not mid-walk.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export const RLM_MAX_DEPTH = 2;
export const RLM_MAX_CHILDREN = 4;
export const RLM_MIN_BUDGET = 4_096;

export interface RlmPlanConfig {
  /** The campaign-level goal every envelope inherits. */
  goal: string;
  /** Total output budget for the tree. */
  budgetTokens: number;
  /** 1..2; default 2. */
  maxDepth?: number;
}

export interface RlmHopShape {
  id: string;
  prompt?: string;
  artifacts?: string[];
  budgetTokens?: number;
  rlmParent?: string;
  rlmDepth?: number;
}

export interface RlmValidation {
  ok: boolean;
  errors: string[];
}

export function rlmEnabled(): boolean {
  return process.env.OLYMPUS_RLM === '1';
}

/** Normalize a plan's `rlm` block; null when absent/invalid (the caller errors). */
export function normalizeRlmConfig(input: unknown): RlmPlanConfig | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const goal = typeof raw.goal === 'string' ? raw.goal.trim() : '';
  const budget = Number(raw.budgetTokens);
  if (!goal || !Number.isFinite(budget) || budget < RLM_MIN_BUDGET) return null;
  const maxDepthRaw = Number(raw.maxDepth ?? RLM_MAX_DEPTH);
  const maxDepth = Number.isFinite(maxDepthRaw)
    ? Math.max(1, Math.min(RLM_MAX_DEPTH, Math.round(maxDepthRaw)))
    : RLM_MAX_DEPTH;
  return { goal, budgetTokens: Math.round(budget), maxDepth };
}

/**
 * Validate the envelopes declared by a plan. Pure and deterministic: every
 * error names the hop and the rule, so the planner can repair the plan.
 */
export function validateRlmTree(hops: RlmHopShape[], config: RlmPlanConfig): RlmValidation {
  const errors: string[] = [];
  const byId = new Map(hops.map((h) => [h.id, h]));
  const children = new Map<string, RlmHopShape[]>();

  for (const hop of hops) {
    if (hop.rlmDepth === undefined && hop.rlmParent === undefined) continue;
    const depth = Number(hop.rlmDepth ?? 0);
    if (!Number.isInteger(depth) || depth < 1 || depth > (config.maxDepth ?? RLM_MAX_DEPTH)) {
      errors.push(`hop '${hop.id}': rlmDepth must be 1..${config.maxDepth ?? RLM_MAX_DEPTH}`);
      continue;
    }
    const parent = hop.rlmParent ? byId.get(hop.rlmParent) : null;
    if (depth > 1 && !parent) {
      errors.push(`hop '${hop.id}': rlmParent '${hop.rlmParent ?? ''}' does not resolve`);
      continue;
    }
    if (parent) {
      if ((parent.rlmDepth ?? 0) !== depth - 1) {
        errors.push(`hop '${hop.id}': parent '${parent.id}' is not at depth ${depth - 1}`);
      }
      const list = children.get(parent.id) || [];
      list.push(hop);
      children.set(parent.id, list);
    } else {
      const list = children.get('__root__') || [];
      list.push(hop);
      children.set('__root__', list);
    }
  }

  for (const [parentId, list] of children) {
    if (list.length > RLM_MAX_CHILDREN) {
      errors.push(`rlm: '${parentId}' has ${list.length} children (max ${RLM_MAX_CHILDREN})`);
    }
    const parentBudget = parentId === '__root__'
      ? config.budgetTokens
      : Number(byId.get(parentId)?.budgetTokens ?? 0);
    const sum = list.reduce((n, h) => n + Number(h.budgetTokens ?? 0), 0);
    if (parentBudget > 0 && sum > parentBudget) {
      errors.push(`rlm: '${parentId}' children budget ${sum} exceeds ${parentBudget}`);
    }
  }

  // Cycle check over rlmParent.
  const seen = new Set<string>();
  for (const hop of hops) {
    if (!hop.rlmParent) continue;
    let cur: RlmHopShape | undefined = hop;
    const chain = new Set<string>();
    while (cur?.rlmParent) {
      if (chain.has(cur.id)) {
        errors.push(`rlm: cycle in rlmParent at '${cur.id}'`);
        break;
      }
      chain.add(cur.id);
      cur = byId.get(cur.rlmParent);
    }
    for (const id of chain) seen.add(id);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * The compact prompt block a child hop receives. No full parent transcript,
 * no campaign dump — goal, parent artifacts, slice, budget, stop rule.
 */
export function composeRlmBlock(args: {
  config: RlmPlanConfig;
  hop: RlmHopShape;
  parent?: RlmHopShape | null;
}): string {
  const { config, hop, parent } = args;
  const depth = Number(hop.rlmDepth ?? 1);
  const budget = Number(hop.budgetTokens ?? 0);
  const lines = [
    `[RLM ENVELOPE — depth ${depth}/${config.maxDepth ?? RLM_MAX_DEPTH} · budget ${budget || 'inherited'} tokens]`,
    `Goal: ${config.goal.slice(0, 400)}`,
    parent ? `Parent: ${parent.id} — artifacts: ${(parent.artifacts || []).join(', ') || '—'}` : 'Parent: the campaign root',
    `Slice: ${String(hop.prompt || '').slice(0, 500)}`,
    'Rules: return the declared artifact, cite evidence, do not re-read the whole campaign, stop when the budget is spent.',
  ];
  return lines.join('\n');
}
