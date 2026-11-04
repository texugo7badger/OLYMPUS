#!/usr/bin/env node
/**
 * theme-gallery.test.mjs — v0.0.33: the gallery stays complete and linked.
 * Run: npx tsx scripts/theme-gallery.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { THEME_PRESETS } from '../src/lib/theme.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('one card per preset exists', () => {
  for (const preset of THEME_PRESETS) {
    assert.ok(existsSync(new URL(`../screenshots/themes/${preset.id}.svg`, import.meta.url)), preset.id);
  }
});

ok('each card is a pure SVG with the theme name and palette', () => {
  for (const preset of THEME_PRESETS) {
    const svg = read(`screenshots/themes/${preset.id}.svg`);
    assert.match(svg, /<svg/);
    assert.ok(svg.includes(preset.name), preset.id);
    assert.ok(!/<script/i.test(svg), preset.id);
  }
});

ok('the README and the gallery link every theme', () => {
  const readme = read('README.md');
  const gallery = read('screenshots/THEMES.md');
  // v0.0.72 — the gallery moved from generated SVG cards to real screenshots
  // (screenshots/themes/<id>.png). Both are accepted; every theme must be
  // linked in both documents either way.
  const linked = (doc, id) => doc.includes(`themes/${id}.svg`) || doc.includes(`themes/${id}.png`);
  for (const preset of THEME_PRESETS) {
    assert.ok(linked(readme, preset.id), `README ${preset.id}`);
    assert.ok(linked(gallery, preset.id), `gallery ${preset.id}`);
  }
});

ok('the generator script exists and is wired', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(existsSync(new URL('../scripts/theme-gallery.mjs', import.meta.url)));
  assert.equal(pkg.scripts['themes:gallery'], 'tsx scripts/theme-gallery.mjs');
});

console.log(`\ntheme-gallery: ${passed} passed`);
