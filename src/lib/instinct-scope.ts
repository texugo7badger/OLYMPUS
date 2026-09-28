/**
 * Instinct scoping rules — the heart of Option A's downside mitigation.
 *
 * The brain stays GLOBAL (one vault, one instinct pool). Every instinct
 * carries scope tags that determine its visibility per active project.
 *
 * Instinct frontmatter (markdown):
 *   ---
 *   god: hephaestus
 *   confidence: 0.87
 *   scope: stack                # global | stack | project
 *   stacks: [rust, postgres]    # which stacks this applies to
 *   projects: []                # which projects this is bound to (scope=project)
 *   last_used: 2026-07-07T10:30:00Z
 *   samples: 14
 *   ---
 *
 * Active project context:
 *   slug: my-rust-app
 *   stacks: [rust, postgres]
 *
 * Filter rules (codified in vault-template/05_Auto_Learning/scoping-rules.md):
 *
 *   RULE 1 (universal):     scope=global, stacks=[]      → always visible
 *   RULE 2 (stack-bound):   scope=global, stacks=[a,b]   → visible if activeStacks ∩ [a,b]
 *                           OR if effectiveConfidence ≥ 0.85 (cross-stack promotion)
 *   RULE 3 (stack-scoped):  scope=stack                  → visible only if stacks ∩ activeStacks
 *   RULE 4 (project-bound): scope=project                → visible only if projects ∋ activeSlug
 *   RULE 5 (time decay):    last_used > 90 days          → confidence -0.1
 *                           last_used > 180 days         → confidence -0.2 + PRUNE-eligible
 *   RULE 6 (browsing mode): no active project            → scope=project HIDDEN,
 *                           scope=stack/global visible (with cross-stack tint)
 *
 * References:
 *  - Anthropic Contextual Retrieval (https://www.anthropic.com/engineering/contextual-retrieval)
 *  - OpenCode instincts (https://opencode.ai/docs)
 *  - LLM hallucination prevention via scope filtering (https://tetrate.io/learn/ai/llm-hallucination-prevention)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type InstinctScope = 'global' | 'stack' | 'project';

export interface InstinctMeta {
  id: string;
  god?: string;
  confidence: number;
  scope?: InstinctScope;
  stacks?: string[];
  projects?: string[];
  last_used?: string;
  samples?: number;
  /** Original file path in the vault (for debugging / UI tooltips). */
  path?: string;
}

export interface ActiveProject {
  slug: string;
  name: string;
  path: string;
  stacks: string[];
}

export interface ScopeFilterResult {
  visible: boolean;
  reason: string;
  effectiveConfidence: number;
  crossStack?: boolean;
  rule: number;
}

/** Thresholds — exported so tests + UI can reference them. */
export const SCOPE_FILTER_CONSTANTS = {
  CROSS_STACK_CONFIDENCE_THRESHOLD: 0.85,
  DECAY_PENALTY_90D: 0.1,
  DECAY_PENALTY_180D: 0.2,
  DECAY_THRESHOLD_DAYS_90: 90,
  DECAY_THRESHOLD_DAYS_180: 180,
} as const;

/**
 * Apply time decay to a confidence score.
 * Returns the decayed confidence (never below 0).
 */
export function applyTimeDecay(instinct: InstinctMeta, now: Date = new Date()): number {
  if (!instinct.last_used) return instinct.confidence;
  const last = new Date(instinct.last_used);
  if (isNaN(last.getTime())) return instinct.confidence;
  const daysSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > SCOPE_FILTER_CONSTANTS.DECAY_THRESHOLD_DAYS_180) {
    return Math.max(0, instinct.confidence - SCOPE_FILTER_CONSTANTS.DECAY_PENALTY_180D);
  }
  if (daysSince > SCOPE_FILTER_CONSTANTS.DECAY_THRESHOLD_DAYS_90) {
    return Math.max(0, instinct.confidence - SCOPE_FILTER_CONSTANTS.DECAY_PENALTY_90D);
  }
  return instinct.confidence;
}

