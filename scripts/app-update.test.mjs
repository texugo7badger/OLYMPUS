#!/usr/bin/env node
/**
 * app-update.test.mjs — v0.0.92: the startup update box's deterministic core.
 *
 * Run: npx tsx scripts/app-update.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  compareVersions,
  isNewerVersion,
  readUpdatePrefs,
  releaseUrl,
  writeUpdatePrefs,
} from '../src/lib/app-update.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('semver comparison is numeric, not lexical', () => {
  assert.equal(compareVersions('0.0.92', '0.0.91'), 1);
  assert.equal(compareVersions('0.0.91', '0.0.92'), -1);
  assert.equal(compareVersions('v0.0.91', '0.0.91'), 0);
  assert.equal(compareVersions('0.0.100', '0.0.99'), 1);
  assert.equal(compareVersions('1.0.0', '0.99.99'), 1);
});

ok('isNewerVersion refuses missing/equal/older', () => {
  assert.equal(isNewerVersion('0.0.92', '0.0.91'), true);
  assert.equal(isNewerVersion('0.0.91', '0.0.91'), false);
  assert.equal(isNewerVersion('0.0.90', '0.0.91'), false);
  assert.equal(isNewerVersion(null, '0.0.91'), false);
  assert.equal(isNewerVersion('0.0.92', null), false);
});

ok('releaseUrl accepts a version or a tag', () => {
  assert.equal(releaseUrl('0.0.92'), 'https://github.com/texugo7badger/OLYMPUS/releases/tag/v0.0.92');
  assert.equal(releaseUrl('v0.0.92'), 'https://github.com/texugo7badger/OLYMPUS/releases/tag/v0.0.92');
  assert.match(releaseUrl(null), /releases\/latest$/);
});

ok('preferences default to check-on-startup, no auto-download', () => {
  assert.deepEqual(readUpdatePrefs(null), { checkOnStartup: true, autoDownload: false });
  assert.deepEqual(readUpdatePrefs({}), { checkOnStartup: true, autoDownload: false });
  assert.deepEqual(readUpdatePrefs({ checkOnStartup: false, autoDownload: true }), { checkOnStartup: false, autoDownload: true });
});

ok('preferences reject untrusted storage values', () => {
  assert.deepEqual(readUpdatePrefs({ checkOnStartup: 'yes', autoDownload: 'yes' }), { checkOnStartup: true, autoDownload: false });
  assert.deepEqual(readUpdatePrefs('nope'), { checkOnStartup: true, autoDownload: false });
});

ok('writeUpdatePrefs round-trips through readUpdatePrefs', () => {
  const prefs = { checkOnStartup: false, autoDownload: true };
  assert.deepEqual(readUpdatePrefs(JSON.parse(writeUpdatePrefs(prefs))), prefs);
});

ok('the root layout mounts the startup box', () => {
  const layout = read('src/app/layout.tsx');
  assert.match(layout, /AppUpdateBox/);
  assert.match(layout, /<AppUpdateBox\s*\/>/);
});

ok('the box listens to every electron-update event', () => {
  const box = read('src/components/olympus/app-update-box.tsx');
  for (const event of ['olympus:update-available', 'olympus:update-download-progress', 'olympus:update-downloaded', 'olympus:update-error']) {
    assert.ok(box.includes(event), `missing listener: ${event}`);
  }
  assert.match(box, /downloadUpdate/);
  assert.match(box, /quitAndInstall/);
  assert.match(box, /checkOnStartup/);
  assert.match(box, /autoDownload/);
});

ok('the main process checks 5s after launch, in packaged builds', () => {
  const main = read('electron/main.ts');
  assert.match(main, /5_000/);
  assert.match(main, /initAutoUpdater\(\)/);
  assert.match(main, /app\.isPackaged/);
});

console.log(`\napp-update: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
