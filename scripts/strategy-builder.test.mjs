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

// B8 — the retired free-tier UI is gone from the strategy surfaces.
const PROVIDER = fs.readFileSync(join(ROOT, 'src/components/olympus/provider-settings.tsx'), 'utf-8');
check('B8 no Free-tier Providers heading', !/Free-tier Providers/.test(PROVIDER));
check('B8 no "No GO or ZEN plan? Free" heading', !/No GO or ZEN plan\? Free/.test(PROVIDER));
check('B8 no FREE badge on the Local card', !/>FREE</.test(PROVIDER));
check('B8 no dead free strategy plumbing', !/FREE_STRATEGY_PROVIDER|activeFreeNeedsKey|unlockedFreeStrategies/.test(PROVIDER));

// B9 — one custom-strategy entry point (Build), the old modal is gone.
check('B9 exactly one Build entry point', (SETTINGS.match(/setBuilderOpen\(true\)/g) || []).length === 1, String((SETTINGS.match(/setBuilderOpen\(true\)/g) || []).length));
check('B9 old custom-strategy modal removed', !/Custom Strategy Creator Modal/.test(SETTINGS) && !/createCustomStrategy/.test(SETTINGS));

// B10 — the catalogue marks registered + free.
{
  const r = fs.readFileSync(modelsRoute, 'utf-8');
  check('B10 models route returns registered', /registered:/.test(r));
  check('B10 models route returns a free flag', /free:/.test(r));
  check('B10 models route summarizes providers', /providers,/.test(r) && /freeCount/.test(r));
}

// B11 — the Builder defaults to registered and matches the free flag.
{
  const b = fs.readFileSync(builder, 'utf-8');
  check('B11 registered-only default', /useState\(true\)/.test(b) && /registeredOnly && !m\.registered/.test(b));
  check('B11 free filter + free query', /freeOnly/.test(b) && /q === 'free' && m\.free/.test(b));
  check('B11 free warning banner', /rate-limited and often much slower/.test(b));
  check('B11 provider chips', /registeredProviderChips/.test(b));
}

// B12 — the custom route rejects an unregistered provider.
{
  const r = fs.readFileSync(customRoute, 'utf-8');
  check('B12 custom route imports the registration check', /isProviderRegistered/.test(r));
  check('B12 custom route refuses unregistered providers', /not registered on this machine/.test(r));
}

// B13 — the refresh-free-models script is gone.
check('B13 scripts/refresh-free-models.js is gone', !fs.existsSync(join(ROOT, 'scripts/refresh-free-models.js')));

console.log(`\nstrategy-builder: ${checked - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
