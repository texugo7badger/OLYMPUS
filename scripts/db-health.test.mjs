#!/usr/bin/env node
/**
 * db-health.test.mjs — v0.0.31 (R31-06).
 *
 * The 2026-11-01 history-loss specimen: the old health check required the
 * `session_input` table, which OpenCode v2 does not have, so every app start
 * deleted the live DB (a 344-message conversation survived only in a .bak).
 *
 * This suite pins the pure classifier: v2 is healthy, the exact legacy
 * partial migration is archived (never deleted), and unknown shapes are
 * left untouched.
 *
 * Run: npx tsx scripts/db-health.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { classifyOpencodeDb } from '../src/lib/opencode-spawn.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

ok('v2 schema is healthy', () => {
  assert.equal(classifyOpencodeDb(['session_v2', 'session_message', 'session_part']), 'healthy');
});
ok('v2 with legacy leftovers is healthy', () => {
  assert.equal(classifyOpencodeDb(['session', 'message', 'part', 'session_v2']), 'healthy');
});
ok('legacy schema with session_input is healthy', () => {
  assert.equal(classifyOpencodeDb(['session', 'message', 'part', 'session_input']), 'healthy');
});
ok('legacy partial migration (no session_input) is archived', () => {
  assert.equal(classifyOpencodeDb(['session', 'message', 'part', 'migration']), 'archive-legacy');
});
ok('empty schema is ignored (never risk data loss)', () => {
  assert.equal(classifyOpencodeDb([]), 'ignore');
});
ok('unknown schema is ignored', () => {
  assert.equal(classifyOpencodeDb(['kv', 'project', 'migration']), 'ignore');
});
ok('a v2 marker alone is healthy', () => {
  assert.equal(classifyOpencodeDb(['session_v2']), 'healthy');
});

console.log(`\ndb-health: ${passed} passed, ${process.exitCode ? 1 : 0} failed`);
