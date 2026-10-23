#!/usr/bin/env node
/**
 * ui-references.test.mjs — W-J UI-REFERENCES (v0.0.7): the curated component
 * inspiration — OriginKit + Skiper UI wired into the design flow.
 * Run: npx tsx scripts/ui-references.test.mjs   (exit 0 = pass)
 *
 * The design: the catalog (src/lib/ui-references.ts — both libraries, the
 * honest free/paid split) + the [OLYMPUS-DESIGN] marker injection (the gods
 * cite REAL patterns) + the originkit MCP by the 8-step checklist (remote,
 * free-key gated) + the References tab (the user's lane) + the demigod
 * enrichment + the honest doc. OLYMPUS never vendors upstream source.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
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
  // ── J1: the catalog ──────────────────────────────────────────────────────
  const lib = await import(OLYMPUS + '/src/lib/ui-references.ts');
  expect('J1: the catalog carries both libraries (OriginKit + Skiper)',
    lib.UI_REFERENCES.some((r) => r.library === 'originkit') && lib.UI_REFERENCES.some((r) => r.library === 'skiper'),
    'a library is missing');
  expect('J1: every entry carries the full shape (what/demo/fetch-lane/free)',
    lib.UI_REFERENCES.every((r) => r.what && r.demoUrl && r.fetchLane && typeof r.free === 'boolean'),
    'an entry is incomplete');
  expect('J1: the paid/premium split is HONEST (Skiper premium marked, never free)',
    lib.UI_REFERENCES.filter((r) => r.library === 'skiper' && !r.free).every((r) => /PREMIUM/.test(r.fetchLane)),
    'a paid component pretends to be free');
  expect('J1: the marquee list is bounded (>= 18 curated, the doctrine "pick one")',
    lib.UI_REFERENCES.length >= 18 && lib.UI_REFERENCES_MARKER_BLOCK.includes('at most ONE'),
    `count=${lib.UI_REFERENCES.length}`);

  // ── J2: the marker injection ──────────────────────────────────────────────
  const routeSrc = read('src/app/api/olympus/action/route.ts');
  expect('J2: the [OLYMPUS-DESIGN] marker carries the UI-REFERENCES block',
    routeSrc.includes('uiReferencesMarkerBlock') && routeSrc.includes('uiReferencesBlock'),
    'the design marker never mentions the references');
  expect('J2: the injection rides the same gate (architectural prompts only)',
    /uiReferencesBlock = action === 'prompt' && classification\.needsPlanning/.test(routeSrc),
    'the block fires on non-architectural turns');

  // ── J3: the originkit MCP — the 8-step checklist ────────────────────────
  const ocJson = JSON.parse(read('opencode.json'));
  expect('J3: opencode.json registers the originkit MCP (remote, DISABLED, the honest note)',
    ocJson.mcp?.originkit?.url === 'https://mcp.originkit.dev/vellumai' && ocJson.mcp?.originkit?.enabled === false,
    'the originkit MCP is unregistered or default-on');
  const reqMap = read('src/lib/mcp-api-requirements.ts');
  expect('J3: the shared requirements map carries originkit (the FREE key)',
    /names: \['originkit'\]/.test(reqMap) && reqMap.includes('ORIGINKIT_API_KEY'),
    'the MCP renders unlocked — the free-key gate is the honesty');
  const gateMap = read('.opencode/olympus/lib/mcp-gate.ts');
  expect('J3: the runtime gate mirror carries originkit',
    /originkit:\s*\{ envVars: \["ORIGINKIT_API_KEY"\] \}/.test(gateMap),
    'the runtime gate lets originkit through without the key');
  const tiersSrc = read('.opencode/src/olympus-router/src/mcp-tiers.ts');
  expect('J3: the tier table registers originkit (athena + hephaestus cold — equip per dispatch)',
    (tiersSrc.match(/server: 'originkit'/g) || []).length >= 2,
    'the design lanes cannot equip the MCP');
  const catalogSrc = read('src/app/api/olympus/god/dispatch-graph/route.ts');
  expect('J3: GOD_DISPATCH_CATALOG chips originkit on Athena + Hephaestus',
    (catalogSrc.match(/'originkit'/g) || []).length >= 2,
    'the god-detail chips never show the lane');
  const athenaArsenal = read('.opencode/vault-brain/mastered-skills/athena.md');
  expect('J3: the athena vault-brain arsenal documents the originkit lane',
    /originkit/.test(athenaArsenal), 'the goddess does not know her own lane');
  const dialogSrc = read('src/components/olympus/api-config-dialog.tsx');
  expect('J3: the API Keys dialog carries the ORIGINKIT_API_KEY field (the Atelier section)',
    dialogSrc.includes('ORIGINKIT_API_KEY'),
    'the user has no door for the free key');
  const apiRoute = read('src/app/api/olympus/api-configs/route.ts');
  expect('J3: the allowlist accepts ORIGINKIT_API_KEY',
    apiRoute.includes('ORIGINKIT_API_KEY'), 'the key POST is refused');

  // ── J4: the References tab + the route ──────────────────────────────────
  expect('J4: GET /api/olympus/ui-references ships (the catalog + live probes)',
    fs.existsSync(path.join(OLYMPUS, 'src/app/api/olympus/ui-references/route.ts')),
    'the tab has no data route');
  const panelSrc = read('src/components/olympus/craft-apps-panel.tsx');
  expect('J4: the Craft pane gains the References tab (search + the live demo embed + the copy-lane)',
    panelSrc.includes("'references'") && panelSrc.includes('ui-references') && panelSrc.includes('copy lane'),
    'the user cannot browse the references in-app');
  const refRouteSrc = read('src/app/api/olympus/ui-references/route.ts');
  expect('J4: the route probes the demo embedability (the honest frame verdict)',
    refRouteSrc.includes('probeCraftApp') && refRouteSrc.includes('frameable'),
    'a frame-blocked demo would render dead');

  // ── J5: the demigods + the doc ───────────────────────────────────────────
  const uiDesigner = read('.opencode/prompts/agents/demigods/athena/ui_designer.txt');
  expect('J5: the ui-designer carries the references doctrine (the websearch rule executed)',
    /OriginKit/.test(uiDesigner) && /Skiper/.test(uiDesigner) && /at most ONE/.test(uiDesigner),
    'the design demigod does not cite the references');
  const d2 = read('.opencode/prompts/agents/demigods/athena/2d_asset_designer.txt');
  expect('J5: the forge demigods cite the references (2d-asset-designer)',
    /UI-REFERENCES/.test(d2), 'the 2D lane is blind to the catalog');
  const doc = fs.existsSync(path.join(OLYMPUS, 'docs/research/ui-references.md'))
    ? read('docs/research/ui-references.md') : '';
  expect('J5: docs/research/ui-references.md — the never-vendor doctrine + the honest licenses',
    /never copies component source/.test(doc) && /PREMIUM is paid/.test(doc),
    'the licensing doctrine is undocumented');

  if (failures > 0) { console.error(`\nui-references: ${failures} FAIL`); process.exit(1); }
  console.log('\nui-references: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
