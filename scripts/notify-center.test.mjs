#!/usr/bin/env node
/**
 * notify-center.test.mjs — v0.0.32 (Epic M).
 * Run: npx tsx scripts/notify-center.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_POWER_PREFS, normalizePowerPrefs, readPowerPrefs, writePowerPrefs } from '../src/lib/power-prefs.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('the sleep contract defaults to ON', () => {
  assert.equal(DEFAULT_POWER_PREFS.autoHibernateOnLock, true);
  const home = mkdtempSync(join(tmpdir(), 'power-'));
  assert.equal(readPowerPrefs({ home }).autoHibernateOnLock, true);
});

ok('prefs round-trip and normalize garbage', () => {
  const home = mkdtempSync(join(tmpdir(), 'power-'));
  assert.equal(writePowerPrefs({ autoHibernateOnLock: false }, { home }), true);
  assert.equal(readPowerPrefs({ home }).autoHibernateOnLock, false);
  assert.equal(normalizePowerPrefs({ autoHibernateOnLock: 'nope' }).autoHibernateOnLock, true);
});

ok('the panel links events to panes and owns the hibernate button', () => {
  const center = read('src/components/olympus/notification-center.tsx');
  assert.match(center, /TONE/);
  assert.match(center, /craft-apps/);
  assert.match(center, /auto-hibernate/);
  assert.match(center, /hibernateNow/);
  assert.match(center, /left-0 top-full/);
});

ok('the main hibernates on lock and exposes the IPC', () => {
  const main = read('electron/main.ts');
  assert.match(main, /powerMonitor\.on\('lock-screen'/);
  assert.match(main, /ipcMain\.handle\('olympus:hibernate'/);
  assert.match(main, /trayNotificationActive/);
  const preload = read('electron/preload.ts');
  assert.match(preload, /ipcRenderer\.invoke\('olympus:hibernate'\)/);
});

console.log(`\nnotify-center: ${passed} passed`);
