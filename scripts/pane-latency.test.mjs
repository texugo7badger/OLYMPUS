#!/usr/bin/env node
/**
 * pane-latency.test.mjs — THE PANE-LATENCY CONTRACT (v0.0.25).
 *
 * THE SPECIMEN: every left-pane click felt slow. The causes were server-side:
 *   - Craft apps ran 14 live HTTP probes (8s timeout) on every open, then
 *     forced a 13-app GitHub check and auto-download 30s later;
 *   - the models fallback blocked the single event loop for up to 30s;
 *   - God Detail / Dashboard / Activity each re-read the vault per mount.
 *
 *   L1  the TTL cache exists with stale-while-revalidate
 *   L2  the heavy read-only routes use it
 *   L3  the craft probes are cached; the panel GET never blocks on a sweep
 *   L4  the craft updater is check-only by default (no silent downloads)
 *   L5  the models CLI fallback is async (no execSync on the event loop)
 *   L6  God Detail polls at 30s, not 10s
 *
 * Run: npx tsx scripts/pane-latency.test.mjs (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 320) : ''}`); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// ── L1: the cache utility ─────────────────────────────────────────────────
{
  const p = path.join(ROOT, 'src/lib/ttl-cache.ts');
  expect('L1 ttl-cache exists', fs.existsSync(p));
  const src = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
  expect('L1 it is stale-while-revalidate', /staleMs/.test(src) && /refreshing/.test(src));
  expect('L1 a failed refresh keeps the last good value', /the last good answer/.test(src));
  expect('L1 it exposes invalidation', /export function invalidateTtl/.test(src));
  expect('L1 the cache is bounded', /MAX_SLOTS/.test(src) && /evictIfNeeded/.test(src));
}

// ── L2: the routes ────────────────────────────────────────────────────────
{
  const routes = [
    'src/app/api/olympus/brain-stats/route.ts',
    'src/app/api/olympus/episodes/route.ts',
    'src/app/api/olympus/costs/route.ts',
    'src/app/api/olympus/sync-map/route.ts',
    'src/app/api/olympus/god/references/route.ts',
    'src/app/api/olympus/arsenal-recon/route.ts',
  ];
  for (const r of routes) {
    const src = read(r);
    expect(`L2 ${path.basename(path.dirname(r))} is cached`, /withTtl/.test(src), r);
  }
}

// ── L3: craft probes ──────────────────────────────────────────────────────
{
  const src = read('src/lib/craft-apps.ts');
  expect('L3 the probe layer has a TTL cache', /probeCache/.test(src) && /PROBE_TTL_MS/.test(src));
  expect('L3 a stale answer returns immediately + refreshes', /refreshCraftProbesInBackground/.test(src));
  expect('L3 the probe timeout is bounded to 3s', /probeCraftApp\(url: string, timeoutMs = 3000\)/.test(src));
  const route = read('src/app/api/olympus/craft-apps/route.ts');
  expect('L3 the panel GET uses the cached layer', /probeAllCraftApps\(\{ force: check \}\)/.test(route));
  expect('L3 only ?check=1 forces a fresh sweep', /const check = req\.nextUrl\.searchParams\.get\('check'\) === '1'/.test(route));
}

// ── L4: check-only updates ────────────────────────────────────────────────
{
  const src = read('src/lib/craft-vendor.ts');
  expect('L4 auto-install is opt-in', /OLYMPUS_CRAFT_AUTO_INSTALL === '1'/.test(src));
  expect('L4 the first sweep waits 10 minutes', /10 \* 60_000/.test(src));
  expect('L4 the forced sweep no longer starts at 30s', !/30_000\)/.test(src.slice(src.indexOf('startVendorAutoUpdater'), src.indexOf('startVendorAutoUpdater') + 600)));
}

// ── L5: models async ──────────────────────────────────────────────────────
{
  const src = read('src/app/api/olympus/models/route.ts');
  expect('L5 models does not execSync()', !/execSync\(/.test(src));
  expect('L5 models uses execFile', /execFile\(/.test(src));
  expect('L5 the CLI fallback is memoized', /CLI_CACHE/.test(src));
  expect('L5 the GET awaits it', /await readCli\(registered\)/.test(src));
}

// ── L6: God Detail poll ───────────────────────────────────────────────────
{
  const src = read('src/components/olympus/god-detail.tsx');
  expect('L6 God Detail polls at 30s', /\}, 30000\)/.test(src));
  expect('L6 the old 10s poll is gone', !/\}, 10000\)/.test(src));
}

// ── L7: the remaining request-path blockers ───────────────────────────────
{
  const history = read('src/app/api/olympus/history/route.ts');
  expect('L7 history does not execSync()', !/execSync\(/.test(history));
  expect('L7 history is cached + async', /withTtl\('history:log'/.test(history) && /execFile\(/.test(history));
  const buildInfo = read('src/app/api/olympus/build-info/route.ts');
  expect('L7 build-info resolves the revision once', /CACHED_REV/.test(buildInfo));
  expect('L7 build-info does not execSync()', !/execSync\(/.test(buildInfo));
}

console.log(`\npane-latency: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
