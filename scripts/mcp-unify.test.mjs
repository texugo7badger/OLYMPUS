#!/usr/bin/env node
/**
 * mcp-unify.test.mjs — W-E MCP-UNIFY (v0.0.6-premio): EVERY MCP configurable
 * in the MCP option, like the others.
 * Run: npx tsx scripts/mcp-unify.test.mjs   (exit 0 = pass)
 *
 * The defect (the pattern audit): the app's MCP Configuration panel reads
 * .mcp.json ONLY — while godot/blender/comfyui/rea live in opencode.json's
 * mcp block (the honest-optional lane, `enabled: false` + _olympus_note).
 * Result: FOUR registered MCPs are INVISIBLE to the panel; their own notes
 * say "Settings or flip this flag" — a Settings the entries never appear in.
 * The toggle for opencode-native entries must ALSO flip the opencode.json
 * `enabled` flag (opencode reads it at spawn; mcp-state.json alone would be
 * a lying toggle for that registry).
 *
 * The cure: src/lib/mcp-registry.ts — ONE merged registry (listMcpServers:
 * both files, a `registry` tag per entry, the opencode `enabled` surfaced)
 * + setMcpEnabled (mcp-state.json for .mcp.json entries; BOTH stores for
 * opencode-native entries — the surgical opencode.json flip the strategy
 * applier already practices). The list route becomes a shell; the state
 * route delegates; the panel renders the source + real defaults.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

async function main() {
  const libPath = path.join(OLYMPUS, 'src/lib/mcp-registry.ts');
  const hasLib = fs.existsSync(libPath);
  const lib = hasLib ? await import(OLYMPUS + '/src/lib/mcp-registry.ts') : null;

  // ── E1: the merged registry (fixture files) ──────────────────────────────
  if (hasLib && typeof lib.listMcpServers === 'function') {
    const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-mcpfx-'));
    const mcpJson = path.join(fx, '.mcp.json');
    const ocJson = path.join(fx, 'opencode.json');
    fs.writeFileSync(mcpJson, JSON.stringify({
      mcpServers: {
        'fixture-std': { command: 'npx', args: ['-y', 'fixture'], env: { X: '1' }, _comment: 'A standard-file MCP' },
        'figma': { command: 'npx', args: ['-y', 'figma-developer-mcp'], _comment: 'Figma dev mode MCP' },
      },
    }));
    fs.writeFileSync(ocJson, JSON.stringify({
      agent: { apollo: { model: 'x/y' } },
      mcp: {
        'fixture-oc': { type: 'local', command: ['npx', '-y', 'fixture-oc'], enabled: false, _olympus_note: 'The note' },
        'rea': { type: 'local', command: ['npx', '-y', 'rea-agents@6.7.0', 'mcp'], enabled: false, _olympus_note: 'W-E the reverse-engineering lane' },
      },
    }));
    const merged = lib.listMcpServers({ mcpJsonPath: mcpJson, opencodeJsonPath: ocJson });
    const byName = new Map(merged.servers.map(s => [s.name, s]));
    expect('E1: the merge carries BOTH registries (4 entries, zero loss)',
      merged.servers.length === 4, `got ${merged.servers.map(s => s.name).join(', ')}`);
    expect('E1: the registry tag distinguishes the sources',
      byName.get('fixture-std')?.registry === 'mcpjson' && byName.get('fixture-oc')?.registry === 'opencode',
      `std=${byName.get('fixture-std')?.registry} oc=${byName.get('fixture-oc')?.registry}`);
    expect('E1: the opencode `enabled` flag surfaces (the honest default)',
      byName.get('fixture-oc')?.opencodeEnabled === false,
      `opencodeEnabled=${byName.get('fixture-oc')?.opencodeEnabled}`);
    expect('E1: the _olympus_note is the opencode entry description',
      String(byName.get('fixture-oc')?.description || '').includes('The note'),
      `description=${byName.get('fixture-oc')?.description}`);
    expect('E1: the .mcp.json _comment is preferred over the command-derived description',
      String(byName.get('fixture-std')?.description || '') === 'A standard-file MCP',
      `description=${byName.get('fixture-std')?.description}`);

    // ── E3: the toggle — BOTH stores for opencode-native, state-only for std ─
    const stateFile = path.join(fx, 'state.json');
    const r1 = lib.setMcpEnabled('rea', true, { mcpJsonPath: mcpJson, opencodeJsonPath: ocJson, stateFile });
    const ocAfter1 = JSON.parse(fs.readFileSync(ocJson, 'utf-8'));
    const stateAfter1 = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    expect('E3: toggling an opencode-native ON flips the opencode.json enabled',
      r1.ok === true && r1.opencodeFlagFlipped === true && ocAfter1.mcp.rea.enabled === true,
      `flipped=${r1.opencodeFlagFlipped} opencode.rea=${ocAfter1.mcp.rea.enabled}`);
    expect('E3: the same toggle writes mcp-state.json (the runtime gate store)',
      stateAfter1.enabled.rea === true, `state=${JSON.stringify(stateAfter1)}`);
    const r2 = lib.setMcpEnabled('rea', false, { mcpJsonPath: mcpJson, opencodeJsonPath: ocJson, stateFile });
    const ocAfter2 = JSON.parse(fs.readFileSync(ocJson, 'utf-8'));
    expect('E3: toggling OFF flips back (idempotent, both stores)',
      r2.ok === true && ocAfter2.mcp.rea.enabled === false, `opencode.rea=${ocAfter2.mcp.rea.enabled}`);
    // #MCP-SYNC (2026-10-24): the contract CHANGED. A .mcp.json MCP that is
    // enabled in the UI must be mirrored into opencode.json (added if absent,
    // flipped if present) — otherwise the toggle lies and the god can never
    // call the tool (the opencode CLI reads opencode.json, not .mcp.json).
    // The sync is ADDITIVE + SURGICAL: it only touches the one entry, and it
    // preserves everything else verbatim. The safety invariant is no longer
    // "never touch" but "touch only the targeted entry, and only to mirror".
    const beforeStd = fs.readFileSync(ocJson, 'utf-8');
    const r3 = lib.setMcpEnabled('fixture-std', true, { mcpJsonPath: mcpJson, opencodeJsonPath: ocJson, stateFile });
    const afterStd = JSON.parse(fs.readFileSync(ocJson, 'utf-8'));
    expect('E3: a .mcp.json toggle MIRRORS into opencode.json (the new contract)',
      r3.ok === true && r3.opencodeFlagFlipped === true && afterStd.mcp['fixture-std']?.enabled === true,
      `flipped=${r3.opencodeFlagFlipped} enabled=${afterStd.mcp['fixture-std']?.enabled}`);
    // The mirror is SURGICAL: the opencode-native entries are untouched.
    const beforeParsed = JSON.parse(beforeStd);
    expect('E3: the mirror preserves unrelated opencode entries',
      JSON.stringify(afterStd.mcp.rea) === JSON.stringify(beforeParsed.mcp.rea)
      && JSON.stringify(afterStd.agent) === JSON.stringify(beforeParsed.agent),
      'the sync corrupted unrelated config');
    // Disabling sets enabled=false (never deletes the entry).
    lib.setMcpEnabled('fixture-std', false, { mcpJsonPath: mcpJson, opencodeJsonPath: ocJson, stateFile });
    const afterOff = JSON.parse(fs.readFileSync(ocJson, 'utf-8'));
    expect('E3: disabling sets enabled=false (never deletes)',
      afterOff.mcp['fixture-std']?.enabled === false, `enabled=${afterOff.mcp['fixture-std']?.enabled}`);
    const ocUntouched = JSON.parse(fs.readFileSync(ocJson, 'utf-8'));
    expect('E3: the surgical flip preserves the rest of opencode.json verbatim',
      JSON.stringify(ocUntouched.agent) === JSON.stringify({ apollo: { model: 'x/y' } }) && ocUntouched.mcp['fixture-oc'].command.join(' ') === 'npx -y fixture-oc',
      'the rewrite lost unrelated config');
    fs.rmSync(fx, { recursive: true, force: true });

    // ── The PRODUCTION merge: rea/blender/comfyui/godot become visible ──────
    const prod = lib.listMcpServers();
    const prodNames = new Set(prod.servers.map(s => s.name));
    expect('E1: the production panel sees the FOUR opencode-native MCPs (rea/blender/comfyui/godot)',
      prodNames.has('rea') && prodNames.has('blender') && prodNames.has('comfyui') && prodNames.has('godot')
      && prod.servers.find(s => s.name === 'rea')?.registry === 'opencode',
      `merged=${prod.servers.length} servers; rea registry=${prod.servers.find(s => s.name === 'rea')?.registry}`);
  } else {
    expect('E1: src/lib/mcp-registry.ts exports listMcpServers (the merged registry)', false,
      'the lib is absent — the panel still reads .mcp.json only, four registered MCPs invisible');
    expect('E3: setMcpEnabled exists (the dual-store toggle)', false, 'blocked: no lib');
  }

  // ── E2/E4: the routes + the panel ────────────────────────────────────────
  const listRoute = read('src/app/api/olympus/mcp/list/route.ts');
  expect('E2: the list route is a thin shell over the merged registry',
    listRoute.includes('mcp-registry') && listRoute.includes('listMcpServers'),
    'the route still reads .mcp.json inline');
  const stateRoute = read('src/app/api/olympus/mcp/state/route.ts');
  expect('E2: the state route delegates to setMcpEnabled (the dual-store toggle)',
    stateRoute.includes('setMcpEnabled'), 'the POST still writes mcp-state.json only — an opencode-native toggle would lie');
  const singleRoute = read('src/app/api/olympus/mcp/route.ts');
  expect('E2: the single-MCP detail route reads the merged registry (opencode entries resolve)',
    singleRoute.includes('listMcpServers') || singleRoute.includes('mcp-registry'),
    'the detail panel 404s for opencode-native names');
  const panelSrc = read('src/components/olympus/mcp-config-panel.tsx');
  expect('E4: the panel renders the registry source + the opencode honest default',
    panelSrc.includes('registry') && /opencodeEnabled|registry === 'opencode'/.test(panelSrc),
    'the panel treats every entry as a .mcp.json entry — the default-on lie for disabled opencode MCPs');

  if (failures > 0) { console.error(`\nmcp-unify: ${failures} FAIL`); process.exit(1); }
  console.log('\nmcp-unify: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
