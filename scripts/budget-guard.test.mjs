#!/usr/bin/env node
/**
 * budget-guard.test.mjs — MADRUGA-FIX-2 F1: the config-level output-budget
 * guard (the #76/D31 root-cause fixture). Run: npx tsx scripts/budget-guard.test.mjs
 *
 * THRESHOLD DERIVATION (evidence, not vibes — from the fix-1 F4 records):
 * a COMPLETE landing kit measured 38,532 source bytes ≈ 9,633 output tokens
 * (the successful "Cafeteria Grão & Alma" tree); every length-cut turn died
 * at 2,015–2,039 output tokens — the configured caps (1024–2048) were the
 * BINDING constraint (three `reason: 'length'` cuts verbatim). Floor: 8192
 * (full kit + margin). Ceiling applied in the fix: 16384.
 *
 * The guard: every provider-lane model a generation can take must declare
 * limit.output >= the floor. RED pre-fix: 12/12 lanes failed. Battery suite.
 */
import { readFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
const FLOOR = 8192;

const c = JSON.parse(readFileSync(`${ROOT}opencode.json`, 'utf-8'));
const lanes = [];
for (const [pid, b] of Object.entries(c.provider || {})) {
  for (const [mid, mc] of Object.entries(b.models || {})) {
    const out = mc?.limit?.output;
    lanes.push({ lane: `${pid}/${mid}`, output: typeof out === 'number' ? out : null });
  }
}
let fails = 0;
console.log(`budget-guard: FLOOR=${FLOOR} (derived: kit ≈9,633 tok; cuts died 2,015–2,039)`);
for (const l of lanes) {
  const ok = l.output !== null && l.output >= FLOOR;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${l.lane}: limit.output=${l.output}`);
  if (!ok) fails++;
}

// ─── F2 (MADRUGA-FIX-3): the GENERATOR surface (N29 closed — the guard
// declares both surfaces: the working-tree config + the generator table).
// The table is the source of truth the apply enforces; if it sickens, every
// future apply re-infects the live config (the false-green chain).
const genTable = (await import('./apply-strategy.js')).FREE_MODEL_LIMITS;
console.log(`surface 2: GENERATOR table (${Object.keys(genTable).length} lanes)`);
for (const [id, lim] of Object.entries(genTable)) {
  const ok = lim.output >= FLOOR;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [generator] ${id}: output=${lim.output}`);
  if (!ok) fails++;
}
if ('nvidia/z-ai/glm-5.2' in genTable) { console.log('FAIL  [generator] dead pin z-ai/glm-5.2 present in the table'); fails++; }

if (fails > 0) { console.error(`\n${fails}/${lanes.length} generation lanes UNDER the sizing floor — the #76 root cause is LIVE in the tracked config`); process.exit(1); }
console.log(`\nAll ${lanes.length} generation lanes sized ≥ ${FLOOR}`);
