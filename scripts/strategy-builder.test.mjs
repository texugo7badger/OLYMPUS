#!/usr/bin/env node
/**
 * strategy-builder.test.mjs — v0.0.23 strategy engine law.
 * Run: npx tsx scripts/strategy-builder.test.mjs
 *
 * Pins the rebuilt rosters and the interactive builder wiring:
 *
 *   B1  DeepSeek V4.1 Flash is Apollo's lane in ALL THREE GO strategies
 *   B2  DeepSeek V4 Pro is absent from every roster (the 1017 line replaced it)
 *   B3  BYOK is gone from the type, the store and the settings surfaces
 *   B4  the model catalogue route exists and reads OpenCode's cache
 *   B5  the custom-strategy route validates all 10 gods + catalogue ids
 *   B6  the Strategy Builder component exists and searches id/name/provider
 *   B7  apply-strategy exposes no byok branch and knows `local`
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0, checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${detail}`}`);
  if (!ok) failures++;
}

const TS = fs.readFileSync(join(ROOT, 'src/lib/model-strategies.ts'), 'utf-8');
const APPLY = fs.readFileSync(join(ROOT, 'scripts/apply-strategy.js'), 'utf-8');
const STORE = fs.readFileSync(join(ROOT, 'src/lib/olympus-store.ts'), 'utf-8');
const SETTINGS = fs.readFileSync(join(ROOT, 'src/components/olympus/settings-dialog.tsx'), 'utf-8');

// B1 — Apollo on DS 4.1 Flash in every GO roster.
for (const key of ['go-max-quality', 'go-balanced', 'go-budget']) {
  const i = TS.indexOf(`'${key}': {`);
  const j = TS.indexOf("gods: {", i);
  const block = TS.slice(j, TS.indexOf("},", j));
  check(`B1 ${key}.apollo = deepseek-v4.1-flash`, /apollo:\s+'opencode-go\/deepseek-v4\.1-flash'/.test(block));
}

// B2 — no V4 Pro in any roster (only catalogues/pricing may mention it).
const rosterRegion = TS.slice(TS.indexOf('export const LLM_STRATEGIES'), TS.indexOf('export type StrategyFamily'));
check('B2 no deepseek-v4-pro in the rosters', !/deepseek-v4-pro/.test(rosterRegion));

// B3 — BYOK gone.
check('B3 no byok in the strategy type', !/byok-deepseek/.test(TS));
check('B3 no byok in the store type', !/byok-/.test(STORE));
check('B3 no BYOK family in settings', !/'BYOK'/.test(SETTINGS));

// B4 — catalogue route.
const modelsRoute = join(ROOT, 'src/app/api/olympus/models/route.ts');
check('B4 /api/olympus/models exists', fs.existsSync(modelsRoute));
if (fs.existsSync(modelsRoute)) {
  const r = fs.readFileSync(modelsRoute, 'utf-8');
  check('B4 route reads the OpenCode cache', /\.cache.*opencode.*models\.json/s.test(r));
  check('B4 route returns providers + fits', /providers,/.test(r) && /fits/.test(r));
}

// B5 — custom route.
const customRoute = join(ROOT, 'src/app/api/olympus/strategy/custom/route.ts');
check('B5 custom-strategy route exists', fs.existsSync(customRoute));
if (fs.existsSync(customRoute)) {
  const r = fs.readFileSync(customRoute, 'utf-8');
  check('B5 validates all ten gods', /GOD_IDS\.filter/.test(r));
  check('B5 validates catalogue ids', /catalogue\.has/.test(r));
  check('B5 writes custom-strategies.json', /custom-strategies\.json/.test(r));
}

// B6 — builder component.
const builder = join(ROOT, 'src/components/olympus/strategy-builder.tsx');
check('B6 Strategy Builder exists', fs.existsSync(builder));
if (fs.existsSync(builder)) {
  const b = fs.readFileSync(builder, 'utf-8');
  check('B6 searches id + name + provider', /m\.id\.toLowerCase\(\)\.includes\(q\)/.test(b) && /m\.provider\.toLowerCase/.test(b));
  check('B6 renders a per-god picker', /GOD_IDS\.map/.test(b));
  check('B6 posts to the custom route', /\/api\/olympus\/strategy\/custom/.test(b));
}

// B7 — apply strategy knows local, has no byok branch.
check('B7 apply has a local branch', /strategy === 'local'/.test(APPLY));
check('B7 apply has no byok family', !/strategy\.startsWith\('byok-'\)/.test(APPLY));

console.log(`\nstrategy-builder: ${checked - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
