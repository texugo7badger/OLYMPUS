#!/usr/bin/env node
/**
 * strategy-registry.test.mjs — v0.0.22 strategy registry law.
 * Run: npx tsx scripts/strategy-registry.test.mjs
 *
 * The free tier is RETIRED (v0.0.22). This suite pins the registry that
 * replaced it, so a future edit cannot resurrect a dead lane:
 *
 *   S1  the LLMStrategy type carries NO free-* id
 *   S2  LLM_STRATEGIES carries no free-hybrid / free-* alias entry
 *   S3  `local` exists in BOTH mirrors (TS canonical + apply-strategy.js)
 *   S4  every built-in strategy maps all 10 gods
 *   S5  the legacy free ids are refused by normalizeStrategyId (loud error)
 *   S6  the tier vocabulary is quality|balanced|budget|local|custom (no 'free')
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

let failures = 0, checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${detail}`}`);
  if (!ok) failures++;
}

const TS = fs.readFileSync(join(ROOT, 'src', 'lib', 'model-strategies.ts'), 'utf-8');
const JS = fs.readFileSync(join(ROOT, 'scripts', 'apply-strategy.js'), 'utf-8');

// S1 — the type carries no free-* id. The type block ends at `custom-${string}`.
const typeBlock = TS.slice(TS.indexOf('export type LLMStrategy ='), TS.indexOf('export const GOD_IDS'));
const freeIds = [...typeBlock.matchAll(/'free-[a-z-]+'/g)].map((m) => m[0]);
check('S1 LLMStrategy type carries no free-* id', freeIds.length === 0, freeIds.join(', '));

// S2 — no free strategy entry in the canonical table.
check('S2 LLM_STRATEGIES has no free-hybrid entry', !/'free-hybrid'\s*:/.test(TS));
check('S2 LLM_STRATEGIES has no legacy free alias entry',
  !/'free-(openrouter|big-pickle|nvidia-build)'\s*:/.test(TS));

// S3 — local exists in both mirrors.
const tsLocal = /'local'\s*:\s*\{[\s\S]*?plan:\s*'LOCAL'/.test(TS);
const jsLocal = /'local'\s*:\s*\{[\s\S]*?apollo:/.test(JS);
check('S3 local strategy in model-strategies.ts (plan: LOCAL)', tsLocal);
check('S3 local strategy in apply-strategy.js BUILTIN_STRATEGIES', jsLocal);

// S4 — every built-in strategy maps all 10 gods. Parse the apply mirror.
const GODS = ['apollo','atlas','artemis','athena','dionysus','hephaestus','hermes','persephone','prometheus','callimachus'];
const builtinRegion = JS.slice(JS.indexOf('const BUILTIN_STRATEGIES = {'), JS.indexOf('const SMALL_MODEL_GO'));
const strategyBlocks = [...builtinRegion.matchAll(/'([a-z0-9-]+)'\s*:\s*\{([\s\S]*?)\n  \},/g)];
check('S4 built-in strategy count ≥ 7', strategyBlocks.length >= 7, `found ${strategyBlocks.length}`);
for (const [, id, block] of strategyBlocks) {
  const missing = GODS.filter((g) => !new RegExp(`\\b${g}\\s*:`).test(block));
  check(`S4 ${id} maps all 10 gods`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

// S5 — the legacy ids are refused loudly.
const norm = JS.slice(JS.indexOf('export function normalizeStrategyId'), JS.indexOf('export function normalizeStrategyId') + 600);
check('S5 normalizeStrategyId refuses free-*', /free tier is retired/i.test(norm));

// S6 — the tier vocabulary.
const tier = TS.match(/export type LLMStrategyTier\s*=\s*([^;]+);/);
const tierLine = tier ? tier[1] : '';
check('S6 tier includes local', /'local'/.test(tierLine));
check('S6 tier excludes free', !/'free'/.test(tierLine));

console.log(`\nstrategy-registry: ${checked - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
