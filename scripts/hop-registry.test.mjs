#!/usr/bin/env node
/**
 * hop-registry.test.mjs — v0.0.31 (R31-03).
 *
 * A hop server is spawned detached so a Next request cannot kill it mid-hop.
 * The 2026-11-01 specimen outlived its owner: `opencode serve` on :41741,
 * 57 minutes old, holding 8 MCP servers. The registry + reaper cure it.
 *
 * This suite pins the SAFETY rules (no live process is harmed):
 *   - an entry whose owner/app pid is dead is dropped
 *   - an entry whose pid is gone is dropped
 *   - a live pid that is NOT an opencode serve is never killed (pid reuse)
 *
 * Run: npx tsx scripts/hop-registry.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = mkdtempSync(join(tmpdir(), 'olympus-hopreg-'));
process.env.OLYMPUS_HOME = home;

const { reapOrphanHopServers } = await import('../src/lib/hop-runtime/warm-server.ts');

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const registry = join(home, 'hop-servers.json');
function write(entries) { writeFileSync(registry, JSON.stringify(entries, null, 2)); }
function read() { return existsSync(registry) ? JSON.parse(readFileSync(registry, 'utf-8')) : []; }

// 1. A dead owner + a dead pid: dropped, nothing killed.
write([{ pid: 999998, port: 4444, lane: '/tmp/lane', appPid: 999999, startedAt: new Date().toISOString() }]);
const reaped = reapOrphanHopServers();
ok('a dead owner is dropped from the registry', () => assert.deepEqual(read(), []));
ok('a dead pid is not reported as reaped', () => assert.deepEqual(reaped, []));

// 2. A live pid that is not an opencode serve is NEVER killed (pid reuse).
const live = process.pid; // this test process — definitely alive, not opencode
write([{ pid: live, port: 4445, lane: '/tmp/lane', appPid: 999999, startedAt: new Date().toISOString() }]);
const reaped2 = reapOrphanHopServers();
ok('a reused pid is kept, never killed', () => assert.deepEqual(reaped2, []));
ok('a reused pid stays in the registry for a human', () => assert.equal(read().length, 1));

// 3. A server older than the hard cap is reaped when it looks like opencode.
//    (Simulated: a dead pid is dropped even with a live owner.)
write([{ pid: 999997, port: 4446, lane: '/tmp/lane', appPid: process.pid, startedAt: new Date().toISOString() }]);
reapOrphanHopServers();
ok('a dead hop pid is dropped even with a live owner', () => assert.deepEqual(read(), []));

console.log(`\nhop-registry: ${passed} passed`);
