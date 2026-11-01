#!/usr/bin/env node
/**
 * server-lock.test.mjs — v0.0.31 (R31-03).
 *
 * The app may never spawn a second `opencode serve` against the same SQLite
 * DB. The start lock is an atomic create; this suite pins the classifier that
 * decides whether a lock is free, ours, alive (wait/reuse) or stale (take
 * over).
 *
 * Run: npx tsx scripts/server-lock.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { classifyServerLock } from '../src/lib/opencode-session.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const aliveOnly = (pid) => pid === 42;

ok('no lock is free', () => assert.equal(classifyServerLock(null, aliveOnly), 'free'));
ok('malformed lock is free', () => assert.equal(classifyServerLock({}, aliveOnly), 'free'));
ok('a NaN pid is free', () => assert.equal(classifyServerLock({ pid: Number.NaN }, aliveOnly), 'free'));
ok('a negative pid is free', () => assert.equal(classifyServerLock({ pid: -3 }, aliveOnly), 'free'));
ok('our own pid is self', () => assert.equal(classifyServerLock({ pid: process.pid }, aliveOnly), 'self'));
ok('a live foreign owner is live-owner', () => assert.equal(classifyServerLock({ pid: 42 }, aliveOnly), 'live-owner'));
ok('a dead owner is stale', () => assert.equal(classifyServerLock({ pid: 43 }, aliveOnly), 'stale'));
ok('a dead owner with a numeric string pid is stale', () => {
  assert.equal(classifyServerLock({ pid: '43' }, aliveOnly), 'stale');
});

console.log(`\nserver-lock: ${passed} passed`);
