#!/usr/bin/env node
/**
 * palette-lab.test.mjs — v0.0.32: full-family palettes with enforced contrast.
 * Run: npx tsx scripts/palette-lab.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { generateThemePalette, randomSeed } from '../src/lib/theme-generator.ts';
import { PALETTE_KEYS, contrastRatio, normalizeThemeState, resolvePalette } from '../src/lib/theme.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('every seed yields all 14 keys as hex', () => {
  for (let i = 0; i < 12; i += 1) {
    const palette = generateThemePalette(randomSeed(i % 2 ? 'dark' : 'light'));
    for (const key of PALETTE_KEYS) assert.match(palette[key], /^#[0-9A-Fa-f]{6}$/, `${key}=${palette[key]}`);
  }
});

ok('text/bg >= 7, dim >= 4.5 and accent >= 3 on random families', () => {
  for (let i = 0; i < 16; i += 1) {
    const palette = generateThemePalette(randomSeed(i % 2 ? 'dark' : 'light'));
    assert.ok(contrastRatio(palette.text, palette.bg) >= 7, `text ${contrastRatio(palette.text, palette.bg)}`);
    assert.ok(contrastRatio(palette.textDim, palette.bg) >= 4.5, `dim ${contrastRatio(palette.textDim, palette.bg)}`);
    assert.ok(contrastRatio(palette.gold, palette.bg) >= 3, `accent ${contrastRatio(palette.gold, palette.bg)}`);
  }
});

ok('a custom palette wins over the preset and normalizes', () => {
  const custom = generateThemePalette({ hue: 280, scheme: 'triadic', mode: 'light' });
  const state = normalizeThemeState({ presetId: 'olympus', custom });
  assert.deepEqual(resolvePalette(state), custom);
  const broken = normalizeThemeState({ presetId: 'paper', custom: { bg: 'nope' } });
  assert.equal(broken.custom, undefined);
});

console.log(`\npalette-lab: ${passed} passed`);
