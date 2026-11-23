#!/usr/bin/env node
/**
 * delivery-profiles.test.mjs — v0.0.98-15: the size contract.
 *
 * The 51-hop AIME plan and the 25-hop Plan Health specimen showed that a
 * warning was not a contract. This suite pins the four profiles, the plan
 * refusal rules, the per-lane store and the walker/API/UI wiring.
 *
 * Run: npx tsx scripts/delivery-profiles.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANE = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-profile-lane-'));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-profile-home-'));
process.env.OLYMPUS_HOME = HOME;
process.on('exit', () => {
  try { fs.rmSync(LANE, { recursive: true, force: true }); } catch { /* gone */ }
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* gone */ }
});

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
}

const hop = (id) => ({ id });
const plan = (...ids) => ({ hops: ids.map(hop) });

async function main() {
  const dp = await import(OLYMPUS + '/src/lib/delivery-profiles.ts');
  const store = await import(OLYMPUS + '/src/lib/delivery-profile-store.ts');
  expect('spike caps at 4 hops', dp.DELIVERY_PROFILES.spike.maxHops === 4);
  expect('demo requires a design and QA gate', dp.DELIVERY_PROFILES.demo.requiresDesignGate && dp.DELIVERY_PROFILES.demo.requiresQaGate);
  expect('base is 10 hops / 90 min', dp.DELIVERY_PROFILES.base.maxHops === 10 && dp.DELIVERY_PROFILES.base.budgetMs === 90 * 60_000);
  expect('complete is the largest profile', dp.DELIVERY_PROFILES.complete.maxHops === 60 && dp.DELIVERY_PROFILES.complete.budgetMs === 4 * 3600_000);

  const spikeOver = dp.profilePlanCheck(plan('a', 'b', 'c', 'd', 'e'), 'spike');
  expect('spike refuses 5 hops', !spikeOver.ok && /5 hops > 4/.test(spikeOver.violations.join(' ')), JSON.stringify(spikeOver));
  const demoNoGates = dp.profilePlanCheck(plan('a', 'b'), 'demo');
  expect('demo refuses a plan without design/QA', !demoNoGates.ok && /design/.test(demoNoGates.violations.join(' ')) && /QA/.test(demoNoGates.violations.join(' ')), JSON.stringify(demoNoGates));
  const demoOk = dp.profilePlanCheck(plan('a', 'design-gate', 'qa-one'), 'demo');
  expect('demo accepts a plan with design + QA', demoOk.ok, JSON.stringify(demoOk));
  const completeOk = dp.profilePlanCheck(plan('a', 'design-gate', 'qa-one'), 'complete');
  expect('complete accepts a normal plan', completeOk.ok, JSON.stringify(completeOk));
  expect('unknown profile falls back to base', dp.resolveProfile('nope').id === 'base');

  const saved = store.writeDeliveryProfile(LANE, 'demo', 'test');
  expect('the lane store writes the profile', saved.profile === 'demo' && JSON.parse(fs.readFileSync(path.join(LANE, '.olympus-delivery-profile.json'), 'utf-8')).profile === 'demo');
  expect('the lane store reads it back', store.readDeliveryProfile(LANE)?.profile === 'demo');
  expect('plan profile wins over the lane file', store.resolveLaneProfile(LANE, { version: 1, laneRoot: LANE, profile: 'spike', hops: [] }) === 'spike');
  expect('the lane file is the fallback', store.resolveLaneProfile(LANE, { version: 1, laneRoot: LANE, hops: [] }) === 'demo');

  const walker = fs.readFileSync(path.join(OLYMPUS, 'src/lib/hop-runtime/walker.ts'), 'utf-8');
  const schema = fs.readFileSync(path.join(OLYMPUS, 'src/lib/hop-runtime/plan-schema.ts'), 'utf-8');
  const api = fs.readFileSync(path.join(OLYMPUS, 'src/app/api/olympus/delivery-profile/route.ts'), 'utf-8');
  const card = fs.readFileSync(path.join(OLYMPUS, 'src/components/olympus/project-profile-card.tsx'), 'utf-8');
  expect('the walker refuses an over-profile plan', /profilePlanCheck\(plan, deliveryProfile\.id\)/.test(walker) && /refuses this plan/.test(walker));
  expect('the profile sets the campaign budget', /deliveryProfile\.budgetMs/.test(walker) && /budgetMs = deliveryProfile/.test(walker));
  expect('the plan schema accepts a profile', /profile\?: 'spike' \| 'demo' \| 'base' \| 'complete'/.test(schema));
  expect('the API exposes and saves the profile', /delivery-profile/.test(api) && /writeDeliveryProfile/.test(api));
  expect('the project card has the selector', /delivery profile/.test(card) && /chooseDelivery/.test(card));

  console.log('');
  if (failures > 0) {
    console.log(`delivery-profiles: ${failures} FAIL`);
    process.exit(1);
  }
  console.log('delivery-profiles: all checks PASS');
}
await main();
