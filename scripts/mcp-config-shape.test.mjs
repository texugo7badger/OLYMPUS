#!/usr/bin/env node
/**
 * mcp-config-shape.test.mjs — THE ONE MCP SHAPE (v0.0.24).
 *
 * The 2026-10-30 specimen: 50 rows for 28 servers, 19 entries invisible to
 * OpenCode (no `type`), `args` spawned as bare `npx`, `${VAR}` never
 * expanded, a `timeout` object that made OpenCode drop the entry.
 *
 * This suite pins the normalizer + the merged registry + the writer.
 *
 * Run: npx tsx scripts/mcp-config-shape.test.mjs (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMcpEntry, expandMcpPlaceholders, stableJson } from '../src/lib/mcp-shape.ts';
import { listMcpServers, setMcpEnabled, syncMcpConfig } from '../src/lib/mcp-registry.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}

// ── S1: the legacy catalog shape becomes the canonical runtime shape ───────
{
  const { config, issues } = normalizeMcpEntry('demo', {
    command: 'npx',
    args: ['-y', 'pkg@1'],
    env: { A: 'b' },
    timeout: { startup: 1000 },
  }, { defaultEnabled: true });
  expect('S1 type is local', config.type === 'local', JSON.stringify(config));
  expect('S1 command is ONE array with the args merged', JSON.stringify(config.command) === JSON.stringify(['npx', '-y', 'pkg@1']), JSON.stringify(config.command));
  expect('S1 env becomes environment', config.environment?.A === 'b', JSON.stringify(config.environment));
  expect('S1 object timeout is dropped', config.timeout === undefined, JSON.stringify(config.timeout));
  expect('S1 the legacy issues are named', issues.some((i) => /args/.test(i)) && issues.some((i) => /timeout/.test(i)), issues.join('; '));
}

// ── S2: an already-canonical entry is idempotent ───────────────────────────
{
  const raw = { type: 'local', command: ['npx', '-y', 'pkg'], environment: { X: '1' }, enabled: true, timeout: 30000 };
  const { config, issues } = normalizeMcpEntry('demo', raw, { defaultEnabled: false });
  expect('S2 canonical type/command preserved', config.type === 'local' && JSON.stringify(config.command) === JSON.stringify(raw.command));
  expect('S2 canonical timeout preserved', config.timeout === 30000);
  expect('S2 no synthetic issues', issues.length === 0, issues.join('; '));
  expect('S2 enabled preserved over the default', config.enabled === true);
}

// ── S3: remote shape ───────────────────────────────────────────────────────
{
  const { config } = normalizeMcpEntry('remote-demo', { url: 'https://mcp.example/mcp', headers: { Authorization: 'Bearer x' }, oauth: false }, { defaultEnabled: false });
  expect('S3 url infers remote', config.type === 'remote', JSON.stringify(config));
  expect('S3 headers + oauth preserved', config.headers?.Authorization === 'Bearer x' && config.oauth === false);
  expect('S3 remote is disabled by default', config.enabled === false);
}

// ── S4: placeholders ───────────────────────────────────────────────────────
{
  const out = expandMcpPlaceholders('{env:HOME}/x/${PROJECT_ROOT}/y', { lane: '/tmp/proj', env: { ...process.env, PROJECT_ROOT: '/tmp/proj' } });
  expect('S4 {env:HOME} expands', out.includes(os.homedir()), out);
  expect('S4 ${PROJECT_ROOT} expands', out.includes('/tmp/proj'), out);
}

// ── S5: the real registry is DEDUPED ───────────────────────────────────────
{
  const { servers } = listMcpServers({ olympusRoot: ROOT });
  const names = servers.map((s) => s.name);
  expect('S5 exactly 28 merged servers', servers.length === 28, String(servers.length));
  expect('S5 no duplicate names', new Set(names).size === names.length, names.join(','));
  expect('S5 every entry has a type', servers.every((s) => s.type === 'local' || s.type === 'remote'));
  expect('S5 every local entry has a command array', servers.filter((s) => s.type === 'local').every((s) => Array.isArray(s.command) && s.command.length > 0));
  expect('S5 every key server names its key', servers.filter((s) => s.requires?.kind === 'key').every((s) => (s.requires?.envVars ?? []).length > 0));
}

// ── S6: sync writes the canonical shape into a fixture, then is a no-op ────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-mcp-sync-'));
  const mcpPath = path.join(dir, '.mcp.json');
  const ocPath = path.join(dir, 'opencode.json');
  fs.writeFileSync(mcpPath, JSON.stringify({
    mcpServers: {
      alpha: { command: 'npx', args: ['-y', 'alpha-mcp'], env: { TOKEN: '${TOKEN}' }, _comment: 'alpha server' },
      beta: { command: 'uvx', args: ['beta-mcp'] },
    },
  }, null, 2));
  fs.writeFileSync(ocPath, JSON.stringify({ mcp: {} }, null, 2));

  const first = syncMcpConfig({ olympusRoot: dir, backup: false });
  const oc = JSON.parse(fs.readFileSync(ocPath, 'utf-8'));
  expect('S6 sync added both catalog entries', first.added === 2, JSON.stringify(first));
  expect('S6 alpha is local with one command array', oc.mcp.alpha.type === 'local' && JSON.stringify(oc.mcp.alpha.command) === JSON.stringify(['npx', '-y', 'alpha-mcp']), JSON.stringify(oc.mcp.alpha));
  expect('S6 alpha env renamed', oc.mcp.alpha.environment?.TOKEN === '${TOKEN}', JSON.stringify(oc.mcp.alpha));
  expect('S6 both default OFF', oc.mcp.alpha.enabled === false && oc.mcp.beta.enabled === false);

  const before = stableJson(oc.mcp);
  const second = syncMcpConfig({ olympusRoot: dir, backup: false });
  const after = stableJson(JSON.parse(fs.readFileSync(ocPath, 'utf-8')).mcp);
  expect('S6 second sync is a no-op', second.changed === false && before === after, JSON.stringify(second));

  const toggle = setMcpEnabled('alpha', true, { olympusRoot: dir, stateFile: path.join(dir, 'mcp-state.json') });
  const oc2 = JSON.parse(fs.readFileSync(ocPath, 'utf-8'));
  expect('S6 toggle flips the runtime flag', toggle.ok && oc2.mcp.alpha.enabled === true, JSON.stringify(toggle));
  expect('S6 toggle writes the state file', JSON.parse(fs.readFileSync(path.join(dir, 'mcp-state.json'), 'utf-8')).enabled.alpha === true);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nmcp-config-shape: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
