#!/usr/bin/env node
/**
 * resource-governor.test.mjs — v0.0.39 (R39-01).
 *
 * Proves the host budget is real: the snapshot carries measured numbers, the
 * verdict is one of the three honest classes, a giant workload is refused
 * with the numbers, and the admission gate is wired into the dev server.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const mod = await import(OLYMPUS + '/src/lib/resource-governor.ts');
const snapshot = mod.sampleResources({ cacheMs: 0 });

expect('G1: the snapshot measures the host (total > 0)',
  snapshot.totalMb > 0 && snapshot.availableMb >= 0 && snapshot.availableMb <= snapshot.totalMb,
  JSON.stringify(snapshot));
expect('G2: used% is bounded 0..100',
  snapshot.usedPct >= 0 && snapshot.usedPct <= 100,
  `usedPct=${snapshot.usedPct}`);
expect('G3: the verdict is green | amber | red',
  ['green', 'amber', 'red'].includes(snapshot.verdict),
  snapshot.verdict);
expect('G4: the census counts processes and reports RSS',
  snapshot.processCount >= 0 && snapshot.olympusRssMb >= 0,
  JSON.stringify({ count: snapshot.processCount, rss: snapshot.olympusRssMb }));
expect('G5: cores and load are real numbers',
  snapshot.cores >= 1 && Number.isFinite(snapshot.load1),
  `${snapshot.cores}/${snapshot.load1}`);

mod.resetResourceCache();
const impossible = mod.admitWorkload(snapshot.totalMb * 10, 'test workload');
expect('G6: an impossible workload is REFUSED with the floor named',
  impossible.ok === false && /floor|red memory pressure/.test(impossible.reason || ''),
  impossible.reason);
expect('G7: the refusal carries the snapshot (the user sees the numbers)',
  impossible.snapshot.totalMb > 0 && typeof impossible.snapshot.usedPct === 'number',
  JSON.stringify(impossible.snapshot));

const devServer = fs.readFileSync(OLYMPUS + '/src/lib/dev-server-manager.ts', 'utf-8');
expect('G8: the dev server start is gated by admitWorkload',
  /admitWorkload\(/.test(devServer) && /the resource governor refused/.test(devServer),
  'dev-server-manager does not call the governor');
const route = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/resources/route.ts', 'utf-8');
expect('G9: the resources route exposes GET + reclaim',
  /export async function GET/.test(route) && /'reclaim'/.test(route) && /cleanupServer/.test(route),
  'the route is missing the reclaim path');
const settings = fs.readFileSync(OLYMPUS + '/src/components/olympus/settings-dialog.tsx', 'utf-8');
expect('G10: Settings mounts the governor card',
  /ResourceGovernorCard/.test(settings),
  'the card is not in Settings');

console.log(failures === 0 ? '\nresource-governor: all green.' : `\nresource-governor: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
