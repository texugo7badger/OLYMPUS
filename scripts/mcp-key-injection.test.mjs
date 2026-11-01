#!/usr/bin/env node
/**
 * mcp-api-keys.test.mjs — v0.0.31 (R31-11).
 *
 * The 2026-11-01 specimen: the UI showed "API key configured" and the
 * Originkit probe returned 401 — the probe expanded `{env:...}` with
 * process.env only, not with the key store. The runtime had the key; the
 * probe lied. This suite pins the integration env and the expansion.
 *
 * Run: npx tsx scripts/mcp-api-keys.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { loadIntegrationEnv, parseApiConfigs } from '../src/lib/integration-env.ts';
import { expandMcpPlaceholders } from '../src/lib/mcp-shape.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const home = mkdtempSync(join(tmpdir(), 'olympus-keys-'));
mkdirSync(join(home, '.olympus'), { recursive: true });
writeFileSync(join(home, '.olympus', 'api-configs.json'), JSON.stringify({
  ORIGINKIT_API_KEY: 'originkit-test-key',
  BRAVE_API_KEY: 'brave-test-key',
}));

ok('the UI store is parsed into env keys', () => {
  const env = loadIntegrationEnv({ home, root: home, processEnv: {} });
  assert.equal(env.ORIGINKIT_API_KEY, 'originkit-test-key');
  assert.equal(env.BRAVE_API_KEY, 'brave-test-key');
});
ok('{env:VAR} expands with the provided env', () => {
  assert.equal(
    expandMcpPlaceholders('Bearer {env:ORIGINKIT_API_KEY}', { env: { ORIGINKIT_API_KEY: 'abc' } }),
    'Bearer abc',
  );
});
ok('${VAR} (legacy) expands too', () => {
  assert.equal(expandMcpPlaceholders('${BRAVE_API_KEY}', { env: { BRAVE_API_KEY: 'xyz' } }), 'xyz');
});
ok('a corrupt store is not a crash', () => assert.deepEqual(parseApiConfigs('{nope'), {}));
ok('the probe expands with opts.env (the false-401 cure)', () => {
  const src = readFileSync(new URL('../src/lib/mcp-probe.ts', import.meta.url), 'utf-8');
  assert.match(src, /expandMcpPlaceholders\(value,\s*\{\s*lane:\s*opts\.cwd,\s*env:\s*opts\.env\s*\}\)/);
});
ok('originkit carries the Authorization header', () => {
  const cfg = JSON.parse(readFileSync(new URL('../opencode.json', import.meta.url), 'utf-8'));
  assert.equal(cfg.mcp.originkit.headers.Authorization, 'Bearer {env:ORIGINKIT_API_KEY}');
});
ok('brave is the official package with the key env', () => {
  const cfg = JSON.parse(readFileSync(new URL('../opencode.json', import.meta.url), 'utf-8'));
  assert.ok(cfg.mcp['brave-search'].command.some((a) => a.includes('@brave/brave-search-mcp-server')));
  assert.equal(cfg.mcp['brave-search'].environment.BRAVE_API_KEY, '{env:BRAVE_API_KEY}');
});

console.log(`\nmcp-key-injection: ${passed} passed`);
