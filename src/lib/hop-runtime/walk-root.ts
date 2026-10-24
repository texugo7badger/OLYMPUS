/**
 * walk-root.ts — WHERE the hop runtime reads the plan (and writes the code).
 *
 * THE SPECIMEN (AIME, 2026-10-24 00:00–00:11): the project note lives at
 * ~/OLYMPUS-VAULT/02_Projects/aime, the warm session's cwd is the workspace
 * lane ~/.local/share/olympus/workspace/aime, and the planner wrote
 * dispatch-plan.json to the LANE (its cwd) — while the post-run looked for it
 * in the note home and silently returned "no plan". The walk never fired, no
 * hop-state/telemetry ever appeared, and every "continue" looked like a
 * broken seam. It was a root split, not a seam.
 *
 * THE RULE (deterministic, no LLM): the runtime walks where the PLAN IS.
 *   1. the first candidate carrying dispatch-plan.json wins;
 *   2. else the first candidate carrying plan.md (the planner's working lane);
 *   3. else the first existing directory;
 *   4. else the first candidate (the caller always passes at least one).
 *
 * Candidates are ordered by the caller: the dispatch cwd (the lane the model
 * actually writes to) first, then the project note home. A project that only
 * exists in the vault still resolves to the vault.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DISPATCH_PLAN_FILENAME } from './post-run';

export type WalkRootReason = 'plan-on-disk' | 'lane-plan-md' | 'lane-cwd' | 'default';

export interface WalkRootResolution {
  root: string;
  reason: WalkRootReason;
  /** The candidates as given (deduped) — the honest picture for the log. */
  candidates: string[];
  /** Set when the plan was found somewhere OTHER than the first candidate. */
  movedFrom?: string;
}

/**
 * Pick the directory the walk must use. Pure filesystem logic — no registry,
 * no network, no config: the caller supplies the candidate roots in priority
 * order (lane first, note home second).
 */
export function pickPlanRoot(candidates: Array<string | null | undefined>): WalkRootResolution {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const c of candidates) {
    if (!c || typeof c !== 'string' || seen.has(c)) continue;
    seen.add(c);
    list.push(c);
  }
  if (list.length === 0) {
    return { root: process.cwd(), reason: 'default', candidates: [] };
  }
  const first = list[0];
  // 1. an existing plan is the truth, wherever it is
  for (const root of list) {
    if (existsSync(join(root, DISPATCH_PLAN_FILENAME))) {
      return { root, reason: 'plan-on-disk', candidates: list, ...(root !== first ? { movedFrom: first } : {}) };
    }
  }
  // 2. the planner's working lane (plan.md) — where the next write will land
  for (const root of list) {
    if (existsSync(join(root, 'plan.md'))) {
      return { root, reason: 'lane-plan-md', candidates: list, ...(root !== first ? { movedFrom: first } : {}) };
    }
  }
  // 3. the first real directory
  for (const root of list) {
    if (existsSync(root)) {
      return { root, reason: 'lane-cwd', candidates: list, ...(root !== first ? { movedFrom: first } : {}) };
    }
  }
  // 4. nothing exists yet — the caller's first choice (a planning turn will
  //    create it; the plan-wait polls there).
  return { root: first, reason: 'default', candidates: list };
}

/** The honest one-liner a caller can surface when the root moved. */
export function walkRootNote(res: WalkRootResolution): string | null {
  if (!res.movedFrom) return null;
  return `Plan root resolved to ${res.root} (${res.reason}) — the project note home ${res.movedFrom} had no plan.`;
}
