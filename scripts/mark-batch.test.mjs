#!/usr/bin/env node
/**
 * mark-batch.test.mjs — v0.0.91: multi-page marks and the verified model.
 *
 * The mark flow had two defects (2026-11-12):
 *   1. Athena's model (qwen3.7-plus) is not admitted by the current GO
 *      credential — provider.auth 401; deepseek-v4.1-flash is verified.
 *   2. The large preview window had no mark session; one mark at a time.
 *
 * These are source pins: the route carries the batch, the window carries the
 * queue, and the mark turn asks for the verified model.
 *
 * Run: npx tsx scripts/mark-batch.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const route = read('src/app/api/olympus/athena/edit/route.ts');
const preview = read('src/app/preview-window/page.tsx');
const godRun = read('src/lib/god-run.ts');

ok('the edit route accepts a marks[] batch (max 20)', () => {
  assert.match(route, /Array\.isArray\(body\?\.marks\)/);
  assert.match(route, /slice\(0, 20\)/);
  assert.match(route, /batch:\s*true/);
});

ok('the batch prompt asks for ONE consolidated plan', () => {
  assert.match(route, /one consolidated plan/i);
  assert.match(route, /Treat all .* marks as ONE batch/i);
  assert.match(route, /Approve to send to Apollo \+ Atlas/);
});

ok('the mark turn uses the verified GO model, never the 401 model', () => {
  assert.match(route, /GO_FALLBACK_MODEL/);
  assert.match(route, /runGodTurn\('athena', athenaInstruction, lane, 300_000, \{ model: GO_FALLBACK_MODEL \}\)/);
  assert.match(godRun, /opts: \{ model\?: string \}/);
  assert.match(godRun, /opts\.model === GO_FALLBACK_MODEL/);
});

ok('the preview window captures one mark and keeps the app navigable', () => {
  assert.match(preview, /captureMark/);
  assert.match(preview, /setMarkMode\(false\)/);
  assert.match(preview, /Place a mark on the preview/);
});

ok('the preview window persists the batch per project', () => {
  assert.match(preview, /olympus:marks:\$\{slug\}/);
  assert.match(preview, /localStorage\.setItem/);
  assert.match(preview, /localStorage\.getItem/);
});

ok('the preview window sends the batch to Athena in one request', () => {
  assert.match(preview, /sendMarks/);
  assert.match(preview, /marks: marks\.map/);
  assert.match(preview, /batch: true/);
  assert.match(preview, /\/api\/olympus\/athena\/edit/);
});

console.log(`\nmark-batch: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
