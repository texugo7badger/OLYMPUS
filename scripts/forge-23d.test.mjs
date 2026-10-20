#!/usr/bin/env node
/**
 * forge-23d.test.mjs — W-C FORGE-2D/3D (v0.0.6-premio): the 3D pipeline
 * gets an input channel, the 2D forge sees its asset, and the new-area
 * demigods ship.
 * Run: npx tsx scripts/forge-23d.test.mjs   (exit 0 = pass)
 *
 * The audit (v0.0.6): a GLB could not ENTER the vault (upload gates image/*
 * mimes only) — so FORGE-3D was a viewer whose input channel was manual file
 * copying; the "3d" button sent EVERY asset (images included) into
 * model-viewer's error card; FORGE-2D never loaded the selected asset
 * (initialData blank — a sketch pad, not an editor); and no 3D/2D specialist
 * demigods existed while the pygmalion prompt named a "Daedalus pipeline"
 * that had no Daedalus.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

function main() {
  // ── C1: GLB ingestion — the vault learns model mimes ─────────────────────
  const vaultSrc = read('src/lib/media-vault.ts');
  expect('C1: EXT_BY_MIME knows model/gltf-binary -> glb + model/gltf+json -> gltf',
    /'model\/gltf-binary': 'glb'/.test(vaultSrc) && /'model\/gltf\+json': 'gltf'/.test(vaultSrc),
    'the vault maps every mime to an image extension — a GLB would land as .png');
  const uploadSrc = read('src/app/api/olympus/atelier/upload/route.ts');
  expect('C1: the upload route accepts model/gltf-binary (+ the .glb filename sniff)',
    uploadSrc.includes('model/gltf-binary') && /\.glb/.test(uploadSrc),
    'upload gates image/* only — the 3D lane has no input channel');
  const panelSrc = read('src/components/olympus/atelier-panel.tsx');
  expect('C1: the drop zone accepts .glb/.gltf',
    /\.glb/.test(panelSrc),
    'the file input takes image/* only — GLBs bounce');
  const assetsRoute = read('src/app/api/olympus/atelier/assets/route.ts');
  expect('C1: the assets route serves .glb with the model content-type (never image/glb)',
    assetsRoute.includes('model/gltf-binary'),
    'the byte route derives image/<ext> — a GLB would serve as image/glb');

  // ── C2: FORGE-2D loads the asset into the canvas ─────────────────────────
  const forge2d = read('src/components/olympus/forge-2d.tsx');
  expect('C2: FORGE-2D builds initialData from the ASSET (fetch -> dataURL -> image element)',
    /fetch\(`\/api\/olympus\/atelier\/assets\?id=\$\{assetId\}`/.test(forge2d)
      && forge2d.includes('initialData')
      && /type:\s*'image'/.test(forge2d),
    'initialData is blank — the selected asset never enters the scene (the sketch-pad gap)');

  // ── C3: the 3d button dispatches by mime ──────────────────────────────────
  const forge3d = read('src/components/olympus/forge-3d.tsx');
  expect('C3: FORGE-3D renders the honest 2D LOOK for image assets (labeled, never an error card)',
    forge3d.includes("kind: 'model' | 'image'")
      || (forge3d.includes("'image'") && /2D/.test(forge3d)),
    'images sent to model-viewer die on the error card — the audit specimen');
  expect('C3: the panel passes the asset KIND (mime sniff: glb/gltf -> model, else image)',
    /isModel|glb|gltf/.test(panelSrc) && /kind/.test(panelSrc),
    'open3d sends every asset to the viewer blind');

  // ── C4: the 3D lanes documented honestly (TRELLIS parked, Meshy candidate) ─
  const lanesDoc = path.join(OLYMPUS, 'docs', 'research', '3d-lanes.md');
  const lanes = fs.existsSync(lanesDoc) ? fs.readFileSync(lanesDoc, 'utf-8') : '';
  expect('C4: docs/research/3d-lanes.md declares the local lane (TRELLIS) with its GPU requirement',
    /TRELLIS/.test(lanes) && /GPU/.test(lanes),
    'the t2-3D lane is prose in pygmalion with no honest requirements doc');
  expect('C4: the doc parks TRELLIS honest on this box (no NVIDIA GPU) + names the install campaign',
    /no.*GPU|parked/i.test(lanes) && /install/i.test(lanes),
    'the GPU absence is undocumented — a fake "coming soon" class');
  expect('C4: the hosted BYOK candidate (Meshy) declared, wiring deferred behind a key',
    /Meshy/.test(lanes) && /BYOK/i.test(lanes),
    'the hosted t2-3D lane is undocumented');
  expect('C4: the FORGE-3D fallback card names the lanes (Blender/ArtCraft + the honest 2D look)',
    /forge-2d\/forge-3d|Blender/.test(read('src/components/olympus/forge-3d.tsx')),
    'the fallback card names only the deep links');

  // ── C5: the new-area demigods — the full checklist ────────────────────────
  const registry = JSON.parse(read('opencode.demigods.json'));
  const hasDaedalus = registry.demigods?.daedalus?.parent_god === 'hephaestus';
  const hasApelles = registry.demigods?.apelles?.parent_god === 'hephaestus';
  expect('C5: daedalus + apelles in the registry (the new-area specialists dispatchable)',
    hasDaedalus && hasApelles, `daedalus=${hasDaedalus} apelles=${hasApelles}`);
  expect('C5: the registry counts are true (122 across the pantheon, hephaestus 21)',
    registry._meta?.total === 122 && registry._meta?.gods?.hephaestus === 21,
    `gogs=${JSON.stringify(registry._meta?.gods)} total=${registry._meta?.total}`);
  const houseSkeleton = (s) => s.includes('## Cognitive Style') && s.includes('## Available Skills') && s.includes('## Quality Gates') && s.includes('## Collaboration Signatures') && s.includes('## Forbidden') && s.includes('## Output Contract');
  const daedalusSrc = fs.existsSync(path.join(OLYMPUS, '.opencode/prompts/agents/demigods/hephaestus/daedalus.txt'))
    ? read('.opencode/prompts/agents/demigods/hephaestus/daedalus.txt') : '';
  const apellesSrc = fs.existsSync(path.join(OLYMPUS, '.opencode/prompts/agents/demigods/hephaestus/apelles.txt'))
    ? read('.opencode/prompts/agents/demigods/hephaestus/apelles.txt') : '';
  expect('C5: daedalus authored per the house skeleton (3D: mesh/GLB/Blender/TRELLIS)',
    houseSkeleton(daedalusSrc) && /GLB|3D/i.test(daedalusSrc) && /TRELLIS|Blender/.test(daedalusSrc),
    'the 3D specialist is absent or off-format');
  expect('C5: apelles authored per the house skeleton (2D: vector/raster/SVG)',
    houseSkeleton(apellesSrc) && /vector|SVG|raster/i.test(apellesSrc),
    'the 2D specialist is absent or off-format');
  const agentsMd = read('AGENTS.md');
  expect('C5: the AGENTS.md census is true (122 demigods, hephaestus 21)',
    agentsMd.includes('122 demigods') && /\|\s*\*\*Hephaestus\*\*\s*\|.*\|\s*21\s*\|/.test(agentsMd),
    'the census still says 120/19');
  // The instinct seeds (the demigod-author tool's pattern — the real vault).
  const seedDir = path.join(os.homedir(), 'OLYMPUS-VAULT', '05_Auto_Learning', 'instincts', 'hephaestus', 'seed');
  const daedalusSeed = fs.existsSync(path.join(seedDir, 'daedalus.md'));
  const apellesSeed = fs.existsSync(path.join(seedDir, 'apelles.md'));
  expect('C5: the seed instincts land in the vault (the demigod-author pattern)',
    daedalusSeed && apellesSeed, `daedalus=${daedalusSeed} apelles=${apellesSeed}`);
  expect('C5: the registry reload sentinel touched (the live dispatch picks the pair up)',
    fs.existsSync(path.join(os.homedir(), '.olympus', 'demigods-registry.reload')),
    'the reload sentinel is absent — the registry change waits for a restart');

  if (failures > 0) { console.error(`\nforge-23d: ${failures} FAIL`); process.exit(1); }
  console.log('\nforge-23d: all green.');
}

try { main(); } catch (e) { console.error('FIXTURE CRASH:', e); process.exit(1); }
