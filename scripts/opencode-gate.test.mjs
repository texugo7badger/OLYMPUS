#!/usr/bin/env node
/**
 * opencode-gate.test.mjs — v0.0.31 (Epic L).
 *
 * The host OpenCode and OLYMPUS mirror each other: no update may be offered
 * or applied before the candidate passes the conformance gate. This suite
 * pins the gate surface and the route enforcement.
 *
 * Run: npx tsx scripts/opencode-gate.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf-8');
const gate = read('scripts/opencode-gate.mjs');
const route = read('src/app/api/olympus/opencode-update/route.ts');
const pkg = JSON.parse(read('package.json'));

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const CHECKS = ['serve-boot', 'v2-session-list', 'session-create', 'agent-select', 'model-select', 'prompt-ack', 'sse-first-event', 'turn-completes', 'tokens-present', 'schema-v2', 'abort', 'clean-exit'];
for (const c of CHECKS) ok(`gate runs ${c}`, () => assert.ok(gate.includes(`'${c}'`), c));

ok('the gate installs into the isolated candidates prefix', () => assert.ok(/opencode-candidates/.test(gate)));
ok('the gate uses a temp data dir and a free port (never the live app)', () => {
  assert.ok(/XDG_DATA_HOME/.test(gate));
  assert.ok(/XDG_CONFIG_HOME/.test(gate));
  assert.ok(/freePort/.test(gate));
  assert.ok(!/3737|3777/.test(gate), 'live ports must not appear in the gate');
});
ok('the gate writes an approval report', () => {
  assert.ok(/opencode-updates/.test(gate));
  assert.ok(/approved/.test(gate));
  assert.ok(/report\.json/.test(gate));
});
ok('the route reads the gate report', () => assert.ok(/opencode-updates/.test(route) && /readGateReport/.test(route)));
ok('the route refuses an ungated update with 409', () => {
  assert.ok(/conformance gate/.test(route));
  assert.ok(/status:\s*409/.test(route));
});
ok('the route names the gate command', () => assert.ok(/opencode:gate/.test(route)));
ok('package.json exposes opencode:gate', () => assert.equal(pkg.scripts['opencode:gate'], 'node scripts/opencode-gate.mjs'));

console.log(`\nopencode-gate: ${passed} passed`);
