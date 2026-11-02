#!/usr/bin/env node
/**
 * model-context.test.mjs — v0.0.32 (R32-01).
 *
 * The 200k fallback made a 1M model read "0%" at 600k and compaction fire at
 * the wrong time. One resolver, measured > documented > unknown — never a
 * guessed window.
 *
 * Run: npx tsx scripts/model-context.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { documentedWindow, normalizeModelId, resolveModelWindow } from '../src/lib/model-context.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('the DeepSeek lane resolves to the documented 1M/384k', () => {
  const w = resolveModelWindow('opencode-go/deepseek-v4.1-flash');
  assert.equal(w.context, 1_000_000);
  assert.equal(w.output, 384_000);
  assert.equal(w.source, 'documented');
  assert.equal(w.confidence, 'documented');
});

ok('provider prefixes and version suffixes normalize', () => {
  assert.equal(normalizeModelId('opencode-go/deepseek-v4.1-flash'), 'deepseek-v4.1-flash');
  assert.equal(normalizeModelId('nvidia:deepseek-v4-pro'), 'deepseek-v4-pro');
  assert.ok(documentedWindow('deepseek-v4.1-flash-2026-01'));
});

ok('a session value is MEASURED and wins', () => {
  const w = resolveModelWindow('deepseek-v4.1-flash', { sessionLimit: 640_000, catalogLimit: 128_000 });
  assert.equal(w.context, 640_000);
  assert.equal(w.source, 'session');
  assert.equal(w.confidence, 'measured');
});

ok('the free list wins over the catalog', () => {
  const w = resolveModelWindow('some/model', { freeListLimit: 1_048_576, catalogLimit: 128_000 });
  assert.equal(w.context, 1_048_576);
  assert.equal(w.source, 'free-list');
});

ok('the catalog wins over the documented table', () => {
  const w = resolveModelWindow('deepseek-v4.1-flash', { catalogLimit: 128_000 });
  assert.equal(w.context, 128_000);
  assert.equal(w.source, 'catalog');
});

ok('an unknown model is UNKNOWN — never 200k', () => {
  const w = resolveModelWindow('mystery/model-x');
  assert.equal(w.context, 0);
  assert.equal(w.output, null);
  assert.equal(w.source, 'unknown');
  assert.equal(w.confidence, 'unknown');
});

ok('junk source values are ignored', () => {
  const w = resolveModelWindow('mystery/model-x', { sessionLimit: 'nope', freeListLimit: -1, catalogLimit: 0 });
  assert.equal(w.source, 'unknown');
});

console.log(`\nmodel-context: ${passed} passed`);
