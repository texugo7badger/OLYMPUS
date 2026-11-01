#!/usr/bin/env node
/**
 * integration-env.test.mjs — v0.0.30 (#B1).
 *
 * THE SPECIMEN: the API Keys dialog wrote ~/.olympus/api-configs.json, the UI
 * said "API key configured", and originkit still returned 401 because the
 * Next/opencode spawn path read only .env files. This suite pins the loader
 * and its precedence so the key reaches the MCP process.
 *
 * Run: npx tsx scripts/integration-env.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { loadIntegrationEnv, parseApiConfigs, parseEnvFile } from '../src/lib/integration-env.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const home = mkdtempSync(join(tmpdir(), 'olympus-env-home-'));
const root = mkdtempSync(join(tmpdir(), 'olympus-env-root-'));
try {
  mkdirSync(join(home, '.olympus'), { recursive: true });
  writeFileSync(join(home, '.olympus', 'api-configs.json'), JSON.stringify({
    ORIGINKIT_API_KEY: 'ui-key',
    BRAVE_API_KEY: 'brave-key',
    EMPTY: '',
  }), 'utf-8');
  writeFileSync(join(home, '.olympus', '.env'), 'ORIGINKIT_API_KEY=dotenv-key\nMACHINE_ONLY=machine\n', 'utf-8');
  writeFileSync(join(root, '.env'), 'PROJECT_ONLY=project\nORIGINKIT_API_KEY=project-key\n', 'utf-8');

  ok('parseEnvFile reads KEY=VALUE and ignores comments', () => {
    const parsed = parseEnvFile('# c\nA=1\nB="two"\n\nBAD\n');
    assert.equal(parsed.A, '1');
    assert.equal(parsed.B, 'two');
    assert.equal(parsed.BAD, undefined);
  });

  ok('parseApiConfigs reads the UI JSON store', () => {
    const parsed = parseApiConfigs(JSON.stringify({ ORIGINKIT_API_KEY: 'k', BRAVE_API_KEY: 'b', N: 1 }));
    assert.equal(parsed.ORIGINKIT_API_KEY, 'k');
    assert.equal(parsed.BRAVE_API_KEY, 'b');
    assert.equal(parsed.N, undefined);
  });

  ok('api-configs.json wins over .env files', () => {
    const env = loadIntegrationEnv({ home, root, processEnv: {} });
    assert.equal(env.ORIGINKIT_API_KEY, 'ui-key');
    assert.equal(env.BRAVE_API_KEY, 'brave-key');
    assert.equal(env.EMPTY, undefined);
  });

  ok('both .env files are loaded', () => {
    const env = loadIntegrationEnv({ home, root, processEnv: {} });
    assert.equal(env.MACHINE_ONLY, 'machine');
    assert.equal(env.PROJECT_ONLY, 'project');
  });

  ok('process.env has the final word', () => {
    const env = loadIntegrationEnv({ home, root, processEnv: { ORIGINKIT_API_KEY: 'shell-key' } });
    assert.equal(env.ORIGINKIT_API_KEY, 'shell-key');
  });

  ok('a corrupt JSON store is not a crash', () => {
    const badHome = mkdtempSync(join(tmpdir(), 'olympus-env-bad-'));
    mkdirSync(join(badHome, '.olympus'), { recursive: true });
    writeFileSync(join(badHome, '.olympus', 'api-configs.json'), '{nope', 'utf-8');
    const env = loadIntegrationEnv({ home: badHome, root, processEnv: {} });
    assert.equal(env.ORIGINKIT_API_KEY, 'project-key');
    rmSync(badHome, { recursive: true, force: true });
  });
} finally {
  rmSync(home, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
}

console.log(`\nintegration-env: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
