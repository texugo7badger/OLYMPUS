#!/usr/bin/env node
/**
 * mcp-run-manifest.test.mjs — v0.0.30 (#B3).
 *
 * The AIME lane spawned 16 MCP servers / 107 tools for every hop while the
 * plan declared four. This suite pins the campaign manifest: baseline +
 * declared, broken servers excluded, git only in a git lane, and the lane
 * config filtered to exactly that set.
 *
 * Run: npx tsx scripts/mcp-run-manifest.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import {
  applyRunManifestFile,
  applyRunManifestToConfig,
  buildRunMcpManifest,
} from '../src/lib/mcp-run-manifest.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const plan = { hops: [{ mcp: 'playwright' }, { mcp: 'context7' }, { mcp: null }, { mcp: 'tamp' }] };

ok('manifest = baseline + declared, broken excluded', () => {
  const m = buildRunMcpManifest(plan);
  assert.ok(m.includes('filesystem'));
  assert.ok(m.includes('playwright'));
  assert.ok(m.includes('context7'));
  assert.ok(!m.includes('tamp'));
  assert.ok(!m.includes('git'));
});

ok('git joins only when the lane is a git repo', () => {
  const lane = mkdtempSync(join(tmpdir(), 'olympus-manifest-git-'));
  try {
    mkdirSync(join(lane, '.git'), { recursive: true });
    assert.ok(buildRunMcpManifest(plan, lane).includes('git'));
  } finally { rmSync(lane, { recursive: true, force: true }); }
});

ok('apply toggles only existing entries', () => {
  const cfg = { mcp: {
    filesystem: { enabled: false },
    playwright: { enabled: false },
    tamp: { enabled: true },
    serena: { enabled: true },
    postgres: { enabled: true },
  } };
  const r = applyRunManifestToConfig(cfg, ['filesystem', 'playwright', 'context7']);
  assert.deepEqual(r.enabled.sort(), ['filesystem', 'playwright']);
  assert.equal(cfg.mcp.filesystem.enabled, true);
  assert.equal(cfg.mcp.playwright.enabled, true);
  assert.equal(cfg.mcp.tamp.enabled, false);
  assert.equal(cfg.mcp.serena.enabled, false);
  assert.equal(cfg.mcp.postgres.enabled, false);
  assert.equal(cfg.mcp.context7, undefined);
});

const lane = mkdtempSync(join(tmpdir(), 'olympus-manifest-'));
try {
  writeFileSync(join(lane, 'opencode.json'), JSON.stringify({ mcp: {
    filesystem: { enabled: true },
    playwright: { enabled: false },
    tamp: { enabled: true },
  } }, null, 2), 'utf-8');

  ok('applyRunManifestFile writes the filtered lane config', () => {
    const r = applyRunManifestFile(lane, ['filesystem', 'playwright']);
    assert.equal(r.ok, true);
    assert.equal(r.changed, 2);
    const after = JSON.parse(readFileSync(join(lane, 'opencode.json'), 'utf-8'));
    assert.equal(after.mcp.filesystem.enabled, true);
    assert.equal(after.mcp.playwright.enabled, true);
    assert.equal(after.mcp.tamp.enabled, false);
  });
} finally {
  rmSync(lane, { recursive: true, force: true });
}

console.log(`\nmcp-run-manifest: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
