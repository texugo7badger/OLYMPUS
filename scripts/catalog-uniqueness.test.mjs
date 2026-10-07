#!/usr/bin/env node
/**
 * catalog-uniqueness.test.mjs — battery suite #23 (MADRUGA-UAT-BUILD-1, issue #97).
 * Run: npx tsx scripts/catalog-uniqueness.test.mjs   (exit 0 = pass)
 *
 * THE CONTRACT, gated here forever: every model-class catalog OLYMPUS can
 * hand to a consumer must be DUPLICATE-FREE. A duplicate id in the per-strategy
 * catalog reaches the Settings per-god dropdown as two <option key={c}> nodes
 * with the same key and crashes React (the 2026-10-07 UAT crash,
 * settings-dialog.tsx:1073 — free-nvidia-build active). The invariants:
 *
 *   1. every family array (FREE / GO / ZEN / OPENROUTER_FREE / NVIDIA_FREE)
 *      carries no duplicate string;
 *   2. modelClassesForStrategy() — the ONE canonical function the Settings
 *      dropdown and the /api/olympus/providers/gods override validation both
 *      consume — returns a duplicate-free list for every builtin strategy
 *      and for custom-* (the full free catalog);
 *   3. every builtin strategy's catalog is non-empty (the dedupe boundary
 *      must never silently empty a catalog);
 *   4. React-key safety: the returned entries are unique strings by (2) —
 *      the property <option key={c}> relies on.
 *
 * The 2026-10-07 defect this gates: FREE_MODEL_CLASSES carried
 * 'nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' twice (adjacent
 * literals, model-strategies.ts:833-834, introduced by 5cb2db7 SWEEP-1 S2+S3;
 * unreleased — v0.0.3 would have been the first carrier). The cure: delete the
 * literal + a [...new Set()] boundary inside modelClassesForStrategy — this
 * suite RED on the old tree, GREEN on the cured one, and stays green against
 * every future hand-edit of the arrays.
 *
 * Deterministic: pure imports of the TS module under tsx (BATT-ENV #94:
 * never bare node). No network, no fixtures, no vault.
 */

import {
  FREE_MODEL_CLASSES,
  GO_MODEL_CLASSES,
  ZEN_MODEL_CLASSES,
  OPENROUTER_FREE_MODELS,
  NVIDIA_FREE_MODELS,
  modelClassesForStrategy,
} from '../src/lib/model-strategies';

let fails = 0;
let checked = 0;
const check = (name, ok, detail = '') => {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${String(detail).slice(0, 300)}`}`);
  if (!ok) fails++;
};

/** The duplicate finder: returns the duplicated strings (order of first re-hit). */
const dupesOf = (list) => {
  const seen = new Set();
  const dupes = new Set();
  for (const x of list) {
    if (seen.has(x)) dupes.add(x);
    seen.add(x);
  }
  return [...dupes];
};

// ── (1) the family arrays ────────────────────────────────────────────────────
check('F1: FREE_MODEL_CLASSES has no duplicate ids', dupesOf(FREE_MODEL_CLASSES).length === 0,
  `duplicates: ${JSON.stringify(dupesOf(FREE_MODEL_CLASSES))} (the #97 UAT crash root)`);
check('F2: GO_MODEL_CLASSES has no duplicate ids', dupesOf(GO_MODEL_CLASSES).length === 0,
  `duplicates: ${JSON.stringify(dupesOf(GO_MODEL_CLASSES))}`);
check('F3: ZEN_MODEL_CLASSES has no duplicate ids', dupesOf(ZEN_MODEL_CLASSES).length === 0,
  `duplicates: ${JSON.stringify(dupesOf(ZEN_MODEL_CLASSES))}`);
check('F4: OPENROUTER_FREE_MODELS has no duplicate ids', dupesOf(OPENROUTER_FREE_MODELS).length === 0,
  `duplicates: ${JSON.stringify(dupesOf(OPENROUTER_FREE_MODELS))}`);
check('F5: NVIDIA_FREE_MODELS has no duplicate ids', dupesOf(NVIDIA_FREE_MODELS).length === 0,
  `duplicates: ${JSON.stringify(dupesOf(NVIDIA_FREE_MODELS))}`);

// ── (2)+(4) the canonical per-strategy function — React-key safety ──────────
const BUILTIN_STRATEGIES = [
  'free-openrouter', 'free-nvidia-build', 'free-big-pickle',
  'go-max-quality', 'go-balanced', 'go-budget',
  'zen-max-quality', 'zen-balanced', 'zen-budget',
];
for (const strat of BUILTIN_STRATEGIES) {
  const list = modelClassesForStrategy(strat);
  check(`S: modelClassesForStrategy('${strat}') returns a duplicate-free list (React-key safe)`,
    dupesOf(list).length === 0,
    `duplicates: ${JSON.stringify(dupesOf(list))}`);
}
{
  const list = modelClassesForStrategy('custom-any-slug');
  check('S: modelClassesForStrategy(custom-*) returns a duplicate-free list (the full free catalog)',
    dupesOf(list).length === 0,
    `duplicates: ${JSON.stringify(dupesOf(list))}`);
}

// ── (3) non-empty: the dedupe boundary must never empty a catalog ───────────
for (const strat of BUILTIN_STRATEGIES) {
  const list = modelClassesForStrategy(strat);
  check(`S: modelClassesForStrategy('${strat}') is non-empty (${list.length} classes)`,
    Array.isArray(list) && list.length > 0,
    `got: ${JSON.stringify(list)}`);
}
{
  const list = modelClassesForStrategy('custom-any-slug');
  check('S: modelClassesForStrategy(custom-*) is non-empty',
    Array.isArray(list) && list.length > 0,
    `got: ${JSON.stringify(list)}`);
}

// ── the #97 observation (informational pin, not a magic count): the cured ────
// NVIDIA lane list must have shrunk by exactly the duplicate (10 → 9 on the
// defect tree; stays honest against future legitimate lane additions because
// it asserts the DEDUPE, not a count).
check('X: NVIDIA_FREE_MODELS equals its own Set (filter-derived arrays inherit no dupes)',
  NVIDIA_FREE_MODELS.length === new Set(NVIDIA_FREE_MODELS).size,
  `raw ${NVIDIA_FREE_MODELS.length} vs unique ${new Set(NVIDIA_FREE_MODELS).size}`);

console.log('');
if (fails > 0) {
  console.log(`catalog-uniqueness: ${fails} FAIL(S) — the catalog carries duplicates (issue #97 class)`);
  process.exit(1);
}
console.log(`All ${checked} catalog-uniqueness (#97 dupe-free catalogs + React-key safety) assertions passed`);
process.exit(0);
