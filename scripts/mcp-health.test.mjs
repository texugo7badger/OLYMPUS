#!/usr/bin/env node
/**
 * mcp-health.test.mjs — THE MCP HEALTH CONTRACT (v0.0.24).
 *
 * The old suite pinned the bug: the route spawned `command[0]` only and the
 * panel could not tell a locked server from a dead one. This suite pins the
 * fixed contract:
 *
 *   M1  the health route exists and uses the SHARED canonical probe
 *   M2  the panel consumes the deduped list + the health summary
 *   M3  the registry normalizes and dedupes (28 servers)
 *   M4  the curated six is exactly the measured set
 *   M5  no duplicate React keys / no duplicate registry names
 *   M6  the sync route canonicalizes instead of writing the legacy shape
 *   M7  the probe treats olympus-craft's storm cap as alive
 *
 * Run: npx tsx scripts/mcp-health.test.mjs (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// M1 — the health route.
{
  const src = read('src/app/api/olympus/mcp/health/route.ts');
  expect('M1 the health route exists', fs.existsSync(path.join(ROOT, 'src/app/api/olympus/mcp/health/route.ts')));
  expect('M1 it uses the shared probe', /probeMcpBatch/.test(src) && /mcp-probe/.test(src));
  expect('M1 it no longer spawns directly', !/spawn\(/.test(src));
  expect('M1 it probes only enabled servers', /filter\(\(s\) => s\.enabled\)/.test(src));
  expect('M1 it reports locked as needs-auth (not dead)', /needs-auth/.test(src));
  expect('M1 it caches results and supports ?fresh=1', /CACHE_TTL_MS/.test(src) && /fresh/.test(src));
  expect('M1 it returns a summary', /summary: summarize/.test(src));
}

// M2 — the panel.
{
  const panel = read('src/components/olympus/mcp-config-panel.tsx');
  expect('M2 the panel fetches /api/olympus/mcp/list', /mcp\/list/.test(panel));
  expect('M2 the panel fetches /api/olympus/mcp/health', /mcp\/health/.test(panel));
  expect('M2 the panel renders the health summary', /Enabled \{summary\.alive\}/.test(panel));
  expect('M2 the panel renders dead / locked / off buckets', /deadCount/.test(panel) && /lockedCount/.test(panel) && /offCount/.test(panel));
  expect('M2 the panel has a probe-all control', /Probe every enabled MCP/.test(panel));
  expect('M2 health dots use the bottom side tooltip', /data-tip-side="bottom"/.test(panel));
  expect('M2 the panel no longer overrides enabled with mcp-state', !/mcp-state\.json/.test(panel));
}

// M3/M5 — the registry is deduped.
{
  const reg = read('src/lib/mcp-registry.ts');
  expect('M3 the registry imports the canonical normalizer', /normalizeMcpEntry/.test(reg));
  expect('M3 the registry has syncMcpConfig', /export function syncMcpConfig/.test(reg));
  expect('M3 the registry dedupes by name', /names\.includes/.test(reg));
  expect('M3 the registry exposes configIssues', /configIssues/.test(reg));
  expect('M3 the registry exposes requires metadata', /findMcpServerRequirement/.test(reg));
}

// M4 — curated set.
{
  const cfg = JSON.parse(read('opencode.json'));
  const on = Object.entries(cfg.mcp || {}).filter(([, v]) => v?.enabled === true).map(([k]) => k).sort();
  const curated = ['context7', 'filesystem', 'git', 'memory', 'olympus-craft', 'sequential-thinking'];
  expect('M4 the curated set is exactly the measured six', JSON.stringify(on) === JSON.stringify(curated), on.join(','));
  expect('M4 every runtime entry has a type', Object.values(cfg.mcp || {}).every((v) => v?.type === 'local' || v?.type === 'remote'));
  expect('M4 every local entry uses one command array', Object.values(cfg.mcp || {}).filter((v) => v?.type === 'local').every((v) => Array.isArray(v.command)));
  expect('M4 no entry carries legacy args/env', Object.values(cfg.mcp || {}).every((v) => v?.args === undefined && v?.env === undefined));
  expect('M4 no entry carries an object timeout', Object.values(cfg.mcp || {}).every((v) => v?.timeout === undefined || typeof v.timeout === 'number'));
}

// M6 — the sync route.
{
  const src = read('src/app/api/olympus/mcp/sync/route.ts');
  expect('M6 the sync route uses syncMcpConfig', /syncMcpConfig/.test(src));
  expect('M6 it reports changed/added/normalized', /changed: result\.changed/.test(src) && /normalized/.test(src));
  expect('M6 it no longer hand-writes a legacy entry', !/translated\.args/.test(src) && !/translated\.env/.test(src));
}

// M7 — the storm cap.
{
  const probe = read('src/lib/mcp-probe.ts');
  expect('M7 storm cap is alive, not dead', /storm cap reached/i.test(probe) && /finish\('alive'/.test(probe));
  expect('M7 the probe sends initialize + tools/list', /INIT/.test(probe) && /tools\/list/.test(probe));
  expect('M7 remote uses a JSON-RPC POST', /method: 'POST'/.test(probe));
}

console.log(`\nmcp-health: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
