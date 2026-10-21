#!/usr/bin/env node
/**
 * refresh-craft-apps.js — W-G CRAFT-EMBED (v0.0.7) + W-M CRAFT-VENDOR
 * (v0.0.8): the Craft Apps maintenance probe. The catalog lives in
 * src/lib/craft-apps.ts; the TRUTH lives on the wire — this script
 * re-probes every app's LIVE web build (reachability + embedability —
 * the fallback lane), resolves the LATEST release via the
 * releases/latest redirect, and HEAD-checks the WEB ASSET
 * (<id>-web-<ver>.zip — the vendored lane's download) + the release
 * SHA256SUMS.txt, printing the honest table and reporting drift.
 *
 * Usage:
 *   node scripts/refresh-craft-apps.js            # probe + table
 *   node scripts/refresh-craft-apps.js --json     # machine-readable
 *
 * The panel probes live on every open (the route); this script is the
 * maintenance/CI lane (the doctor class) + the evidence for docs.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { CRAFT_APPS, ARTCRAFT_STUDIO, probeCraftApp } from '../src/lib/craft-apps.ts';
import { resolveLatestVersion, assetUrl, webAssetName, shaSumsUrl } from '../src/lib/craft-vendor.ts';

const JSON_OUT = process.argv.includes('--json');

async function headOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function main() {
  const targets = [
    { id: ARTCRAFT_STUDIO.id, name: ARTCRAFT_STUDIO.name, url: ARTCRAFT_STUDIO.url },
    ...CRAFT_APPS.map((a) => ({ id: a.id, name: a.name, url: a.url })),
  ];
  const probes = await Promise.all(targets.map((t) => probeCraftApp(t.url, 12_000)));

  // W-M: the vendored-lane truth — latest version + the web asset + sums.
  const appIds = CRAFT_APPS.map((a) => a.id);
  const latest = {};
  for (const id of appIds) latest[id] = await resolveLatestVersion(id, 12_000);
  const webAsset = {};
  const sumsOk = {};
  for (const id of appIds) {
    const v = latest[id];
    if (!v) { webAsset[id] = false; sumsOk[id] = false; continue; }
    webAsset[id] = await headOk(assetUrl(id, v, webAssetName(id, v)));
    sumsOk[id] = await headOk(shaSumsUrl(id, v));
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ probes, latest, webAsset, sumsOk }, null, 2));
    const down = probes.filter((p) => !p.ok).length;
    const webMiss = appIds.filter((id) => !webAsset[id]).length;
    process.exit(down > 0 || webMiss > 0 ? 1 : 0);
  }

  // The honest table (the ArtCraft AGENTS.md doctrine: space-padded).
  const rows = targets.map((t, i) => {
    const app = CRAFT_APPS.find((a) => a.id === t.id);
    const lane = app
      ? `${latest[t.id] ?? '---'}  web:${webAsset[t.id] ? 'zip' : 'NO '}  sums:${sumsOk[t.id] ? 'ok' : 'no '}`
      : 'live (the hosted studio)';
    return {
      app: t.name.padEnd(16),
      http: String(probes[i].httpStatus ?? '---').padStart(3),
      reachable: probes[i].ok ? 'yes' : 'NO ',
      frameable: probes[i].frameable ? 'yes' : 'no ',
      lane: lane.padEnd(24),
      note: (probes[i].note ?? '').slice(0, 40),
    };
  });
  const header = `${'App'.padEnd(16)}  http  reachable  frameable  latest/web/sums         note`;
  const sep = '-'.repeat(header.length);
  console.log(header);
  console.log(sep);
  for (const r of rows) console.log(`${r.app}  ${r.http}  ${r.reachable.padEnd(10)}  ${r.frameable.padEnd(9)}  ${r.lane}  ${r.note}`);

  const down = probes.filter((p) => !p.ok);
  const unframeable = probes.filter((p) => p.ok && !p.frameable);
  const webMiss = appIds.filter((id) => !webAsset[id]);
  console.log(sep);
  console.log(`craft-apps: ${probes.length} probed · ${probes.length - down.length} reachable · ${unframeable.length} embed-blocked · ${appIds.length - webMiss.length}/${appIds.length} web assets publish`);
  if (down.length > 0 || webMiss.length > 0) {
    if (down.length > 0) console.error(`craft-apps: DOWN: ${down.map((p) => p.id).join(', ')}`);
    if (webMiss.length > 0) console.error(`craft-apps: NO WEB ASSET: ${webMiss.join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('refresh-craft-apps FAILED:', e); process.exit(1); });
