#!/usr/bin/env node
/**
 * loader.test.mjs — v0.0.32: the branded boot animation.
 *
 * The app must never show a bare spinner list while Turbopack compiles. This
 * pins the pure-SVG loader (orbit + twinkle + breathe, reduced-motion), the
 * full-screen boot overlay, the panel fallback and the Electron splash.
 *
 * Run: npx tsx scripts/loader.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
const svg = read('public/olympus-loader.svg');
const component = read('src/components/olympus/olympus-loader.tsx');
const page = read('src/app/page.tsx');
const bus = read('src/lib/panel-loading-bus.ts');
const brain = read('src/components/olympus/brain-atlas-3d.tsx');
const main = read('electron/main.ts');

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('the loader is pure SVG with CSS keyframes and no script', () => {
  assert.match(svg, /<svg[^>]*viewBox="0 0 512 512"/);
  assert.match(svg, /@keyframes spin/);
  assert.match(svg, /@keyframes twinkle/);
  assert.match(svg, /@keyframes breathe/);
  assert.ok(!/<script/i.test(svg), 'the SVG must not execute JavaScript');
});

ok('the animation respects prefers-reduced-motion', () => {
  assert.match(svg, /prefers-reduced-motion:\s*reduce/);
});

ok('the palette is the OLYMPUS one', () => {
  for (const hex of ['#D4A574', '#9B7BAE', '#6BAEB5', '#7BAE8E', '#C4A265']) {
    assert.ok(svg.toUpperCase().includes(hex.toUpperCase()), hex);
  }
});

ok('the component serves fullscreen and mini variants', () => {
  assert.match(component, /viewBox="0 0 512 512"/);
  assert.match(component, /fullscreen/);
  assert.match(component, /loading the pantheon/);
});

ok('the app shows the overlay on every boot and the mini loader per panel', () => {
  assert.match(page, /<OlympusLoader fullscreen leaving=\{bootLeaving\}/);
  assert.match(page, /<OlympusLoader size=\{44\} label=\{label\}/);
  // A session flag suppressed the overlay on reloads while the panel chunks
  // still flashed — the overlay now waits for the real pending count.
  assert.ok(!/olympus:boot-anim/.test(page), 'no session gate may skip the animation');
  assert.match(page, /subscribePanelLoading/);
  assert.match(bus, /panelLoadingBump/);
});

ok('the brain atlas loops the loader and reacts to the live hop stream', () => {
  assert.match(brain, /OlympusLoader/);
  assert.match(brain, /themedOlympusPalette/);
  assert.match(brain, /hops\/stream/);
  assert.match(brain, /liveEvent/);
});

ok('the Electron main paints the splash before navigating', () => {
  assert.match(main, /function splashDataUrl\(\)/);
  assert.match(main, /olympus-loader\.svg/);
  assert.match(main, /isNextAlreadyRunning\(\)\) break/);
});

console.log(`\nloader: ${passed} passed`);
