#!/usr/bin/env node
/**
 * check-strategy-sync.js
 *
 * Verifies that LLM_STRATEGIES in src/lib/model-strategies.ts matches
 * BUILTIN_STRATEGIES in scripts/apply-strategy.js. The two must stay in
 * sync — if they drift, the strategy switcher in the UI will show one
 * thing while the apply-strategy.js script writes another.
 *
 * Run as part of the dev workflow:
 *   node scripts/check-strategy-sync.js
 *
 * Exit code 0 = sync OK. Exit code 1 = drift detected (prints the diff).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

// Converted from CommonJS `require` to ESM `import`
// because package.json has "type": "module" (all .js files are ESM).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const MODEL_STRATEGIES_PATH = path.join(ROOT, 'src', 'lib', 'model-strategies.ts');
const APPLY_STRATEGY_PATH = path.join(ROOT, 'scripts', 'apply-strategy.js');

function fail(msg) {
  console.error(`[check-strategy-sync] FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[check-strategy-sync] OK: ${msg}`);
}

if (!fs.existsSync(MODEL_STRATEGIES_PATH)) {
  fail(`missing ${MODEL_STRATEGIES_PATH}`);
}
if (!fs.existsSync(APPLY_STRATEGY_PATH)) {
  fail(`missing ${APPLY_STRATEGY_PATH}`);
}

const msContent = fs.readFileSync(MODEL_STRATEGIES_PATH, 'utf-8');
const asContent = fs.readFileSync(APPLY_STRATEGY_PATH, 'utf-8');

// Resolve the free-big-pickle default (apply-strategy.js references the
// FREE_BIG_PICKLE_MODEL constant instead of a string literal). The const is
// a multi-line expression (env override || live refresh || curated default),
// so match the curated literal after the last `||` (allow whitespace/newline
// between `||` and the quote).
const bpMatch = asContent.match(/const FREE_BIG_PICKLE_MODEL =[\s\S]*?\|\|\s*'([^']+)'/);
const BP_DEFAULT = bpMatch ? bpMatch[1] : '';

// Normalize a raw god value (either a quoted 'provider/model' string or the
// FREE_BIG_PICKLE_MODEL constant) to the bare model id.
function godValue(raw, constantName) {
  if (constantName === 'FREE_BIG_PICKLE_MODEL') return BP_DEFAULT.replace(/^[a-z-]+\//, '');
  // NOTE: `opencode-go` MUST stay before `opencode` in the alternation —
  // regex alternation is ordered and `opencode` would otherwise consume the
  // `opencode-go/` prefix leaving `-go/model` behind. `nvidia` ids are
  // double-prefixed (nvidia/nvidia/...) — stripping the FIRST nvidia/
  // prefix leaves `nvidia/<model>` which both sides normalize identically.
  return (raw || '').replace(/^(opencode-go|opencode|groq|openrouter|nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta|nvidia)\//, '');
}

// Extract the LLM_STRATEGIES object from model-strategies.ts.
// Format:
//   'go-balanced': {
//     ... other fields ...
//     gods: {
//       apollo: 'opencode-go/glm-5.2',
//       ...
//     },
//     ...
//   }
const msStrategies = {};
const msStrategiesPrefixed = {};
const msStrategyRegex = /'((?:go|free|zen)-[a-z-]+)':\s*\{[\s\S]*?gods:\s*\{([\s\S]*?)\}/g;
let m;
while ((m = msStrategyRegex.exec(msContent)) !== null) {
  const stratName = m[1];
  const godsBlock = m[2];
  const gods = {};
  // Model IDs contain hyphens and slashes (e.g. openai/gpt-oss-20b:free),
  // so the character class must include '-', '/', '.', ':' and '_'.
  // `opencode-go` MUST precede `opencode` in the alternation (ordered regex).
  const godRegex = /([a-z]+):\s*'((?:opencode-go|opencode|groq|openrouter|nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta|nvidia)\/[a-z0-9._:/-]+)'/g;
  let g;
  while ((g = godRegex.exec(godsBlock)) !== null) {
    gods[g[1]] = g[2].replace(/^(?:opencode-go|opencode|groq|openrouter|nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta|nvidia)\//, '');
    msStrategiesPrefixed[stratName] = msStrategiesPrefixed[stratName] || {};
    msStrategiesPrefixed[stratName][g[1]] = g[2];
  }
  msStrategies[stratName] = gods;
}

// Extract BUILTIN_STRATEGIES from apply-strategy.js.
// Format (FLAT — no `gods:` wrapper):
//   'go-balanced': {
//     apollo: 'opencode-go/glm-5.2',
//     ...
//   }
//
// NOTE: apply-strategy.js also has FREE_GROQ_ONLY / FREE_OPENROUTER_ONLY
// blocks with god keys. Those are filtered out because the strategy-name
// regex only matches 'go-*' / 'free-*' quoted keys, and the free-big-pickle
// block uses the FREE_BIG_PICKLE_MODEL constant for god values.
const GOD_NAMES = new Set(['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus']);
const asStrategies = {};
const asStrategyRegex = /['"]((?:go|free|zen)-[a-z-]+)['"]:\s*\{([^}]*)\}/g;
while ((m = asStrategyRegex.exec(asContent)) !== null) {
  const stratName = m[1];
  const godsBlock = m[2];
  const gods = {};
  // Matches either a quoted 'provider/model' value or the
  // FREE_BIG_PICKLE_MODEL constant.
  const godRegex = /([a-z]+):\s*(?:'((?:opencode-go|opencode|groq|openrouter|nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta|nvidia)\/[a-z0-9._:/-]+)'|([A-Z_]+))/g;
  let g;
  while ((g = godRegex.exec(godsBlock)) !== null) {
    gods[g[1]] = godValue(g[2], g[3]);
  }
  // Only register strategies that have at least one canonical god name.
  const godKeys = Object.keys(gods);
  const hasGodNames = godKeys.some(k => GOD_NAMES.has(k));
  if (hasGodNames) {
    asStrategies[stratName] = gods;
  }
}

// Compare.
const msKeys = Object.keys(msStrategies).sort();
const asKeys = Object.keys(asStrategies).sort();
if (msKeys.length === 0) fail('no strategies found in model-strategies.ts');
if (asKeys.length === 0) fail('no strategies found in apply-strategy.js');

if (msKeys.join(',') !== asKeys.join(',')) {
  fail(`strategy name mismatch:\n  model-strategies.ts: ${msKeys.join(', ')}\n  apply-strategy.js:   ${asKeys.join(', ')}`);
}

const allGods = ['apollo','atlas','artemis','athena','dionysus','hephaestus','hermes','persephone','prometheus','callimachus'];
let drift = false;
for (const strat of msKeys) {
  for (const god of allGods) {
    const msModel = msStrategies[strat][god];
    const asModel = asStrategies[strat][god];
    if (msModel !== asModel) {
      console.error(`  DRIFT  ${strat}.${god}: model-strategies.ts=${msModel || '(missing)'}  apply-strategy.js=${asModel || '(missing)'}`);
      drift = true;
    }
  }
}

if (drift) {
  fail('strategy tables drifted — see diff above. Update one to match the other.');
}

// ---- Extended mirror checks (2026-09-28) -----------------------------------
// The rotation incident (stale glm-5.2 defaults in the Settings UI) happened
// because FOUR mirrors of LLM_STRATEGIES existed outside this guard. Each is
// now compared against the canonical map; drift reports file:line and exits 1.
//
// NOTE: provider prefixes (opencode-go/, opencode/) are stripped before
// comparison — mirrors that swap a GO model for a ZEN model with the same
// id would NOT be caught. This matches the original checker's behavior.

const HOOKS_PATH = path.join(ROOT, '.opencode', 'olympus', 'olympus-hooks.ts');
const OLYMPUS_TS_PATH = path.join(ROOT, 'src', 'lib', 'olympus.ts');
const ROUTE_TS_PATH = path.join(ROOT, 'src', 'app', 'api', 'olympus', 'providers', 'gods', 'route.ts');
const DIALOG_TSX_PATH = path.join(ROOT, 'src', 'components', 'olympus', 'settings-dialog.tsx');

function readOrNull(p) {
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8');
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

// Extract `god -> model` pairs from a strategy-map mirror (nested format:
// "go-balanced": { apollo: "opencode-go/...", ... }). Normalized to bare ids,
// matching the canonical extraction. Also returns the line of each strategy
// key for drift reporting.
function extractStrategyMirror(content, marker, label) {
  if (content === null) fail(`${label}: file missing (marker "${marker}")`);
  const start = content.indexOf(marker);
  if (start === -1) fail(`${label}: marker "${marker}" not found`);
  const region = content.slice(start, start + 10000);
  const baseLine = lineOf(content, start);
  const result = {};
  const lines = {};
  const stratRe = /['"]((?:go|free|zen)-[a-z-]+)['"]:\s*\{([^}]*)\}/g;
  let m;
  while ((m = stratRe.exec(region)) !== null) {
    const stratName = m[1];
    const gods = {};
    const godRe = /([a-z]+):\s*['"]((?:opencode-go|opencode|groq|openrouter|nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta|nvidia)\/[a-z0-9._:/-]+)['"]/g;
    let g;
    while ((g = godRe.exec(m[2])) !== null) {
      if (GOD_NAMES.has(g[1])) {
        gods[g[1]] = g[2].replace(/^(?:opencode-go|opencode|groq|openrouter|nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta|nvidia)\//, '');
      }
    }
    result[stratName] = gods;
    lines[stratName] = baseLine + lineOf(region, m.index);
  }
  return { result, lines, label };
}

// Extract `god -> model` pairs from a FLAT default map. Handles three field
// shapes: { model: '...' } (olympus.ts GOD_META), { default_class: '...' }
// (route.ts GOD_META), and bare pairs god: '...' (DEFAULT_CLASSES).
function extractDefaultPairs(content, marker, field, label) {
  if (content === null) fail(`${label}: file missing (marker "${marker}")`);
  const start = content.indexOf(marker);
  if (start === -1) fail(`${label}: marker "${marker}" not found`);
  const end = content.indexOf('\n};', start);
  if (end === -1) fail(`${label}: closing "};" for "${marker}" not found`);
  const region = content.slice(start, end);
  const baseLine = lineOf(content, start);
  const pairs = {};
  const lines = {};
  const re = (field === 'model' || field === 'default_class')
    ? new RegExp(
        '([a-z]+):\\s*\\{[^}]*?' + field + ":\\s*'(?:opencode-go|opencode|groq|openrouter|nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta|nvidia)\\/([a-z0-9._:/-]+)'",
        'g',
      )
    : /([a-z]+):\s*'(?:opencode-go|opencode|groq|openrouter|nvidia-glm|nvidia-deepseek|nvidia-kimi|nvidia-meta|nvidia)\/([a-z0-9._:/-]+)'/g;
  let m;
  while ((m = re.exec(region)) !== null) {
    if (!GOD_NAMES.has(m[1])) continue;
    pairs[m[1]] = m[2];
    lines[m[1]] = baseLine + lineOf(region, m.index);
  }
  return { pairs, lines, label };
}

// Pricing coverage: every PAID model used by the strategies (opencode-go/,
// opencode/) must have a MODEL_PRICING_USD_PER_1M entry so the Cost
// Dashboard never reports $0. Free-tier models (openrouter/, nvidia/) have
// no per-token price and are excluded.
function checkPricingCoverage(hooksContent) {
  if (hooksContent === null) fail('pricing check: olympus-hooks.ts missing');
  const start = hooksContent.indexOf('MODEL_PRICING_USD_PER_1M');
  if (start === -1) fail('pricing check: MODEL_PRICING_USD_PER_1M not found in olympus-hooks.ts');
  const end = hooksContent.indexOf('\n};', start);
  const region = hooksContent.slice(start, end === -1 ? undefined : end);
  const priced = new Set();
  const priceRe = /"(opencode-go|opencode)\/[a-z0-9._:/-]+":\s*\{/g;
  let m;
  while ((m = priceRe.exec(region)) !== null) {
    priced.add(m[0].slice(1, m[0].indexOf('"', 1)));
  }
  const missing = new Set();
  for (const strat of Object.keys(msStrategiesPrefixed)) {
    for (const god of Object.keys(msStrategiesPrefixed[strat])) {
      const v = msStrategiesPrefixed[strat][god];
      if ((v.startsWith('opencode-go/') || v.startsWith('opencode/')) && !priced.has(v)) {
        missing.add(`${strat}.${god}=${v}`);
      }
    }
  }
  return missing;
}

// --- Compare mirrors against the canonical map ------------------------------
const balanced = msStrategies['go-balanced'] || {};
let mirrorDrift = false;

function reportMirrorDrift(label, strat, god, canonical, mirror, line) {
  console.error(
    `  DRIFT  ${label}: ${strat}.${god} canonical=${canonical || '(missing)'} mirror=${mirror || '(missing)'} (line ${line})`,
  );
  mirrorDrift = true;
}

// 1. olympus-hooks.ts STRATEGY_GODS
const hooks = readOrNull(HOOKS_PATH);
const hg = extractStrategyMirror(hooks, 'const STRATEGY_GODS', 'olympus-hooks.ts STRATEGY_GODS');
for (const strat of msKeys) {
  for (const god of allGods) {
    const canonical = msStrategies[strat][god];
    const mirror = hg.result[strat]?.[god];
    if (canonical !== mirror) {
      reportMirrorDrift('olympus-hooks.ts', strat, god, canonical, mirror, hg.lines[strat] || 0);
    }
  }
}

// 2. settings-dialog.tsx STRATEGY_MODELS
const dialog = readOrNull(DIALOG_TSX_PATH);
const sm = extractStrategyMirror(dialog, 'const STRATEGY_MODELS', 'settings-dialog.tsx STRATEGY_MODELS');
for (const strat of msKeys) {
  for (const god of allGods) {
    const canonical = msStrategies[strat][god];
    const mirror = sm.result[strat]?.[god];
    if (canonical !== mirror) {
      reportMirrorDrift('settings-dialog.tsx', strat, god, canonical, mirror, sm.lines[strat] || 0);
    }
  }
}

// 3. src/lib/olympus.ts GOD_META (go-balanced defaults)
const olympusTs = readOrNull(OLYMPUS_TS_PATH);
const om = extractDefaultPairs(olympusTs, 'const GOD_META', 'model', 'olympus.ts GOD_META');
for (const god of allGods) {
  const canonical = balanced[god];
  const mirror = om.pairs[god];
  if (canonical !== mirror) {
    reportMirrorDrift('olympus.ts', 'go-balanced', god, canonical, mirror, om.lines[god] || 0);
  }
}

// 4. route.ts GOD_META.default_class
const route = readOrNull(ROUTE_TS_PATH);
const rm = extractDefaultPairs(route, 'const GOD_META', 'default_class', 'route.ts GOD_META');
for (const god of allGods) {
  const canonical = balanced[god];
  const mirror = rm.pairs[god];
  if (canonical !== mirror) {
    reportMirrorDrift('route.ts', 'go-balanced', god, canonical, mirror, rm.lines[god] || 0);
  }
}

// 5. settings-dialog.tsx DEFAULT_CLASSES
const dc = extractDefaultPairs(dialog, 'const DEFAULT_CLASSES', null, 'settings-dialog.tsx DEFAULT_CLASSES');
for (const god of allGods) {
  const canonical = balanced[god];
  const mirror = dc.pairs[god];
  if (canonical !== mirror) {
    reportMirrorDrift('settings-dialog.tsx', 'go-balanced', god, canonical, mirror, dc.lines[god] || 0);
  }
}

// 6. Pricing coverage (Cost Dashboard never reports $0 for paid models)
const missingPrices = checkPricingCoverage(hooks);
if (missingPrices.size > 0) {
  for (const item of [...missingPrices].sort()) {
    console.error(`  DRIFT  pricing: no MODEL_PRICING_USD_PER_1M entry for ${item}`);
  }
  mirrorDrift = true;
}

// 7. GO-CARD-PROSE (#93 / HIGIENIA-1 H1b): the strategy PROSE must name the
// models the code maps pin — the rotation incident's drift class (the
// retired GLM-5.2 default survived in card prose, docs tables, rule
// clauses, and route strings while the MODEL-ID mirrors stayed synced, so
// nothing failed). The provider-catalogue id lists are exempt by
// construction: the lint matches the UPPERCASE prose name + the
// terminalModel field shape, never the lowercase catalogue ids.
{
  const proseFiles = [
    'src/components/olympus/settings-dialog.tsx',
    'src/components/olympus/provider-settings.tsx',
    'src/lib/model-strategies.ts',
    'TOKEN-ECONOMY.md',
    'MODEL-STRATEGIES.md',
    '.opencode/rules/common/operating-principles.md',
    '.opencode/rules/common/cost-discipline.md',
    '.opencode/commands/OLYMPUS/cost-report.md',
    'src/app/api/olympus/auth/status/route.ts',
    'src/app/api/olympus/snapshot/route.ts',
    'scripts/setup-sub-agent-instincts.js',
  ];
  let proseDrift93 = false;
  for (const f of proseFiles) {
    let src = '';
    try { src = fs.readFileSync(path.join(ROOT, f), 'utf-8'); } catch { continue; }
    if (/GLM-5\.2/.test(src) || /terminalModel:\s*'[^']*glm-5\.2'/.test(src)) {
      console.error(`  DRIFT  GO-CARD-PROSE: ${f} still names the retired default (GLM-5.2) in strategy prose`);
      proseDrift93 = true;
    }
  }
  if (proseDrift93) mirrorDrift = true;
}

if (mirrorDrift) {
  fail('strategy mirrors drifted from src/lib/model-strategies.ts — update the canonical file, not the mirrors (see MIRROR header comments).');
}

ok(`all ${msKeys.length} strategies in sync (${msKeys.join(', ')}).`);
process.exit(0);
