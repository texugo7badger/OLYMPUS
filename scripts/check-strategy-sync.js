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
  return (raw || '').replace(/^(opencode-go|opencode|groq|openrouter|nvidia)\//, '');
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
const msStrategyRegex = /'((?:go|free|zen)-[a-z-]+)':\s*\{[\s\S]*?gods:\s*\{([\s\S]*?)\}/g;
let m;
while ((m = msStrategyRegex.exec(msContent)) !== null) {
  const stratName = m[1];
  const godsBlock = m[2];
  const gods = {};
  // Model IDs contain hyphens and slashes (e.g. openai/gpt-oss-20b:free),
  // so the character class must include '-', '/', '.', ':' and '_'.
  // `opencode-go` MUST precede `opencode` in the alternation (ordered regex).
  const godRegex = /([a-z]+):\s*'(?:opencode-go|opencode|groq|openrouter|nvidia)\/([a-z0-9._:/-]+)'/g;
  let g;
  while ((g = godRegex.exec(godsBlock)) !== null) {
    gods[g[1]] = g[2];
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
  const godRegex = /([a-z]+):\s*(?:'((?:opencode-go|opencode|groq|openrouter|nvidia)\/[a-z0-9._:/-]+)'|([A-Z_]+))/g;
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

ok(`all ${msKeys.length} strategies in sync (${msKeys.join(', ')}).`);
process.exit(0);
