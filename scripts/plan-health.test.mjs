#!/usr/bin/env node
/**
 * plan-health.test.mjs — v0.0.98-13: the plan before the walk.
 *
 * The AIME gen-44 plan reached 51 hops; the verification guard then had to
 * stop individual gates. This suite pins the advisory Plan Health signals
 * (size, verification count, tight budgets, large hops) and the Apply guard
 * (`liveWalk` is true while the walker holds the lane).
 *
 * Run: npx tsx scripts/plan-health.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-plan-health-'));
process.env.OLYMPUS_HOME = TEST_HOME;
process.on('exit', () => { try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch { /* gone */ } });

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 260)}`);
  if (!cond) failures++;
}

async function main() {
  const { planHealth, estimateHopToolBudget, PLAN_SOFT_HOP_CAP } = await import(OLYMPUS + '/src/lib/plan-health.ts');

  const small = planHealth([
    { id: 'impl', toolBudget: 20, artifacts: ['a.ts'], checks: [] },
    { id: 'qa-one', toolBudget: 16, artifacts: ['e.md'], checks: ['file-exists:e.md'] },
  ]);
  expect('a small plan is not oversized', !small.oversized && small.hops === 2 && small.verification === 1, JSON.stringify(small));
  expect('a small plan has no warning', small.reasons.length === 0, JSON.stringify(small.reasons));

  const big = planHealth(Array.from({ length: PLAN_SOFT_HOP_CAP + 1 }, (_, i) => ({ id: `h${i}`, artifacts: [], checks: [] })));
  expect('a plan above the soft cap is oversized', big.oversized && /hops >/.test(big.reasons.join(' ')), JSON.stringify(big));
  expect('an oversized plan recommends a profile', /delivery profile|split/i.test(big.recommendation ?? ''), big.recommendation);

  const tight = planHealth([
    { id: 'broad', toolBudget: 16, artifacts: ['a.ts', 'b.ts', 'c.ts', 'd.ts'], promptChars: 7_000, checks: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
  ]);
  expect('a tight budget is flagged', tight.tightBudgets === 1, JSON.stringify(tight));
  expect('a large hop is flagged', tight.largeHops === 1, JSON.stringify(tight));
  expect('the estimator grows with declared work', estimateHopToolBudget({ id: 'x', artifacts: ['a', 'b', 'c', 'd'], promptChars: 7_000, checks: ['1', '2', '3', '4', '5', '6', '7'] }) > 20);

  // The Apply guard's data: a live walker holds the lane.
  const lane = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-plan-lane-'));
  const plan = { version: 1, laneRoot: lane, generation: 1, hops: [{ id: 'a', god: 'hephaestus', prompt: 'a', artifacts: ['a.md'], verify: { review: 'deterministic', checks: ['file-exists:a.md'] } }] };
  fs.writeFileSync(path.join(lane, 'dispatch-plan.json'), JSON.stringify(plan));
  fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({
    version: 1, completed: [], parked: null, quarantined: [], inFlight: [], generation: 1, parks: {}, updatedAt: new Date().toISOString(),
  }));
  const { acquireWalkLock } = await import(OLYMPUS + '/src/lib/hop-runtime/walk-lock.ts');
  const { buildCampaignHealth } = await import(OLYMPUS + '/src/lib/campaign-health.ts');
  const lock = acquireWalkLock(lane, { slug: 'plan-fixture' });
  expect('the fixture lock is acquired', lock.ok, JSON.stringify(lock));
  const live = buildCampaignHealth(lane);
  expect('campaign health exposes liveWalk', live.liveWalk === true, JSON.stringify(live));
  if (lock.ok) lock.release();
  const idle = buildCampaignHealth(lane);
  expect('the lock release clears liveWalk', idle.liveWalk === false, JSON.stringify(idle));

  const godPanel = fs.readFileSync(path.join(OLYMPUS, 'src/components/olympus/god-panel.tsx'), 'utf-8');
  const route = fs.readFileSync(path.join(OLYMPUS, 'src/app/api/olympus/walk/plan/route.ts'), 'utf-8');
  const parthenon = fs.readFileSync(path.join(OLYMPUS, 'src/components/olympus/parthenon-command.tsx'), 'utf-8');
expect('Apply is disabled while the walk is live', /applyNext/.test(parthenon) && /disabled=\{!!busy\}/.test(parthenon), 'Apply stays clickable');
  expect('the API still refuses at a live boundary', /a walk is live on this lane/.test(route), 'API guard missing');

  console.log('');
  if (failures > 0) {
    console.log(`plan-health: ${failures} FAIL`);
    process.exit(1);
  }
  console.log('plan-health: all checks PASS');
}
await main();
