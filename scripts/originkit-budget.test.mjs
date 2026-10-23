#!/usr/bin/env node
/**
 * originkit-budget.test.mjs — #198 OriginKit free-tier fetch guard.
 * Run: npx tsx scripts/originkit-budget.test.mjs   (exit 0 = pass)
 *
 * Pins:
 *   1. The canonical counter — 10 fetches/day, local-midnight reset,
 *      stale/corrupt state reads as a fresh day.
 *   2. The 11th fetch refuses in <1s with the honest reset-time message.
 *   3. The runtime gate copy (overlay) is behavior-identical and counts only
 *      fetch-shaped Originkit tools.
 *   4. The hook blocks the 11th call; the References tab + the god marker
 *      both surface "N fetches left today".
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
}

async function main() {
  const imp = (rel) => import(pathToFileURL(path.join(OLYMPUS, rel)).href + `?t=${Date.now()}-${Math.random()}`);

  const budget = await imp('src/lib/originkit-budget.ts');
  const runtime = await imp('.opencode/olympus/lib/originkit-budget.ts');

  expect('#198: both copies agree on the daily limit and the store filename',
    budget.ORIGINKIT_DAILY_LIMIT === 10
    && runtime.ORIGINKIT_DAILY_LIMIT === 10
    && budget.ORIGINKIT_BUDGET_FILENAME === 'originkit-budget.json'
    && runtime.ORIGINKIT_BUDGET_FILENAME === 'originkit-budget.json',
    'the limit/store drifted between src and the overlay');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-originkit-'));
  const fresh = budget.readOriginkitBudget({ stateDir: dir });
  expect('#198: a fresh day starts at 10 fetches left',
    fresh.used === 0 && fresh.remaining === 10 && fresh.exhausted === false,
    JSON.stringify(fresh));
  expect('#198: the reset time is the next local midnight',
    new Date(fresh.resetAt).getHours() === 0
    && new Date(fresh.resetAt).getMinutes() === 0
    && new Date(fresh.resetAt).getTime() > Date.now(),
    fresh.resetAt);

  let last;
  for (let i = 0; i < 10; i++) last = budget.consumeOriginkitFetch({ stateDir: dir });
  expect('#198: the 10th fetch is allowed and leaves 0',
    last.ok === true && last.budget.used === 10 && last.budget.remaining === 0 && last.budget.exhausted === true,
    JSON.stringify(last));
  expect('#198: the counter persisted next to the equipped-MCPs store',
    JSON.parse(fs.readFileSync(path.join(dir, 'originkit-budget.json'), 'utf-8')).used === 10,
    'no persisted counter');

  const t0 = performance.now();
  const eleventh = budget.consumeOriginkitFetch({ stateDir: dir });
  const elapsed = performance.now() - t0;
  expect('#198: the 11th fetch refuses in <1s',
    eleventh.ok === false && elapsed < 1000,
    `${elapsed.toFixed(1)}ms`);
  expect('#198: the refusal is honest about the reset time',
    /exhausted/i.test(eleventh.error) && /Resets at/.test(eleventh.error) && /Skiper/.test(eleventh.error),
    eleventh.error);
  expect('#198: a refused fetch does not inflate the counter',
    budget.readOriginkitBudget({ stateDir: dir }).used === 10,
    'the refusal consumed quota');

  // Stale state (yesterday's counter) resets; a corrupt file reads fresh.
  fs.writeFileSync(path.join(dir, 'originkit-budget.json'), JSON.stringify({ day: '2000-01-01', used: 10 }));
  expect('#198: yesterday\'s counter resets at midnight',
    budget.readOriginkitBudget({ stateDir: dir }).remaining === 10,
    'stale day not reset');
  fs.writeFileSync(path.join(dir, 'originkit-budget.json'), '{not json');
  expect('#198: a corrupt counter reads as a fresh day',
    budget.readOriginkitBudget({ stateDir: dir }).remaining === 10,
    'corrupt state not tolerated');

  // The overlay copy reads the SAME store — no double ledger.
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-originkit-shared-'));
  budget.consumeOriginkitFetch({ stateDir: shared });
  expect('#198: the runtime gate reads the canonical store',
    runtime.readOriginkitBudget({ stateDir: shared }).used === 1,
    'the two ledgers diverged');

  const blockedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-originkit-blocked-'));
  fs.writeFileSync(path.join(blockedDir, 'originkit-budget.json'), JSON.stringify({ day: new Date().toISOString().slice(0, 10), used: 10 }));
  const runtimeRefusal = runtime.consumeOriginkitFetch({ stateDir: blockedDir });
  expect('#198: the runtime gate refuses the exhausted day too',
    runtimeRefusal.ok === false && /Resets at/.test(runtimeRefusal.error),
    JSON.stringify(runtimeRefusal));

  expect('#198: only fetch-shaped Originkit tools consume quota',
    runtime.isOriginkitFetchTool('mcp_originkit_fetch_component') === true
    && runtime.isOriginkitFetchTool('mcp_originkit_browse_components') === false
    && runtime.isOriginkitFetchTool('mcp_originkit_list_components') === false,
    'browsing would burn the budget');

  // ── Source pins: hook + UI + god flow ────────────────────────────────────
  const hookSrc = read('.opencode/olympus/olympus-hooks.ts');
  expect('#198: the permission hook consumes and blocks on exhaustion',
    /consumeOriginkitFetch/.test(hookSrc)
    && /serverName === "originkit" && isOriginkitFetchTool\(event\.tool\)/.test(hookSrc)
    && /return \{ approved: false, reason: consumed\.error \}/.test(hookSrc),
    'the runtime gate never sees Originkit calls');

  const routeSrc = read('src/app/api/olympus/originkit-budget/route.ts');
  expect('#198: the budget route reads and consumes',
    /export async function GET/.test(routeSrc) && /export async function POST/.test(routeSrc)
    && /consumeOriginkitFetch/.test(routeSrc) && /status: 429/.test(routeSrc),
    'no honest HTTP surface');

  const paneSrc = read('src/components/olympus/craft-apps-panel.tsx');
  expect('#198: the References tab shows "N fetches left today"',
    /fetches left today/.test(paneSrc) && /originkit-budget/.test(paneSrc)
    && /originkitBudget\.exhausted/.test(paneSrc),
    'the tab hides the budget');

  const refsSrc = read('src/lib/ui-references.ts');
  const actionSrc = read('src/app/api/olympus/action/route.ts');
  expect('#198: the god flow carries the live budget line',
    /export function uiReferencesMarkerBlock/.test(refsSrc)
    && /fetches left today/.test(refsSrc)
    && /uiReferencesMarkerBlock\(\)/.test(actionSrc),
    'the gods never learn the count');

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(shared, { recursive: true, force: true });
  fs.rmSync(blockedDir, { recursive: true, force: true });

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
