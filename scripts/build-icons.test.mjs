#!/usr/bin/env node
/**
 * build-icons.test.mjs — v0.0.32: the animated category icons + talent editor.
 * Run: npx tsx scripts/build-icons.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BUILD_CATEGORIES, BUILD_LIMITS } from '../src/lib/build-categories.ts';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('ten categories, each with an icon on disk', () => {
  assert.ok(BUILD_CATEGORIES.length >= 10, String(BUILD_CATEGORIES.length));
  for (const c of BUILD_CATEGORIES) {
    assert.ok(existsSync(new URL(`../public${c.icon}`, import.meta.url)), c.icon);
  }
});

ok('every icon is pure animated SVG', () => {
  for (const c of BUILD_CATEGORIES) {
    const svg = read(`public${c.icon}`);
    assert.match(svg, /<svg/);
    assert.match(svg, /@keyframes/);
    assert.match(svg, /prefers-reduced-motion/);
    assert.ok(!/<script/i.test(svg), `${c.id} has script`);
  }
});

ok('the caps are the promised 3 skills / 3 MCPs / 5 demigods', () => {
  assert.deepEqual(BUILD_LIMITS, { skills: 3, mcps: 3, demigods: 5 });
});

ok('each category offers real arsenal options', () => {
  for (const c of BUILD_CATEGORIES) {
    assert.ok(c.skills.length >= 2, `${c.id} skills`);
    assert.ok(c.mcps.length >= 1, `${c.id} mcps`);
    assert.ok(c.demigods.length >= 1, `${c.id} demigods`);
  }
});

ok('the talent editor enforces the caps and posts a real build', () => {
  const editor = read('src/components/olympus/build-talent-editor.tsx');
  assert.match(editor, /BUILD_LIMITS/);
  assert.match(editor, /limit reached/);
  assert.match(editor, /\/api\/olympus\/design-builds/);
  const panel = read('src/components/olympus/design-builds-panel.tsx');
  assert.match(panel, /BuildTalentEditor/);
  assert.match(panel, /talent editor/);
});

console.log(`\nbuild-icons: ${passed} passed`);
