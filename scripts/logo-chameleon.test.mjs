#!/usr/bin/env node
/**
 * logo-chameleon.test.mjs — v0.0.36: the original mark is multicolor, with
 * the exact geometry, in the app bar, favicon and system icon.
 * Run: npx tsx scripts/logo-chameleon.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
let pass = 0;
const ok = (name, fn) => { try { fn(); console.log('PASS ', name); pass += 1; } catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; } };

ok('the app-bar mark is the chameleon gradient with per-god dots', () => {
  const src = read('src/components/olympus/themed-logo.tsx');
  assert.match(src, /linearGradient/);
  assert.match(src, /c\.red/);
  assert.match(src, /c\.green/);
  assert.match(src, /c\.amberSoft/);
  assert.match(src, /c\.teal/);
  assert.match(src, /c\.blue/);
});

ok('the favicon is the same chameleon geometry', () => {
  const src = read('src/lib/theme.ts');
  assert.match(src, /olympus-cham/);
  assert.match(src, /c\.cyan/);
  assert.match(src, /c\.red/);
});

ok('the system icon renderer takes the full palette', () => {
  const src = read('electron/desktop-notify.ts');
  assert.match(src, /cyan\?: string/);
  assert.match(src, /accents/);
  assert.match(src, /mix\(\[ar, ag, ab\], \[pr, pg, pb\]/);
  const main = read('electron/main.ts');
  assert.match(main, /red: typeof p\.red/);
  assert.match(main, /cyan: palette\.cyan/);
});

ok('the original geometry is untouched', () => {
  const src = read('src/components/olympus/themed-logo.tsx');
  assert.match(src, /M 64 38 L 84 84 L 72 84 L 64 66 L 56 84 L 44 84 Z/);
  assert.match(src, /dot\(64, 12, 2, c\.gold\)/);
  assert.match(src, /dot\(64, 116, 2, c\.amberSoft\)/);
});

console.log(`\nlogo-chameleon: ${pass} passed`);
