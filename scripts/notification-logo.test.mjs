#!/usr/bin/env node
/**
 * notification-logo.test.mjs — v0.0.52.
 *
 * The OS badge is an attention request, not a log. History must never replay
 * on boot; duplicates coalesce; focusing closes the native notifications so
 * the desktop badge clears and the OLYMPUS mark is visible again.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const policy = await import(OLYMPUS + '/electron/desktop-notify.ts');
const state = { lastWalkAt: 0, lastKey: '', lastKeyAt: 0 };
const base = { title: 'OLYMPUS', body: 'aime', state };

expect('N-1: boot offset is the current file size (history never replayed)',
  policy.initialNotifyOffset(4096) === 4096 && policy.initialNotifyOffset(0) === 0 && policy.initialNotifyOffset(-1) === 0,
  'the boot offset can start at 0 again');
const walk = policy.decideNotification({ ...base, type: 'walk', now: 1_000_000, focused: false });
expect('N-2: a walk notice is shown once', walk.show === true, walk.reason);
const walkAgain = policy.decideNotification({ ...base, type: 'walk', now: 1_060_000, focused: false, state: walk.state });
expect('N-3: walk notices coalesce for 10 minutes', walkAgain.show === false && /walk|duplicate/.test(walkAgain.reason), walkAgain.reason);
const focused = policy.decideNotification({ ...base, type: 'ready', now: 2_000_000, focused: true });
expect('N-4: no native notification while the window is focused', focused.show === false, focused.reason);
const error = policy.decideNotification({ ...base, type: 'error', now: 2_000_000, focused: true });
expect('N-5: errors still break through focus', error.show === true, error.reason);
const compact = policy.decideNotification({ ...base, type: 'compact', now: 3_000_000, focused: false });
expect('N-6: compaction stays ambient (tray only)', compact.show === false, compact.reason);
const one = policy.decideNotification({ ...base, type: 'design', now: 4_000_000, focused: false });
const two = policy.decideNotification({ ...base, type: 'design', now: 4_060_000, focused: false, state: one.state });
expect('N-7: the same alert is deduped for 5 minutes', one.show === true && two.show === false, two.reason);

const main = fs.readFileSync(OLYMPUS + '/electron/main.ts', 'utf-8');
expect('N-8: main seeds the tail at the current size',
  /initialNotifyOffset\(statSync\(NOTIFY_FILE\)\.size\)/.test(main),
  'historical lines are still replayed on boot');
expect('N-9: main keeps and closes the native notifications on focus',
  /activeNativeNotifications/.test(main) && /mainWindow\.on\('focus'.*closeNativeNotifications/.test(main) && /n\.close\(\)/.test(main),
  'the GNOME badge cannot be cleared');
const notify = fs.readFileSync(OLYMPUS + '/src/lib/desktop-notify.ts', 'utf-8');
expect('N-10: the archive rotates instead of growing forever',
  /rotateNotifyFile/.test(notify) && /MAX_NOTIFY_BYTES/.test(notify),
  'the JSONL has no bound');
const route = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/notify/route.ts', 'utf-8');
expect('N-11: the archive can be cleared', /export async function DELETE/.test(route), 'no clear lane');
const center = fs.readFileSync(OLYMPUS + '/src/components/olympus/notification-center.tsx', 'utf-8');
expect('N-12: the bell can clear history', /clearAll/.test(center) && /method: 'DELETE'/.test(center), 'no clear button');

console.log(failures === 0 ? '\nnotification-logo: all green.' : `\nnotification-logo: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
