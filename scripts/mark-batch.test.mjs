#!/usr/bin/env node
/**
 * mark-batch.test.mjs — v0.1.1: marks are ONE Apollo terminal queue.
 *
 * Pins the centralized chat contract: the route formats the batch and calls
 * enqueuePrompt (HIGH, markview); no god inbox, no background runGodTurn, no
 * modal. The terminal drains high-priority items and focuses on demand.
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

const route = read('src/app/api/olympus/marks/send/route.ts');
const format = read('src/lib/marks-format.ts');
const preview = read('src/app/preview-window/page.tsx');
const live = read('src/components/olympus/live-preview.tsx');
const terminal = read('src/components/olympus/interactive-terminal.tsx');

ok('the mark route formats at most 20 marks into ONE batch', () => {
  assert.match(route, /slice\(0, 20\)/);
  assert.match(route, /marksPrompt\(slug, marks, previewUrl, 'apollo'\)/);
  assert.match(route, /enqueuePrompt\(slug, prompt/);
  assert.match(route, /source: 'markview'/);
  assert.match(route, /priority: 'high'/);
});

ok('no mark creates a parallel god inbox or a background model turn', () => {
  assert.doesNotMatch(route, /appendGodInbox|startMarkPlan|runGodTurn/);
  assert.doesNotMatch(route, /inboxId/);
});

ok('the batch prompt asks for ONE consolidated plan and up to 3 questions with options', () => {
  assert.match(format, /one consolidated plan/i);
  assert.match(format, /at most THREE short questions/i);
  assert.match(format, /2–4 concrete options/i);
  assert.match(format, /Approve to send to Atlas/);
  assert.match(format, /ONE Apollo terminal/);
});

ok('the preview window sends to Apollo only and shows a terminal message', () => {
  assert.match(preview, /sendMarks/);
  assert.match(preview, /\/api\/olympus\/marks\/send/);
  assert.doesNotMatch(preview, /target: 'athena'|sendMarks\('athena'\)/);
  assert.match(preview, /sent to Apollo in the terminal/);
});

ok('the live preview dispatches the terminal queue and focus events', () => {
  assert.match(live, /olympus:prompt-queued/);
  assert.match(live, /olympus:focus-terminal/);
  assert.match(live, /setRightTab\('terminal'\)/);
});

ok('the terminal auto-drains high-priority mark items and focuses the composer', () => {
  assert.match(terminal, /priority !== 'high'/);
  assert.match(terminal, /drainCreative/);
  assert.match(terminal, /olympus:focus-terminal/);
  assert.match(terminal, /olympus:prompt-queued/);
});

ok('the preview window persists marks per project', () => {
  assert.match(preview, /olympus:marks:\$\{slug\}/);
  assert.match(preview, /localStorage\.setItem/);
  assert.match(preview, /localStorage\.getItem/);
  assert.match(preview, /captureMark/);
  assert.match(preview, /Place a mark on the preview/);
});

ok('the preview overlay clears even when the iframe beats hydration', () => {
  assert.match(preview, /onLoad=\{\(\) => setLoaded\(true\)\}/);
  assert.match(preview, /setTimeout\(\(\) => setLoaded\(true\), 3000\)/);
});

console.log(`\nmark-batch: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
