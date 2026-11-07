#!/usr/bin/env node
/**
 * progress.test.mjs — v0.0.31 hotfix (the ceiling that killed working hops).
 *
 * Specimen: AIME `v8-back-nav` + `p3-auth-pages` ran 25+ min on qwen3.8-flash,
 * kept producing events, and were killed by the absolute ceiling; the park
 * breaker then stopped the campaign. A long turn that is still working must
 * extend; only silence past the progress window (or the hard cap) kills.
 *
 * Run: npx tsx scripts/progress.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { decideCeiling, hardCeilingMs } from '../src/lib/hop-runtime/progress.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const T = 1_000_000; // arbitrary epoch ms
const base = { deadline: T + 60_000, hardDeadline: T + 600_000, lastProgressAt: T, now: T };

ok('before the deadline nothing happens', () => {
  const d = decideCeiling({ ...base, now: T + 30_000 });
  assert.equal(d.kill, false);
  assert.equal(d.extended, false);
  assert.equal(d.deadline, base.deadline);
});

ok('a working turn past the deadline extends by one slice', () => {
  const d = decideCeiling({ ...base, lastProgressAt: T + 50_000, now: T + 65_000 });
  assert.equal(d.kill, false);
  assert.equal(d.extended, true);
  assert.equal(d.deadline, T + 65_000 + 5 * 60_000);
});

ok('an idle turn past the progress window is killed', () => {
  // 4 minutes without progress; the default window is 3 minutes.
  const d = decideCeiling({ ...base, lastProgressAt: T, now: T + 240_000 });
  assert.equal(d.kill, true);
  assert.equal(d.extended, false);
});

ok('the hard cap kills even a working turn', () => {
  const d = decideCeiling({
    deadline: T + 600_000,
    hardDeadline: T + 600_000,
    lastProgressAt: T + 599_000,
    now: T + 600_000,
  });
  assert.equal(d.kill, true);
});

ok('the extension never passes the hard cap', () => {
  const d = decideCeiling({
    deadline: T + 580_000,
    hardDeadline: T + 600_000,
    lastProgressAt: T + 579_000,
    now: T + 581_000,
  });
  assert.equal(d.extended, true);
  assert.equal(d.deadline, T + 600_000);
});

ok('a custom window/extension is honored', () => {
  const d = decideCeiling(
    { ...base, lastProgressAt: T + 40_000, now: T + 65_000 },
    { progressWindowMs: 10 * 60_000, extensionMs: 60_000 },
  );
  assert.equal(d.extended, true);
  assert.equal(d.deadline, T + 125_000);
});

ok('the hard cap is bounded at 40 min (v0.0.86: AIME ran a real 31-min hop)', () => {
  assert.equal(hardCeilingMs(1_500_000), 2_400_000);
  assert.equal(hardCeilingMs(600_000), 1_200_000);
  assert.equal(hardCeilingMs(3_600_000), 2_400_000);
  assert.equal(hardCeilingMs(0), 0);
});

console.log(`\nprogress: ${passed} passed`);
