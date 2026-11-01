#!/usr/bin/env node
/**
 * power-suspend.test.mjs — v0.0.32 (Epic N).
 *
 * A sleeping machine is not a stalled provider. The marker is the difference;
 * this suite pins the window logic (before/during/after a suspend) so a
 * resume can never be classified as a provider silence.
 *
 * Run: npx tsx scripts/power-suspend.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { isRecentlyResumed, markResume, markSuspend, readSuspendState, suspendCovers } from '../src/lib/power-suspend.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const file = join(mkdtempSync(join(tmpdir(), 'olympus-power-')), 'suspend.json');
const T = (iso) => Date.parse(iso);

ok('no marker means no suspend coverage', () => {
  assert.equal(readSuspendState(file).suspendedAt, null);
  assert.equal(suspendCovers(T('2026-11-01T09:00:00Z'), T('2026-11-01T10:00:00Z'), readSuspendState(file)), false);
});

markSuspend(new Date('2026-11-01T10:00:00Z'), file);
ok('markSuspend writes an active marker', () => {
  const s = readSuspendState(file);
  assert.equal(s.active, true);
  assert.equal(s.suspendedAt, '2026-11-01T10:00:00.000Z');
  assert.equal(s.resumedAt, null);
});
ok('a window spanning the suspend is covered', () =>
  assert.equal(suspendCovers(T('2026-11-01T09:59:00Z'), T('2026-11-01T10:01:00Z'), readSuspendState(file)), true));
ok('a window after an open suspend is covered (still asleep)', () =>
  assert.equal(suspendCovers(T('2026-11-01T10:05:00Z'), T('2026-11-01T10:06:00Z'), readSuspendState(file)), true));
ok('a window entirely before the suspend is not covered', () =>
  assert.equal(suspendCovers(T('2026-11-01T09:00:00Z'), T('2026-11-01T09:30:00Z'), readSuspendState(file)), false));

markResume(new Date('2026-11-01T10:10:00Z'), file);
ok('markResume preserves suspendedAt and closes the window', () => {
  const s = readSuspendState(file);
  assert.equal(s.active, false);
  assert.equal(s.suspendedAt, '2026-11-01T10:00:00.000Z');
  assert.equal(s.resumedAt, '2026-11-01T10:10:00.000Z');
});
ok('the pre-suspend window still overlaps the closed suspend', () =>
  assert.equal(suspendCovers(T('2026-11-01T09:59:00Z'), T('2026-11-01T10:11:00Z'), readSuspendState(file)), true));
ok('a window after the resume is NOT covered', () =>
  assert.equal(suspendCovers(T('2026-11-01T10:11:00Z'), T('2026-11-01T10:20:00Z'), readSuspendState(file)), false));
ok('recently resumed inside the 2-minute window', () =>
  assert.equal(isRecentlyResumed(2 * 60_000, T('2026-11-01T10:11:00Z'), readSuspendState(file)), true));
ok('not recently resumed after the window', () =>
  assert.equal(isRecentlyResumed(2 * 60_000, T('2026-11-01T10:20:00Z'), readSuspendState(file)), false));

console.log(`\npower-suspend: ${passed} passed`);
