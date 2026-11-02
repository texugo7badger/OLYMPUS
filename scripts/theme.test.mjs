#!/usr/bin/env node
/**
 * theme.test.mjs — v0.0.32: 12 presets, WCAG AA, accent, icons, stable mode.
 * Run: npx tsx scripts/theme.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  DEFAULT_THEME, PALETTE_KEYS, THEME_ICONS, THEME_PRESETS,
  applyTheme, contrastRatio, normalizeThemeState, resolvePalette,
} from '../src/lib/theme.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('at least 10 presets, balanced dark/light', () => {
  assert.ok(THEME_PRESETS.length >= 10, String(THEME_PRESETS.length));
  assert.ok(THEME_PRESETS.filter((p) => p.mode === 'dark').length >= 5);
  assert.ok(THEME_PRESETS.filter((p) => p.mode === 'light').length >= 5);
});

ok('every preset defines every palette key as hex', () => {
  for (const p of THEME_PRESETS) {
    for (const key of PALETTE_KEYS) {
      assert.match(p.colors[key], /^#[0-9A-Fa-f]{6}$/, `${p.id}.${key}=${p.colors[key]}`);
    }
  }
});

ok('text on background clears WCAG AA (4.5:1) in every preset', () => {
  for (const p of THEME_PRESETS) {
    const ratio = contrastRatio(p.colors.text, p.colors.bg);
    assert.ok(ratio >= 4.5, `${p.id}: ${ratio.toFixed(2)}:1`);
  }
});

ok('dim text is still legible (>= 3:1)', () => {
  for (const p of THEME_PRESETS) {
    const ratio = contrastRatio(p.colors.textDim, p.colors.bg);
    assert.ok(ratio >= 3, `${p.id}: ${ratio.toFixed(2)}:1`);
  }
});

ok('the user accent overrides only the primary', () => {
  const palette = resolvePalette({ ...DEFAULT_THEME, accent: '#123ABC' });
  assert.equal(palette.gold, '#123ABC');
  assert.equal(palette.green, DEFAULT_THEME && resolvePalette(DEFAULT_THEME).green);
});

ok('normalize rejects garbage but keeps valid state', () => {
  const t = normalizeThemeState({ presetId: 'nope', mode: 'blue', accent: 'red', iconId: 'x', motion: 'warp' });
  assert.equal(t.presetId, DEFAULT_THEME.presetId);
  assert.equal(t.mode, 'dark');
  assert.equal(t.accent, null);
  assert.equal(t.motion, 'full');
});

ok('applyTheme writes every CSS variable + data attributes', () => {
  const props = new Map();
  const attrs = new Map();
  applyTheme({ ...DEFAULT_THEME, presetId: 'paper', iconId: 'classic', motion: 'stable' }, {
    setAttribute: (n, v) => attrs.set(n, v),
    style: { setProperty: (n, v) => props.set(n, v) },
  });
  // The paper preset's own gold/amberSoft (the palette lab can override them).
  const paper = THEME_PRESETS.find((p) => p.id === 'paper');
  assert.equal(props.get('--color-olympus-gold'), paper.colors.gold);
  assert.equal(props.get('--color-olympus-amber-soft'), paper.colors.amberSoft);
  assert.equal(attrs.get('data-theme'), 'paper');
  assert.equal(attrs.get('data-mode'), 'light');
  assert.equal(attrs.get('data-motion'), 'stable');
  assert.equal(attrs.get('data-icon'), 'classic', 'the original mark is the only identity');
});

ok('the four icon presets exist on disk', () => {
  assert.ok(THEME_ICONS.length >= 4);
  for (const icon of THEME_ICONS) {
    assert.ok(existsSync(new URL(`../public${icon.src.replace('/icons', '/icons')}`, import.meta.url)) || existsSync(new URL(`../public${icon.src}`, import.meta.url)), icon.src);
  }
});

ok('the settings UI and the status bar consume the system', () => {
  const settings = readFileSync(new URL('../src/components/olympus/settings-dialog.tsx', import.meta.url), 'utf-8');
  const status = readFileSync(new URL('../src/components/olympus/status-bar.tsx', import.meta.url), 'utf-8');
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf-8');
  assert.match(settings, /Appearance/);
  assert.match(settings, /stable mode/i);
  assert.match(status, /ThemedLogo/);
  assert.match(css, /\[data-motion="stable"\]/);
  // The runtime variables are the ones the utilities reference; a literal
  // hex in a utility would ignore the theme (the bug this test exists for).
  assert.match(css, /--olympus-gold:\s*#[0-9A-Fa-f]{6}/);
  assert.match(css, /--color-olympus-gold:\s*var\(--olympus-gold\)/);
  const sunmoon = readFileSync(new URL('../src/components/olympus/theme-mode-icons.tsx', import.meta.url), 'utf-8');
  assert.match(sunmoon, /tmi-spin/);
  assert.match(sunmoon, /tmi-twinkle/);
  assert.match(settings, /SunModeIcon/);
  assert.match(settings, /MoonModeIcon/);
  const brainPalette = readFileSync(new URL('../src/lib/brain-atlas-palette.ts', import.meta.url), 'utf-8');
  assert.match(brainPalette, /themedOlympusPalette/);
  assert.match(brainPalette, /get\('--olympus-gold'/);
});

console.log(`\ntheme: ${passed} passed`);
