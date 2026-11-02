#!/usr/bin/env node
/**
 * design-decision.test.mjs — v0.0.34: at most 3 choices, one recommended,
 * and the identity generator shows one logo at a time.
 * Run: npx tsx scripts/design-decision.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
let pass = 0;
const ok = (name, fn) => { try { fn(); console.log('PASS ', name); pass += 1; } catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; } };

const board = read('src/components/olympus/artcraft-style-board.tsx');

ok('Athena offers at most three project-specific directions', () => {
  assert.match(board, /generatePalettes\(`\$\{projectName\} \$\{projectStacks\.join\(' '\)\}`, 3\)/);
  assert.match(board, /pool\.slice\(0, 3\)/);
});

ok('one option is visibly recommended and hibernate auto-picks it', () => {
  assert.match(board, /recommended: i === 0/);
  assert.match(board, /recommended/);
  assert.match(board, /design-auto-pick/);
  assert.match(board, /visibilitychange/);
});

ok('the identity generator shows one logo at a time', () => {
  assert.match(board, /logoIndex/);
  assert.match(board, /setLogoIndex/);
  assert.match(board, /another/);
  assert.match(board, /use this/);
});

ok('the terminal design-choice card is capped at three + recommended', () => {
  const route = read('src/app/api/olympus/design-choice/route.ts');
  assert.match(route, /slice\(0, 3\)/);
  assert.match(route, /recommended/);
  const card = read('src/components/olympus/design-choice-card.tsx');
  assert.match(card, /recommended/);
});

ok('the learning feed exposes the four kinds', () => {
  const route = read('src/app/api/olympus/learning/recent/route.ts');
  assert.match(route, /instinct/);
  assert.match(route, /knowledge/);
  assert.match(route, /skill/);
  assert.match(route, /mcp/);
});

console.log(`\ndesign-decision: ${pass} passed`);
