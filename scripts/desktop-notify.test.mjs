#!/usr/bin/env node
/**
 * desktop-notify.test.mjs — v0.0.32 (Epic M).
 *
 * The tray dot is the app's ambient state. This pins: one taxonomy in both
 * processes (the Electron main cannot import src/), every color coming from
 * the OLYMPUS palette, a real PNG for the tray, and the JSONL bridge the main
 * tails (append → read, invalid type refused).
 *
 * Run: npx tsx scripts/desktop-notify.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  NOTIFY_COLORS,
  NOTIFY_TYPES,
  appendDesktopNotify,
  isNotifyType,
  readDesktopNotifications,
} from '../src/lib/desktop-notify.ts';
import {
  NOTIFY_COLORS as ELECTRON_COLORS,
  NOTIFY_TYPES as ELECTRON_TYPES,
  trayPng,
} from '../electron/desktop-notify.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('both processes share the same type list', () => {
  assert.deepEqual([...NOTIFY_TYPES].sort(), [...ELECTRON_TYPES].sort());
});

ok('both processes share the same colors', () => {
  assert.deepEqual(NOTIFY_COLORS, ELECTRON_COLORS);
});

ok('every color comes from the OLYMPUS palette (globals.css)', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf-8');
  const palette = new Set((css.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((c) => c.toUpperCase()));
  for (const [type, color] of Object.entries(NOTIFY_COLORS)) {
    assert.ok(palette.has(color.toUpperCase()), `${type} ${color} is not in the palette`);
  }
});

ok('the six types are the requested semantics', () => {
  assert.deepEqual([...NOTIFY_TYPES].sort(), ['compact', 'curate', 'design', 'error', 'ready', 'walk']);
});

ok('an invalid type is refused', () => {
  assert.equal(isNotifyType('party'), false);
  assert.equal(appendDesktopNotify({ type: 'party' }, { home: mkdtempSync(join(tmpdir(), 'notify-')) }), false);
});

ok('trayPng produces a real PNG', () => {
  const png = trayPng('#7BAE8E', 32);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(png.length > 100, `png too small: ${png.length}`);
  // IHDR width/height
  assert.equal(png.readUInt32BE(16), 32);
  assert.equal(png.readUInt32BE(20), 32);
});

ok('append + read round-trips, newest first, with a torn line ignored', () => {
  const home = mkdtempSync(join(tmpdir(), 'olympus-notify-'));
  assert.equal(appendDesktopNotify({ type: 'ready', title: 'done', body: '4 hops' }, { home, now: 1 }), true);
  assert.equal(appendDesktopNotify({ type: 'error', title: 'parked', body: 'g3' }, { home, now: 2 }), true);
  appendFileSync(join(home, 'desktop-notifications.jsonl'), '{"type": broken\n', 'utf-8');
  const events = readDesktopNotifications(10, { home });
  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'error');
  assert.equal(events[1].type, 'ready');
});

console.log(`\ndesktop-notify: ${passed} passed`);
