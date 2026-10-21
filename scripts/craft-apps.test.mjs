#!/usr/bin/env node
/**
 * craft-apps.test.mjs — W-G CRAFT-EMBED (v0.0.7) + W-M CRAFT-VENDOR
 * (v0.0.8): the thirteen ArtCraft apps INSIDE OLYMPUS — the user's
 * "tudo dentro do OLYMPUS" directive. Run: npx tsx scripts/craft-apps.test.mjs
 * (exit 0 = pass)
 *
 * The design: the catalog (src/lib/craft-apps.ts) + the VENDORED truth
 * (src/lib/craft-vendor.ts — the manager, the serve lane, the MCP lane)
 * + the LIVE probe truth (the fallback lane) + the pane (the grid + the
 * embedded webview + the honest non-frameable fallback) + the atelier
 * handoff + the agent lane (the olympus-craft MCP + the demigod
 * citations) + the version stamp (the badge law).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

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

  // The LIVE probe (the fallback-lane truth) — all 14, no network flakiness
  // tolerance beyond the probe's own honest failure shape.
  const probes = await lib.probeAllCraftApps();
  const reachable = probes.filter((p) => p.ok).length;
  const frameable = probes.filter((p) => p.frameable).length;
  expect('G4: the live probe reaches every app (14/14 — the fallback lane is real)',
    reachable === 14, `${reachable}/14 reachable: ${probes.filter(p => !p.ok).map(p => p.id).join(', ')}`);
  expect('G4: the embedability check runs (frameable verdicts present per probe)',
    probes.every((p) => typeof p.frameable === 'boolean' && typeof p.httpStatus === 'number'),
    'the probe must carry the embed verdict + the HTTP status');

  // ── M1: the vendored lane — the manager (fixtures, no network) ──────────
  const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-vendor-test-'));
  process.env.OLYMPUS_CRAFT_DIR = FIX;
  const vendor = await import(OLYMPUS + '/src/lib/craft-vendor.ts');
  expect('M1: the vendor root honors the test override (the fixture lane)',
    vendor.vendorRoot() === FIX, `root=${vendor.vendorRoot()}`);

  // The manifest roundtrip (the single source of the vendored state).
  const manifest = vendor.readManifest();
  manifest.web.gridcraft = { version: '0.9.0', sha256: 'abc', sizeBytes: 42, installedAt: new Date().toISOString() };
  vendor.saveManifest(manifest);
  expect('M1: the manifest roundtrips atomically (web/native/latest survive)',
    vendor.readManifest().web.gridcraft?.version === '0.9.0',
    'the manifest write/read broke');

  // The SHA-256 verify (the release sums truth — the NIST 'abc' vector).
  expect('M1: the SHA-256 verify matches the known vector',
    vendor.sha256Hex(Buffer.from('abc')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    vendor.sha256Hex(Buffer.from('abc')) || '(computed)');

  // The serve lane — the traversal guard is absolute.
  const srvRoot = path.join(FIX, 'web', 'gridcraft', 'current');
  fs.mkdirSync(path.join(srvRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(srvRoot, 'index.html'), '<!doctype html><title>GridCraft</title>');
  fs.writeFileSync(path.join(srvRoot, 'assets', 'app.wasm'), 'wasm-bytes');
  expect('M1: the serve lane resolves index.html from the vendored root',
    vendor.getServeFile('gridcraft', 'index.html')?.mime === 'text/html; charset=utf-8',
    'index.html did not resolve');
  expect('M1: the serve lane serves .wasm as application/wasm (load-bearing MIME)',
    vendor.getServeFile('gridcraft', 'assets/app.wasm')?.mime === 'application/wasm',
    'the wasm MIME is wrong');
  expect('M1: the serve lane resolves the empty path to index.html (the iframe src)',
    vendor.getServeFile('gridcraft', '')?.abs?.endsWith('index.html'),
    'the empty path did not fall back to index.html');
  expect('M1: the serve lane REFUSES traversal outside the vendored root',
    vendor.getServeFile('gridcraft', '../../../etc/passwd') === null || !String(vendor.getServeFile('gridcraft', '../..')?.abs ?? '').includes('etc'),
    'the traversal guard leaks');
  expect('M1: the serve lane is null for an unvendored app (the honest 404)',
    vendor.getServeFile('photocraft', 'index.html') === null,
    'an unvendored app must not serve');

  // The web serve-root discovery (the single-top-folder zips).
  const nested = path.join(FIX, 'nested');
  fs.mkdirSync(path.join(nested, 'photocraft-web-0.11.1'), { recursive: true });
  fs.writeFileSync(path.join(nested, 'photocraft-web-0.11.1', 'index.html'), 'x');
  expect('M1: findWebServeRoot unwraps the single top-level folder',
    vendor.findWebServeRoot(nested)?.endsWith('photocraft-web-0.11.1'),
    'the nested layout did not resolve');

  // The upstream release contracts (the naming laws, probe-verified).
  expect('M1: the web asset naming law derives from the catalog',
    vendor.webAssetName('photocraft', '0.11.1') === 'photocraft-web-0.11.1.zip',
    'the web asset name deviates from the upstream contract');
  const nativeAsset = vendor.nativeAssetName('photocraft', '0.11.1');
  expect('M1: the native asset naming law picks the per-OS portable build',
    !!nativeAsset && /AppImage|portable\.zip|dmg/.test(nativeAsset.name),
    `no portable asset on this platform: ${JSON.stringify(nativeAsset)}`);

  // The jobs registry (the install progress the panel polls).
  const job = vendor.createJob('gridcraft', 'web');
  vendor.patchJob(job.id, { phase: 'done', version: '0.9.0' });
  expect('M1: the job registry tracks phase + version (the panel poll)',
    vendor.getJob(job.id)?.phase === 'done' && vendor.getJob(job.id)?.version === '0.9.0',
    'the job registry lost the install truth');

  // ── M2: the LIVE upstream truth — latest + the web asset (13/13) ───────
  const latest = {};
  for (const a of lib.CRAFT_APPS) latest[a.id] = await vendor.resolveLatestVersion(a.id);
  const resolved = Object.values(latest).filter(Boolean).length;
  expect('M2: the releases/latest redirect resolves every app (13/13, zero API quota)',
    resolved === 13, `${resolved}/13: ${Object.entries(latest).filter(([, v]) => !v).map(([k]) => k).join(', ')}`);
  const webHeads = await Promise.all(lib.CRAFT_APPS.map(async (a) => {
    const v = latest[a.id];
    if (!v) return false;
    try {
      const r = await fetch(vendor.assetUrl(a.id, v, vendor.webAssetName(a.id, v)), { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12000) });
      return r.ok;
    } catch { return false; }
  }));
  expect('M2: every app PUBLISHES a self-hostable web build (13/13 — the vendored lane is real)',
    webHeads.every(Boolean), `${webHeads.filter(Boolean).length}/13 publish`);

  // ── M3: the routes ───────────────────────────────────────────────────────
  const routeSrc = read('src/app/api/olympus/craft-apps/route.ts');
  expect('M3: the craft-apps route ships the vendor actions (install/update-all/launch/exec)',
    /action === 'install'/.test(routeSrc) && /action === 'launch'/.test(routeSrc) && /action === 'exec'/.test(routeSrc) && /update-all/.test(routeSrc),
    'the vendor actions are missing from the route');
  expect('M3: the route starts the background auto-updater (auto-update ON — the directive)',
    routeSrc.includes('startVendorAutoUpdater'),
    'the auto-update sweep never starts');
  expect('M3: the serve route ships (the OLYMPUS-origin static server)',
    fs.existsSync(path.join(OLYMPUS, 'src/app/api/olympus/craft-apps/serve/[...path]/route.ts')),
    'the vendored builds have no server');
  const serveSrc = read('src/app/api/olympus/craft-apps/serve/[...path]/route.ts');
  expect('M3: the serve route guards traversal + carries the wasm MIME lane',
    serveSrc.includes('getServeFile') && read('src/lib/craft-vendor.ts').includes("'application/wasm'"),
    'the serve lane is unguarded or MIME-blind');

  // ── M4: the pane ────────────────────────────────────────────────────────
  const panelSrc = read('src/components/olympus/craft-apps-panel.tsx');
  expect('M4: the pane renders the grid + the EMBEDDED webview (inside OLYMPUS)',
    panelSrc.includes('iframe') && panelSrc.includes('grid'),
    'no embedded webview — the apps escape the window');
  expect('M4: the pane embeds the VENDORED build (the lib serveUrl, not their site)',
    panelSrc.includes('serveUrl') && panelSrc.includes('vendored') && read('src/lib/craft-vendor.ts').includes('`/api/olympus/craft-apps/serve/${app.id}/`'),
    'the pane still rides the live-site lane as primary');
  expect('M4: the non-frameable fallback is honest (external-open chip, never a dead frame)',
    panelSrc.includes('frameable') && panelSrc.includes('open externally'),
    'a frame-blocked app would render a dead iframe');
  expect('M4: the pane polls the install jobs (the honest progress bar)',
    panelSrc.includes('action=job') && panelSrc.includes('progress'),
    'the download progress is invisible');
  const barSrc = read('src/components/olympus/activity-bar.tsx');
  expect('M4: the menu label reads "Craft apps" (the user\'s label)',
    barSrc.includes('label="Craft apps"'),
    'the activity-bar label deviates');
  const storeSrc = read('src/lib/olympus-store.ts');
  const pageSrc = read('src/app/page.tsx');
  expect('M4: the pane is reachable (leftPane union + the page mount + the activity-bar button)',
    storeSrc.includes("'craft-apps'") && pageSrc.includes('CraftAppsPanel') && barSrc.includes('craft-apps'),
    'the pane is orphaned');

  // ── M5: the logos (the real app icons, licensed like the apps) ───────────
  const logoOk = lib.CRAFT_APPS.every((a) => {
    const p = path.join(OLYMPUS, 'public', 'craft-apps', 'logos', `${a.id}.png`);
    if (!fs.existsSync(p)) return false;
    const buf = fs.readFileSync(p);
    return buf.length > 100 && buf.readUInt32BE(0) === 0x89504e47;
  });
  expect('M5: all 13 official app logos are vendored (PNG magic verified)',
    logoOk, 'a logo is missing or not a PNG');
  expect('M5: the logo refresh lane ships (scripts/fetch-craft-logos.mjs)',
    fs.existsSync(path.join(OLYMPUS, 'scripts/fetch-craft-logos.mjs')),
    'no refresh lane for the logos');

  // ── M6: the MCP lane (the olympus-craft server) ─────────────────────────
  const mcpJson = read('.mcp.json');
  expect('M6: the olympus-craft MCP is registered (OLYMPUS-built — upstream ships none)',
    mcpJson.includes('"olympus-craft"') && mcpJson.includes('scripts/mcp-craft-server.mjs'),
    'the craft MCP is not in the registry');
  const mcpSrc = read('scripts/mcp-craft-server.mjs');
  expect('M6: the MCP carries the six tools (catalog/status/install/update/launch/exec)',
    ['craft_catalog', 'craft_status', 'craft_install', 'craft_update', 'craft_launch', 'craft_exec'].every((t) => mcpSrc.includes(t)),
    'a tool is missing');
  // The LIVE handshake — initialize + tools/list over stdio JSON-RPC.
  const handshake = await new Promise((resolve) => {
    const child = spawn('node', [path.join(OLYMPUS, 'scripts/mcp-craft-server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
    let buf = '';
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 8000);
    child.stdout.on('data', (d) => {
      buf += d.toString();
      try {
        const lines = buf.split('\n').filter(Boolean).map((l) => JSON.parse(l));
        const init = lines.find((l) => l?.result?.serverInfo);
        const tools = lines.find((l) => Array.isArray(l?.result?.tools));
        if (init && tools) { clearTimeout(timer); child.kill(); resolve({ serverInfo: init.result.serverInfo, tools: tools.result.tools }); }
      } catch { /* wait for more lines */ }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  });
  expect('M6: the MCP handshake answers initialize + tools/list (stdio JSON-RPC)',
    !!handshake && handshake.serverInfo?.name === 'olympus-craft' && handshake.tools?.length === 6,
    `handshake=${JSON.stringify(handshake)?.slice(0, 120)}`);

  // ── M7: the version stamp (the badge law) ──────────────────────────────
  const layoutSrc = read('src/app/layout.tsx');
  const statusBarSrc = read('src/components/olympus/status-bar.tsx');
  const pkg = JSON.parse(read('package.json'));
  expect('M7: the layout injects window.__OLYMPUS_VERSION__ (the badge source of truth)',
    layoutSrc.includes('__OLYMPUS_VERSION__') && layoutSrc.includes('package.json'),
    'the badge global is never defined');
  expect(`M7: the badge + package.json agree (v${pkg.version})`,
    statusBarSrc.includes(`'${pkg.version}'`) && pkg.version === '0.0.8',
    `package=${pkg.version} — the fallback or the stamp drifted`);

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
  const td = read('.opencode/prompts/agents/demigods/hephaestus/3d_asset_engineer.txt');
  expect('G3: the forge demigods cite the Craft Apps as the escalation lane (agent-ready CLI/JSON)',
    /ArtCraft/.test(ig) && /Craft Apps/.test(ad),
    'the demigods do not know the embedded apps');
  expect('G3: the demigods cite the vendored lane + the olympus-craft MCP (the headless drive)',
    /olympus-craft/.test(ad) && /olympus-craft/.test(td) && /olympus-craft/.test(ig),
    'the demigods are blind to the MCP');

  // ── The maintenance + docs ──────────────────────────────────────────────
  expect('M8: scripts/refresh-craft-apps.js ships (the maintenance probe + the web-asset truth)',
    fs.existsSync(path.join(OLYMPUS, 'scripts/refresh-craft-apps.js')) &&
    read('scripts/refresh-craft-apps.js').includes('webAssetName'),
    'no refresh lane for the catalog truth');
  const doc = fs.existsSync(path.join(OLYMPUS, 'docs/research/craft-apps.md'))
    ? read('docs/research/craft-apps.md') : '';
  expect('M8: docs/research/craft-apps.md — the VENDORED lane shipped + the licensing/trademark honesty',
    /Apache-2.0/.test(doc) && /SHA-256/.test(doc) && /trademark/i.test(doc) && /olympus-craft/.test(doc) && !/DEFERRED/.test(doc),
    'the lane doc is missing the shipped vendored truth');
  const credits = read('CREDITS.md');
  expect('M8: CREDITS carries the icon license + the trademark notice',
    /copied unmodified/.test(credits) && /trademark/i.test(credits),
    'the credits lost the icon/trademark honesty');
  const changelog = read('CHANGELOG.md');
  expect('M8: the CHANGELOG carries the v0.0.8 CRAFT-VENDOR entry',
    changelog.includes('## [v0.0.8]') && changelog.includes('W-M CRAFT-VENDOR'),
    'the batch is unlogged');

  // The fixture cleanup (never litter the tmpdir).
  fs.rmSync(FIX, { recursive: true, force: true });

  if (failures > 0) { console.error(`\ncraft-apps: ${failures} FAIL`); process.exit(1); }
  console.log('\ncraft-apps: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
