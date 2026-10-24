#!/usr/bin/env node
/**
 * walk-lock.test.mjs — ONE CAMPAIGN PER LANE (the AIME 2026-10-24 specimen).
 *
 * Five concurrent walks of the same hop inside ninety seconds: contradictory
 * durations in one second, five parked telemetry rows, and a hop state
 * rewritten by whoever finished last. The runtime never asked "is a campaign
 * already walking here?".
 *
 * L1  a second acquire on the same lane is REFUSED while the first is alive
 * L2  the refusal names the holder (pid, campaign)
 * L3  release frees the lane for the next campaign
 * L4  a dead holder's lock is STOLEN immediately (no waiting for the TTL)
 * L5  a stale lock (no heartbeat past the TTL) is stolen
 * L6  two different lanes never block each other
 * L7  a release never deletes somebody else's lock (the steal race)
 *
 * Run: npx tsx scripts/walk-lock.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 260) : ''}`); }
}

const lockMod = await import('../src/lib/hop-runtime/walk-lock.ts');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-lock-'));
const lane = path.join(dir, 'lane-a');
fs.mkdirSync(lane, { recursive: true });

/* L1 + L2 — the second campaign is refused, and names the holder */
{
  const first = lockMod.acquireWalkLock(lane, { slug: 'aime', sessionId: 'ses_1' });
  expect('L1 the first acquire succeeds', first.ok === true, first.reason);

  const second = lockMod.acquireWalkLock(lane, { slug: 'aime', sessionId: 'ses_2' });
  expect('L1 the second acquire is refused', second.ok === false && second.reason === 'held', JSON.stringify(second));
  expect('L2 the refusal names the holder pid', second.holder?.pid === process.pid, second.holder?.pid);
  expect('L2 the refusal names the holder session', second.holder?.sessionId === 'ses_1', second.holder?.sessionId);
  expect('L2 the lock file really exists on disk', fs.existsSync(lockMod.walkLockPath(lane)));

  const peek = lockMod.readWalkLock(lane);
  expect('L2 readWalkLock reports the campaign alive', peek.alive === true && peek.holder?.slug === 'aime', JSON.stringify(peek));

  /* L3 — release frees the lane */
  if (first.ok) first.release();
  expect('L3 the lock file is gone after release', !fs.existsSync(lockMod.walkLockPath(lane)));
  const third = lockMod.acquireWalkLock(lane, { slug: 'aime', sessionId: 'ses_3' });
  expect('L3 a new campaign can start after release', third.ok === true, third.reason);
  if (third.ok) third.release();
}

/* L4 — a holder whose process is gone is stolen at once */
{
  const lockPath = lockMod.walkLockPath(lane);
  // A pid that cannot be alive: 2^31-1 is above the kernel's pid_max here.
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: 2147483647, bootId: 'some-other-boot', campaignId: 'cmp_ghost',
    slug: 'aime', startedAt: new Date().toISOString(),
  }, null, 2));
  const t0 = Date.now();
  const taken = lockMod.acquireWalkLock(lane, { slug: 'aime', sessionId: 'ses_4' });
  expect('L4 a dead holder is stolen', taken.ok === true, taken.reason);
  expect('L4 the steal is immediate (no TTL wait)', Date.now() - t0 < 2_000, `${Date.now() - t0}ms`);
  if (taken.ok) taken.release();
}

/* L5 — a silent lock past the TTL is stolen */
{
  const lockPath = lockMod.walkLockPath(lane);
  const stale = new Date(Date.now() - (lockMod.WALK_LOCK_STALE_MS + 60_000));
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: process.pid, bootId: 'same-boot-unknown', campaignId: 'cmp_silent',
    slug: 'aime', startedAt: stale.toISOString(),
  }, null, 2));
  fs.utimesSync(lockPath, stale, stale);
  const taken = lockMod.acquireWalkLock(lane, { slug: 'aime', sessionId: 'ses_5' });
  expect('L5 a heartbeat-silent lock is stolen', taken.ok === true, taken.reason);
  if (taken.ok) taken.release();
}

/* L6 — lanes are independent */
{
  const laneB = path.join(dir, 'lane-b');
  fs.mkdirSync(laneB, { recursive: true });
  const a = lockMod.acquireWalkLock(lane, { slug: 'aime' });
  const b = lockMod.acquireWalkLock(laneB, { slug: 'outro-projeto' });
  expect('L6 two lanes walk at the same time', a.ok === true && b.ok === true, `${a.reason}/${b.reason}`);
  if (b.ok) b.release();
  if (a.ok) a.release();
}

/* L7 — a stolen-from release never deletes the new holder's lock */
{
  const mine = lockMod.acquireWalkLock(lane, { slug: 'aime', sessionId: 'ses_mine' });
  const lockPath = lockMod.walkLockPath(lane);
  // Simulate a steal: another campaign replaced the file.
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: process.pid, bootId: 'other', campaignId: 'cmp_thief',
    slug: 'aime', startedAt: new Date().toISOString(),
  }, null, 2));
  if (mine.ok) mine.release();
  const stillThere = fs.existsSync(lockPath);
  expect('L7 release keeps a stolen-from lock intact', stillThere === true);
  fs.rmSync(lockPath, { force: true });
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nwalk-lock: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
