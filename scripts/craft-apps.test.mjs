#!/usr/bin/env node
/**
 * craft-apps.test.mjs — W-G CRAFT-EMBED (v0.0.7): the thirteen ArtCraft
 * apps INSIDE OLYMPUS — the user's "tudo dentro do OLYMPUS" directive.
 * Run: npx tsx scripts/craft-apps.test.mjs   (exit 0 = pass)
 *
 * The design: the catalog (src/lib/craft-apps.ts) + the LIVE probe truth
 * (the route probes reachability + embedability per request — the
 * auto-update layer) + the pane (the grid + the embedded webview + the
 * honest non-frameable fallback) + the atelier handoff (the artcraft
 * button opens the Studio INSIDE, never a browser escape) + the agent
 * lane (the craft-launcher deeplink + the demigod citations).
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
  // ── G4: the catalog + the probe engine ─────────────────────────────────
  const lib = await import(OLYMPUS + '/src/lib/craft-apps.ts');
  expect('G4: the catalog carries the 13 Craft Apps + the Studio',
    lib.CRAFT_APPS.length === 13 && lib.ARTCRAFT_STUDIO.url.includes('app.getartcraft.com/create-image'),
    `apps=${lib.CRAFT_APPS.length}`);
  expect('G4: every app URL follows the app.getartcraft.com/<id> web-build shape',
    lib.CRAFT_APPS.every((a) => a.url === `https://app.getartcraft.com/${a.id}`),
    'an app URL deviates from the verified web-build pattern');
  expect('G4: every app cites its upstream license + repo (the honest catalog)',
    lib.CRAFT_APPS.every((a) => a.license === 'Apache-2.0' && a.repo.startsWith('storytold/')),
    'license/repo missing on an app');

  // The LIVE probe (the auto-update truth) — all 14, no network flakiness
  // tolerance beyond the probe's own honest failure shape.
  const probes = await lib.probeAllCraftApps();
  const reachable = probes.filter((p) => p.ok).length;
  const frameable = probes.filter((p) => p.frameable).length;
  expect('G4: the live probe reaches every app (14/14 — the embed lane is real)',
    reachable === 14, `${reachable}/14 reachable: ${probes.filter(p => !p.ok).map(p => p.id).join(', ')}`);
  expect('G4: the embedability check runs (frameable verdicts present per probe)',
    probes.every((p) => typeof p.frameable === 'boolean' && typeof p.httpStatus === 'number'),
    'the probe must carry the embed verdict + the HTTP status');

  // ── G1: the pane ─────────────────────────────────────────────────────────
  expect('G1: the craft-apps route ships (the catalog + probe API)',
    fs.existsSync(path.join(OLYMPUS, 'src/app/api/olympus/craft-apps/route.ts')),
    'the pane has no data route');
  const panelSrc = read('src/components/olympus/craft-apps-panel.tsx');
  expect('G1: the pane renders the grid + the EMBEDDED webview (inside OLYMPUS)',
    panelSrc.includes('iframe') && panelSrc.includes('grid'),
    'no embedded webview — the apps escape the window');
  expect('G1: the non-frameable fallback is honest (external-open chip, never a dead frame)',
    panelSrc.includes('frameable') && panelSrc.includes('open externally'),
    'a frame-blocked app would render a dead iframe');
  const storeSrc = read('src/lib/olympus-store.ts');
  const pageSrc = read('src/app/page.tsx');
  const barSrc = read('src/components/olympus/activity-bar.tsx');
  expect('G1: the pane is reachable (leftPane union + the page mount + the activity-bar button)',
    storeSrc.includes("'craft-apps'") && pageSrc.includes('CraftAppsPanel') && barSrc.includes('craft-apps'),
    'the pane is orphaned');

  // ── G2: the atelier handoff ──────────────────────────────────────────────
  const atelierSrc = read('src/components/olympus/atelier-panel.tsx');
  expect('G2: the artcraft button opens the Studio INSIDE (the pane event, never window.open)',
    atelierSrc.includes('olympus:open-craft-app') && !atelierSrc.includes("window.open(r.url, '_blank')"),
    'the studio still escapes to a browser tab');
  const deeplinkRoute = read('src/app/api/olympus/atelier/deeplink/route.ts');
  expect('G2: the web-lane response carries the vault path (the clipboard handoff)',
    deeplinkRoute.includes('vaultPath'),
    'the embedded studio loses the asset path');

  // ── G3: the agent lane ───────────────────────────────────────────────────
  const deeplinkSrc = read('src/lib/deeplink.ts');
  expect('G3: the craft-launcher joins the deeplink detections (the local agent lane)',
    deeplinkSrc.includes('craft-launcher'),
    'the launcher that installs all 13 apps is undetected');
  const ig = read('.opencode/prompts/agents/demigods/hephaestus/image_generator.txt');
  const ad = read('.opencode/prompts/agents/demigods/hephaestus/2d_asset_designer.txt');
  expect('G3: the forge demigods cite the Craft Apps as the escalation lane (agent-ready CLI/JSON)',
    /ArtCraft/.test(ig) && /Craft Apps/.test(ad),
    'the demigods do not know the embedded apps');

  // ── The auto-update + docs ──────────────────────────────────────────────
  expect('G4: scripts/refresh-craft-apps.js ships (the maintenance probe)',
    fs.existsSync(path.join(OLYMPUS, 'scripts/refresh-craft-apps.js')),
    'no refresh lane for the catalog truth');
  const doc = fs.existsSync(path.join(OLYMPUS, 'docs/research/craft-apps.md'))
    ? read('docs/research/craft-apps.md') : '';
  expect('G4: docs/research/craft-apps.md — the licenses + the deferred vendored lane honest',
    /Apache-2.0/.test(doc) && /DEFERRED/.test(doc),
    'the lane doc is missing the licensing/size honesty');

  if (failures > 0) { console.error(`\ncraft-apps: ${failures} FAIL`); process.exit(1); }
  console.log('\ncraft-apps: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