/** Whether an instinct is stale enough to be eligible for PRUNE. */
export function isEligibleForPrune(instinct: InstinctMeta, now: Date = new Date()): boolean {
  if (!instinct.last_used) return false;
  const last = new Date(instinct.last_used);
  if (isNaN(last.getTime())) return false;
  const daysSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > SCOPE_FILTER_CONSTANTS.DECAY_THRESHOLD_DAYS_180;
}

/**
 * Decide whether a single instinct is visible given the active project.
 * Pure function — no side effects.
 */
export function filterInstinct(
  instinct: InstinctMeta,
  activeProject: ActiveProject | null,
  now: Date = new Date(),
): ScopeFilterResult {
  const effectiveConfidence = applyTimeDecay(instinct, now);
  const scope: InstinctScope = instinct.scope ?? 'global';
  const stacks = instinct.stacks ?? [];
  const projects = instinct.projects ?? [];

  // ─── BROWSING MODE (no active project) ─────────────────────────────
  if (!activeProject) {
    if (scope === 'project') {
      return {
        visible: false,
        reason: `project-bound (bound to: ${projects.join(', ') || '?'})`,
        effectiveConfidence,
        rule: 6,
      };
    }
    if (scope === 'global' && stacks.length === 0) {
      return { visible: true, reason: 'universal (browsing)', effectiveConfidence, rule: 1 };
    }
    // stack-scoped or stack-tagged global — visible in browsing, tinted
    return {
      visible: true,
      reason: `${scope}-tagged (browsing, stacks=${stacks.join(',')})`,
      effectiveConfidence,
      crossStack: true,
      rule: 6,
    };
  }

  // ─── ACTIVE PROJECT MODE ───────────────────────────────────────────
  const activeStacks = activeProject.stacks;
  const stackIntersect = stacks.some(s => activeStacks.includes(s));

  // RULE 4 — project-bound
  if (scope === 'project') {
    const visible = projects.includes(activeProject.slug);
    return {
      visible,
      reason: visible
        ? `project match (${activeProject.slug})`
        : `project mismatch (bound to ${projects.join(', ') || '?'})`,
      effectiveConfidence,
      rule: 4,
    };
  }

  // RULE 3 — stack-scoped
  if (scope === 'stack') {
    return {
      visible: stackIntersect,
      reason: stackIntersect
        ? `stack match (${stacks.filter(s => activeStacks.includes(s)).join(',')})`
        : `stack mismatch (${stacks.join(',')} vs ${activeStacks.join(',')})`,
      effectiveConfidence,
      rule: 3,
    };
  }

  // scope === 'global'
  // RULE 1 — universal
  if (stacks.length === 0) {
    return { visible: true, reason: 'universal', effectiveConfidence, rule: 1 };
  }

  // RULE 2a — global + stack match
  if (stackIntersect) {
    return {
      visible: true,
      reason: `global + stack match (${stacks.filter(s => activeStacks.includes(s)).join(',')})`,
      effectiveConfidence,
      rule: 2,
    };
  }

  // RULE 2b — cross-stack promotion threshold
  if (effectiveConfidence >= SCOPE_FILTER_CONSTANTS.CROSS_STACK_CONFIDENCE_THRESHOLD) {
    return {
      visible: true,
      reason: `cross-stack promotion (conf=${effectiveConfidence.toFixed(2)} ≥ ${SCOPE_FILTER_CONSTANTS.CROSS_STACK_CONFIDENCE_THRESHOLD}, stacks=${stacks.join(',')})`,
      effectiveConfidence,
      crossStack: true,
      rule: 2,
    };
  }

  // Filtered out — below threshold and no stack match
  return {
    visible: false,
    reason: `cross-stack filtered (conf=${effectiveConfidence.toFixed(2)} < ${SCOPE_FILTER_CONSTANTS.CROSS_STACK_CONFIDENCE_THRESHOLD}, stacks=${stacks.join(',')})`,
    effectiveConfidence,
    rule: 2,
  };
}

