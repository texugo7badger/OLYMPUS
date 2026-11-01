#!/usr/bin/env node
/**
 * mcp-native.test.mjs — v0.0.31 (R31-04).
 *
 * The curated MCP servers must run from the pinned cache, not through
 * `npx -y …@latest` (one Node wrapper per server, ~115 MB each, resolved
 * over the network on every lane spawn) and not through the mcp-compressor
 * double process.
 *
 * Run: npx tsx scripts/mcp-native.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(homedir(), '.olympus', 'mcp-cache');
const BASELINE = ['filesystem', 'memory', 'sequential-thinking', 'context7', 'brave-search'];

const runtime = JSON.parse(readFileSync(path.join(ROOT, 'opencode.json'), 'utf-8'));
const catalog = JSON.parse(readFileSync(path.join(ROOT, '.mcp.json'), 'utf-8'));
const manifestPath = path.join(CACHE, 'manifest.json');

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

for (const name of BASELINE) {
  ok(`${name}: runtime is node, not npx`, () => {
    const cmd = runtime.mcp?.[name]?.command ?? [];
    assert.equal(cmd[0], 'node', JSON.stringify(cmd));
    assert.ok(cmd.some((a) => a.includes('.olympus/mcp-cache/')), JSON.stringify(cmd));
    assert.ok(!cmd.some((a) => /(^|\/)npx$|@latest|mcp-compressor/.test(a)), JSON.stringify(cmd));
  });
  ok(`${name}: catalog is node, not npx`, () => {
    const entry = catalog.mcpServers?.[name];
    assert.ok(entry, 'catalog entry missing');
    assert.equal(entry.command, 'node');
    assert.ok((entry.args ?? []).some((a) => a.includes('.olympus/mcp-cache/')));
  });
}

ok('the vendor manifest exists', () => assert.ok(existsSync(manifestPath), manifestPath));
ok('the manifest lists every baseline server', () => {
  const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  for (const name of BASELINE) assert.ok(m.servers?.[name], `${name} missing`);
});
ok('every manifest entrypoint exists on disk', () => {
  const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  for (const [name, s] of Object.entries(m.servers ?? {})) {
    assert.ok(s.entry && existsSync(s.entry), `${name}: ${s.entry}`);
  }
});

console.log(`\nmcp-native: ${passed} passed`);
