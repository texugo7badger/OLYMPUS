#!/usr/bin/env node
/**
 * local-lane.test.mjs — v0.0.22 (W1/W2) local lane + single state truth.
 * Run: npx tsx scripts/local-lane.test.mjs
 *
 * The free tier is gone; the zero-cost path is the user's own hardware.
 * This suite pins the honesty contract:
 *
 *   L1  docs/LOCAL-LLM.md exists and names the supported runtimes
 *   L2  scripts/local-llm-probe.js exists, probes the 4 well-known ports
 *       and prints JSON
 *   L3  apply-strategy.js resolves the local lane by PROBE (never a guess)
 *       and REFUSES with the probe list when nothing answers
 *   L4  the local provider block is written (`local/<model>` ids)
 *   L5  the L4 catalogue preflight is skipped for local (the probe is the
 *       validation — local ids are not in the cloud catalogue)
 *   L6  src/lib/strategy-state.ts is the ONE state file (strategy.json),
 *       migrates the legacy files, and mirrors them
 *   L7  the strategy route reads/writes the unified state
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

// L1 — the doc.
const docPath = join(ROOT, 'docs', 'LOCAL-LLM.md');
check('L1 docs/LOCAL-LLM.md exists', fs.existsSync(docPath));
if (fs.existsSync(docPath)) {
  const doc = fs.readFileSync(docPath, 'utf-8');
  for (const rt of ['Ollama', 'LM Studio', 'vLLM', 'llama.cpp']) {
    check(`L1 doc names ${rt}`, doc.includes(rt));
  }
}

// L2 — the probe.
const probePath = join(ROOT, 'scripts', 'local-llm-probe.js');
check('L2 scripts/local-llm-probe.js exists', fs.existsSync(probePath));
if (fs.existsSync(probePath)) {
  const probe = fs.readFileSync(probePath, 'utf-8');
  for (const port of ['11434', '1234', '8000', '8080']) {
    check(`L2 probe covers :${port}`, probe.includes(port));
  }
  check('L2 probe prints JSON', /JSON\.stringify/.test(probe));
}

// L3/L4/L5 — the apply wiring.
const apply = fs.readFileSync(join(ROOT, 'scripts', 'apply-strategy.js'), 'utf-8');
check('L3 local resolution is probe-driven', /resolveLocalStrategy\(\)/.test(apply));
check('L3 no-endpoint refusal names the probe list', /Probed: Ollama/.test(apply));
check('L4 local provider block written', /function applyLocalProvider/.test(apply) && /provider\.local/.test(apply));
check('L4 local/<model> ids assigned', /`local\/\$\{/.test(apply));
check('L5 catalogue preflight skipped for local', /strategy === 'local'[\s\S]{0,120}catalogue preflight skipped/.test(apply));

// L6 — the single state truth.
const statePath = join(ROOT, 'src', 'lib', 'strategy-state.ts');
check('L6 src/lib/strategy-state.ts exists', fs.existsSync(statePath));
if (fs.existsSync(statePath)) {
  const state = fs.readFileSync(statePath, 'utf-8');
  check('L6 strategy.json is the canonical file', /strategy\.json/.test(state));
  check('L6 legacy active-strategy migrated', /active-strategy\.json/.test(state) && /LEGACY_ACTIVE_FILE/.test(state));
  check('L6 legacy llm-providers mirrored', /llm-providers\.json/.test(state) && /mirrorLegacy/.test(state));
  check('L6 writeStrategyState is the ONE writer', /export function writeStrategyState/.test(state));
}

// L7 — the route uses the unified state.
const route = fs.readFileSync(join(ROOT, 'src', 'app', 'api', 'olympus', 'strategy', 'route.ts'), 'utf-8');
check('L7 strategy route reads the unified state', /readStrategyState\(\)/.test(route));
check('L7 strategy route writes the unified state', /writeStrategyState\(/.test(route));
check('L7 strategy route refuses free-*', /free tier is retired/i.test(route));

console.log(`\nlocal-lane: ${checked - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