export interface ScopeFilterStats {
  total: number;
  visible: number;
  hidden: number;
  crossStack: number;
  byScope: Record<InstinctScope, { total: number; visible: number }>;
  byRule: Record<number, { total: number; visible: number }>;
  byReason: Record<string, number>;
}

/** Apply the filter to a list of instincts. Returns visible list + stats. */
export function filterInstincts(
  instincts: InstinctMeta[],
  activeProject: ActiveProject | null,
  now: Date = new Date(),
): { filtered: InstinctMeta[]; stats: ScopeFilterStats } {
  const filtered: InstinctMeta[] = [];
  const stats: ScopeFilterStats = {
    total: instincts.length,
    visible: 0,
    hidden: 0,
    crossStack: 0,
    byScope: {
      global:  { total: 0, visible: 0 },
      stack:   { total: 0, visible: 0 },
      project: { total: 0, visible: 0 },
    },
    byRule: {},
    byReason: {},
  };

  for (const inst of instincts) {
    const scope: InstinctScope = inst.scope ?? 'global';
    stats.byScope[scope].total++;

    const result = filterInstinct(inst, activeProject, now);

    if (!stats.byRule[result.rule]) stats.byRule[result.rule] = { total: 0, visible: 0 };
    stats.byRule[result.rule].total++;
    stats.byReason[result.reason] = (stats.byReason[result.reason] || 0) + 1;

    if (result.visible) {
      filtered.push(inst);
      stats.visible++;
      stats.byScope[scope].visible++;
      stats.byRule[result.rule].visible++;
      if (result.crossStack) stats.crossStack++;
    } else {
      stats.hidden++;
    }
  }

  return { filtered, stats };
}

/**
 * Parse instinct frontmatter from a markdown file content.
 * Returns null if the file is not a valid instinct.
 *
 * The frontmatter parser is intentionally permissive: it accepts both
 * YAML arrays (`stacks: [a, b]`) and comma-separated strings
 * (`stacks: a, b`). It also accepts the legacy `project: foo` field
 * (single string) and migrates it to `projects: [foo]`.
 */
export function parseInstinctFrontmatter(
  raw: string,
  defaultId?: string,
): InstinctMeta | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;

  const fm: Record<string, any> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val: string = kv[2].trim();

    // Array form: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1);
      fm[key] = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    // Boolean
    else if (val === 'true' || val === 'false') {
      fm[key] = val === 'true';
    }
    // Number
    else if (/^-?\d+(\.\d+)?$/.test(val)) {
      fm[key] = parseFloat(val);
    }
    // Quoted string
    else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      fm[key] = val.slice(1, -1);
    }
    // Comma-separated list heuristic: if the field name is plural and the value contains commas
    else if ((key === 'stacks' || key === 'projects') && val.includes(',')) {
      fm[key] = val.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    // Plain string
    else {
      fm[key] = val;
    }
  }

  // Legacy migration: project (string) → projects (array)
  if (typeof fm.project === 'string' && !fm.projects) {
    fm.projects = [fm.project];
  }

  // Validate required fields
  if (typeof fm.confidence !== 'number') return null;

  const id = fm.id || defaultId || `instinct-${Math.random().toString(36).slice(2, 8)}`;
  const scope = (typeof fm.scope === 'string' && ['global', 'stack', 'project'].includes(fm.scope))
    ? fm.scope as InstinctScope
    : 'global';

  return {
    id,
    god: typeof fm.god === 'string' ? fm.god : undefined,
    confidence: fm.confidence,
    scope,
    stacks: Array.isArray(fm.stacks) ? fm.stacks : [],
    projects: Array.isArray(fm.projects) ? fm.projects : [],
    last_used: typeof fm.last_used === 'string' ? fm.last_used : undefined,
    samples: typeof fm.samples === 'number' ? fm.samples : undefined,
    path: typeof fm.path === 'string' ? fm.path : undefined,
  };
}
