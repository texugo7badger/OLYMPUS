#!/usr/bin/env node
/**
 * refresh-craft-apps.js — W-G CRAFT-EMBED (v0.0.7): the Craft Apps
 * auto-update probe. The catalog lives in src/lib/craft-apps.ts; the TRUTH
 * lives on the wire — this script re-probes every app's web build
 * (reachability + embedability), prints the honest table, and reports
 * drift (apps added/removed/renamed upstream vs the catalog).
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

const JSON_OUT = process.argv.includes('--json');

async function main() {
  const targets = [
    { id: ARTCRAFT_STUDIO.id, name: ARTCRAFT_STUDIO.name, url: ARTCRAFT_STUDIO.url },
    ...CRAFT_APPS.map((a) => ({ id: a.id, name: a.name, url: a.url })),
  ];
  const probes = await Promise.all(targets.map((t) => probeCraftApp(t.url, 12_000)));

  if (JSON_OUT) {
    console.log(JSON.stringify(probes, null, 2));
    const down = probes.filter((p) => !p.ok).length;
    process.exit(down > 0 ? 1 : 0);
  }

  // The honest table (the ArtCraft AGENTS.md doctrine: space-padded).
  const rows = targets.map((t, i) => ({
    app: t.name.padEnd(16),
    http: String(probes[i].httpStatus ?? '---').padStart(3),
    reachable: probes[i].ok ? 'yes' : 'NO ',
    frameable: probes[i].frameable ? 'yes' : 'no ',
    note: (probes[i].note ?? '').slice(0, 50),
  }));
  const header = `${'App'.padEnd(16)}  http  reachable  frameable  note`;
  const sep = '-'.repeat(header.length);
  console.log(header);
  console.log(sep);
  for (const r of rows) console.log(`${r.app}  ${r.http}  ${r.reachable.padEnd(10)}  ${r.frameable.padEnd(9)}  ${r.note}`);

  const down = probes.filter((p) => !p.ok);
  const unframeable = probes.filter((p) => p.ok && !p.frameable);
  console.log(sep);
  console.log(`craft-apps: ${probes.length} probed · ${probes.length - down.length} reachable · ${unframeable.length} embed-blocked`);
  if (down.length > 0) {
    console.error(`craft-apps: DOWN: ${down.map((p) => p.id).join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('refresh-craft-apps FAILED:', e); process.exit(1); });
