#!/usr/bin/env node
/**
 * mcp-health.test.mjs — THE MCP HEALTH CHECK (2026-10-24).
 *
 * The user's specimen: "temos vários MCPs que não estão carregando dentro do
 * opencode v2 aqui, deve estar ocorrendo o mesmo pro OLYMPUS!" — the MCP
 * Configuration panel showed enabled/disabled, never alive/dead, so a dead MCP
 * silently broke every tool call that depended on it.
 *
 * M1  the health route exists and is a GET
 * M2  the route probes enabled MCPs (spawn + initialize) and reports disabled
 *     ones as 'disabled' (no probe)
 * M3  the panel renders a status dot (alive/dead) with a tooltip naming the
 *     cause
 * M4  the registry entry has opencodeEnabled (the honest default)
 * M5  godot + rea are enabled by default (no external deps)
 * M6  uvx-dependent MCPs (blender, git, kubernetes, grafana) are disabled by
 *     default (uvx is not installed on this box)
 *
 * Run: npx tsx scripts/mcp-health.test.mjs   (exit 0 = pass)
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
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 240) : ''}`); }
}

// M1 — the health route exists
{
  const routePath = path.join(ROOT, 'src', 'app', 'api', 'olympus', 'mcp', 'health', 'route.ts');
  expect('M1 the health route exists', fs.existsSync(routePath));
  const src = fs.readFileSync(routePath, 'utf-8');
  expect('M1 it exports a GET handler', /export async function GET/.test(src));
  expect('M1 it probes enabled MCPs (spawn + initialize)', /spawn\(/.test(src) && /initialize/.test(src));
  expect('M1 it reports disabled MCPs as disabled (no probe)', /status: 'disabled'/.test(src));
  expect('M1 it caches results (CACHE_TTL_MS)', /CACHE_TTL_MS/.test(src));
}

// M2 — the panel fetches health
{
  const panel = fs.readFileSync(path.join(ROOT, 'src', 'components', 'olympus', 'mcp-config-panel.tsx'), 'utf-8');
  expect('M2 the panel fetches /api/olympus/mcp/health', /mcp\/health/.test(panel));
  expect('M2 the panel renders a status dot (alive/dead)', /bg-olympus-red shrink-0/.test(panel) && /bg-olympus-green shrink-0/.test(panel));
  expect('M2 the dot has a tooltip naming the cause', /data-tip=\{s\.health\.error/.test(panel));
}

// M3 — the registry entry has opencodeEnabled
{
  const reg = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'mcp-registry.ts'), 'utf-8');
  expect('M3 McpRegistryEntry has opencodeEnabled', /opencodeEnabled\?: boolean/.test(reg));
}

// M4 — all MCPs disabled by default (opt-in) due to the provider 128-tool limit
{
  const oc = JSON.parse(fs.readFileSync(path.join(ROOT, 'opencode.json'), 'utf-8'));
  const m = oc.mcp || {};
  expect('M4 all MCPs disabled by default (128-tool limit)', Object.values(m).every((v) => v?.enabled === false));
}

// M5 — uvx-dependent MCPs disabled by default (uvx not installed)
{
  const oc = JSON.parse(fs.readFileSync(path.join(ROOT, 'opencode.json'), 'utf-8'));
  const m = oc.mcp || {};
  // uvx is now installed (2026-10-25), so blender CAN run — but it still
  // needs the blender app itself, so it stays disabled until the user
  // confirms blender is installed.
  expect('M5 blender is disabled (needs the blender app)', m.blender?.enabled === false);
  expect('M5 comfyui is disabled (needs comfyui)', m.comfyui?.enabled === false);
  expect('M5 fal is disabled (needs API key)', m.fal?.enabled === false);
  expect('M5 originkit is disabled (needs API key)', m.originkit?.enabled === false);
}

// M6 — the sync exists (setMcpEnabled mirrors .mcp.json → opencode.json)
{
  const reg = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'mcp-registry.ts'), 'utf-8');
  expect('M6 setMcpEnabled mirrors .mcp.json entries into opencode.json', /MCP-SYNC/.test(reg) && /opencodeFlagFlipped = true/.test(reg));
}

console.log(`\nmcp-health: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
