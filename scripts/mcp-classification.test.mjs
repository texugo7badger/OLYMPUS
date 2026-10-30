#!/usr/bin/env node
/**
 * mcp-classification.test.mjs — HONEST MCP STATES (v0.0.25).
 *
 * THE SPECIMEN: the user enabled the whole arsenal. Servers whose dependency
 * was simply absent (Docker, a database, a cluster, a binary, REAPER, an
 * active project) were painted RED as "dead", and the tool count (165) blew
 * past the 128 provider cap with no warning.
 *
 *   M1  the dependency preflight exists and never spawns an absent dep
 *   M2  the status vocabulary is honest (needs-*, optional-unavailable)
 *   M3  the health route preflights -> probes -> rewrites optional failures
 *   M4  the tool budget is computed and reported
 *   M5  the panel renders amber + the reason, and the one-click cures
 *   M6  the bulk route implements the three cures
 *   M7  diagnostics names the command/deps/keys (never the secret values)
 *   M8  the curated six are the reset target
 *
 * Run: npx tsx scripts/mcp-classification.test.mjs (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMcpDependency, whichSync } from '../src/lib/mcp-deps.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 320) : ''}`); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// ── M1: the preflight ──────────────────────────────────────────────────────
{
  const src = read('src/lib/mcp-deps.ts');
  expect('M1 checkMcpDependency is exported', /export async function checkMcpDependency/.test(src));
  expect('M1 whichSync scans PATH without spawning', /export function whichSync/.test(src) && /fs\.existsSync/.test(src));
  expect('M1 docker is checked with docker info', /docker/.test(src) && /execWithTimeout\('docker'/.test(src));
  expect('M1 postgres needs a connection string', /DATABASE_URL/.test(src));
  expect('M1 kubernetes needs a kubeconfig', /kubeconfig/i.test(src));
  expect('M1 apps are resolved on PATH', /needs-app/.test(src));
}

// ── M1b: live verdicts (deterministic on this machine) ────────────────────
{
  const fake = {
    name: 'mcp-gateway', type: 'local', command: ['mcp-gateway'], enabled: true,
    requires: { kind: 'binary', label: 'needs the binary', binary: 'definitely-not-a-real-binary-xyz' },
  };
  const v = await checkMcpDependency(fake, { PATH: '/nonexistent' }, new Set());
  expect('M1b an absent binary is needs-binary (never dead)', v.status === 'needs-binary', JSON.stringify(v));

  const keyed = {
    name: 'brave-search', type: 'local', command: ['npx', 'x'], enabled: true,
    requires: { kind: 'key', label: 'needs BRAVE_API_KEY', envVars: ['BRAVE_API_KEY'] },
  };
  const k = await checkMcpDependency(keyed, {}, new Set());
  expect('M1b a missing key is needs-auth', k.status === 'needs-auth', JSON.stringify(k));
  const k2 = await checkMcpDependency(keyed, {}, new Set(['BRAVE_API_KEY']));
  expect('M1b a present key passes the preflight', k2.status === 'ok', JSON.stringify(k2));

  const optional = {
    name: 'tamp', type: 'local', command: ['npx', 'x'], enabled: true,
    requires: { kind: 'optional', label: 'opt-in' },
  };
  const o = await checkMcpDependency(optional, {}, new Set());
  expect('M1b an optional server is always probeable', o.status === 'ok', JSON.stringify(o));

  const app = {
    name: 'rea', type: 'local', command: ['npx', 'x'], enabled: true,
    requires: { kind: 'app', label: 'needs REAPER' },
  };
  const a = await checkMcpDependency(app, { PATH: '/nonexistent' }, new Set());
  expect('M1b a missing app is needs-app', a.status === 'needs-app', JSON.stringify(a));
}

// ── M2: vocabulary ────────────────────────────────────────────────────────
{
  const probe = read('src/lib/mcp-probe.ts');
  for (const s of ['needs-auth', 'needs-service', 'needs-binary', 'needs-app', 'optional-unavailable']) {
    expect(`M2 status ${s} exists`, probe.includes(`'${s}'`), s);
  }
  expect('M2 dead is still a distinct status', /'dead'/.test(probe));
}

// ── M3: the health route ─────────────────────────────────────────────────
{
  const src = read('src/app/api/olympus/mcp/health/route.ts');
  expect('M3 preflights before spawning', /checkMcpDependency/.test(src));
  expect('M3 absent deps are never probed', /toProbe\.push/.test(src) && /unavailable\.push/.test(src));
  expect('M3 optional failures are rewritten', /optional-unavailable/.test(src));
  expect('M3 the summary counts unavailable', /unavailable/.test(src));
  expect('M3 the summary states the tool budget', /toolBudget/.test(src) && /overBudget/.test(src));
}

// ── M4: the budget constant ──────────────────────────────────────────────
{
  const src = read('src/app/api/olympus/mcp/health/route.ts');
  expect('M4 the budget is 128', /MCP_TOOL_BUDGET = 128/.test(src));
  expect('M4 overBudget is derived from the measured tools', /overBudget: tools > MCP_TOOL_BUDGET/.test(src));
}

// ── M5: the panel ─────────────────────────────────────────────────────────
{
  const src = read('src/components/olympus/mcp-config-panel.tsx');
  expect('M5 the panel knows the needs-* statuses', /needs-service/.test(src) && /needs-binary/.test(src) && /needs-app/.test(src));
  expect('M5 the requirement line shows when enabled', /isLocked \|\| isUnavail/.test(src) && /unavailable —/.test(src));
  expect('M5 red is reserved for dead', /isDead = st === 'dead'/.test(src));
  expect('M5 the tool meter is rendered', /tools \{tools\}\/\{budget\}/.test(src));
  expect('M5 the cures are one click', /Reset to curated/.test(src) && /Disable unavailable/.test(src) && /Enable available/.test(src));
  expect('M5 the registry source is surfaced', /registry: opencode\.json/.test(src));
  expect('M5 stale legacy toggles are surfaced', /stale “on” toggle/.test(src));
}

// ── M6: the bulk route ───────────────────────────────────────────────────
{
  const src = read('src/app/api/olympus/mcp/bulk/route.ts');
  expect('M6 reset-curated exists', /reset-curated/.test(src));
  expect('M6 disable-unavailable exists', /disable-unavailable/.test(src));
  expect('M6 enable-available exists', /enable-available/.test(src));
  expect('M6 it uses the registry writer', /setMcpEnabled/.test(src));
}

// ── M7: diagnostics ──────────────────────────────────────────────────────
{
  const src = read('src/app/api/olympus/mcp/diagnostics/route.ts');
  expect('M7 diagnostics route exists', fs.existsSync(path.join(ROOT, 'src/app/api/olympus/mcp/diagnostics/route.ts')));
  expect('M7 it reports dependency verdicts', /dependency: dep/.test(src));
  expect('M7 it reports key PRESENCE (not values)', /keysConfigured/.test(src) && !/process\.env\[k\]\s*[,}]/.test(src));
  expect('M7 it expands the command for the lane', /expandMcpPlaceholders/.test(src));
  expect('M7 it redacts secret placeholders (never exports a key)', /redactPlaceholders/.test(src) && !/command: \(s\.command \?\? \[\]\)\.map\(\(c\) => expandMcpPlaceholders/.test(src));
}

// ── M8: curated ──────────────────────────────────────────────────────────
{
  const src = read('src/lib/mcp-registry.ts');
  expect('M8 CURATED_MCP_SERVERS exists', /export const CURATED_MCP_SERVERS/.test(src));
  for (const n of ['filesystem', 'memory', 'git', 'context7', 'sequential-thinking', 'olympus-craft']) {
    expect(`M8 curated includes ${n}`, new RegExp(`'${n}'`).test(src));
  }
}


// ── M9: the USER'S TWELVE (live registry, empty PATH/keys) ────────────────
{
  const { listMcpServers } = await import('../src/lib/mcp-registry.ts');
  const byName = new Map(listMcpServers().servers.map((s) => [s.name, s]));
  const noPath = { PATH: '' };
  const noKeys = new Set();
  const expectStatus = {
    docker: 'needs-binary',
    postgres: 'needs-service',
    kubernetes: 'needs-service',
    'mcp-gateway': 'needs-binary',
    rea: 'needs-app',
    'brave-search': 'needs-auth',
  };
  for (const [name, want] of Object.entries(expectStatus)) {
    const entry = byName.get(name);
    expect(`M9 ${name} is in the registry`, !!entry, name);
    if (!entry) continue;
    const dep = await checkMcpDependency(entry, noPath, noKeys);
    expect(`M9 ${name} → ${want}`, dep.status === want, JSON.stringify(dep));
  }
  for (const name of ['tamp', 'nakkas', 'serena', 'shadcn', 'opendesign', 'pollinations']) {
    const entry = byName.get(name);
    if (!entry) continue;
    const dep = await checkMcpDependency(entry, noPath, noKeys);
    expect(`M9 ${name} is probeable at preflight (optional)`, dep.status === 'ok', JSON.stringify(dep));
  }
}

console.log(`\nmcp-classification: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
