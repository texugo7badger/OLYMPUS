#!/usr/bin/env node
/**
 * eta-model.test.mjs — v0.0.91: the honest ETA band.
 *
 * Pins four behaviours the user can feel:
 *   1. the v0.0.30 critical-path contract still holds (360s fixture);
 *   2. parks inflate the estimate (the 27% AIME rate is not invisible);
 *   3. design gates inflate it more than code hops (the 81% park specimen);
 *   4. the answer is a band + confidence, never a lone "~40m".
 *
 * Run: npx tsx scripts/eta-model.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

const { buildEtaModel, medianUpper, percentile, formatEta, formatEtaBand } =
  await import(OLYMPUS + '/src/lib/eta.ts');

// ── 1. The statistics primitives ────────────────────────────────────────────
expect('medianUpper keeps the house upper-middle median (120,180 → 180)',
  medianUpper([120, 180]) === 180, medianUpper([120, 180]));
expect('percentile p90 of two samples is the upper one',
  percentile([120, 180], 0.9) === 180, percentile([120, 180], 0.9));

// ── 2. The v0.0.30 fixture still yields 360s ────────────────────────────────
const NOW = Date.now();
const fixtureHops = [
  { id: 'h1', god: 'hephaestus', status: 'completed' },
  { id: 'h2', god: 'hephaestus', status: 'completed' },
  { id: 'h3', god: 'hephaestus', status: 'running', startedAt: new Date(NOW - 60_000).toISOString() },
  { id: 'h4', god: 'athena', status: 'pending' },
  { id: 'h5', god: 'athena', status: 'pending' },
];
const fixtureRows = [
  { hop: 'h1', god: 'hephaestus', status: 'completed', durationMs: 120_000 },
  { hop: 'h2', god: 'hephaestus', status: 'completed', durationMs: 180_000 },
];
const fixture = buildEtaModel({ hops: fixtureHops, telemetry: fixtureRows, now: NOW });
expect('the critical-path fixture still projects 360s p50',
  fixture.eta50Ms === 360_000, fixture.eta50Ms);
expect('the fixture is the athena path (360s), not a flat divide-by-3',
  fixture.perGod[0]?.god === 'athena' && fixture.perGod[0]?.eta50Ms === 360_000,
  JSON.stringify(fixture.perGod));
expect('the fixture reports the next visible hop (hephaestus 120s remaining)',
  fixture.nextVisibleMs === 120_000, fixture.nextVisibleMs);

// ── 3. Parks inflate the p50 (one extra attempt per observed park rate) ─────
const parkedRows = [
  ...fixtureRows,
  { hop: 'h6', god: 'hephaestus', status: 'parked-tool-budget', durationMs: 60_000 },
];
const parked = buildEtaModel({ hops: fixtureHops, telemetry: parkedRows, now: NOW });
expect('a 33% park rate inflates the p50 above the no-park fixture',
  parked.eta50Ms > fixture.eta50Ms, `${parked.eta50Ms} vs ${fixture.eta50Ms}`);
expect('the park rate is reported honestly',
  Math.abs(parked.parkRate - 1 / 3) < 0.01, parked.parkRate);

// ── 4. A design gate is riskier than a code hop ─────────────────────────────
const designRows = [
  { hop: 'design-review', god: 'athena', status: 'completed', durationMs: 500_000 },
  { hop: 'design-review-2', god: 'athena', status: 'parked-verify-failed', durationMs: 500_000 },
  { hop: 'design-review-3', god: 'athena', status: 'parked-unknown', durationMs: 500_000 },
  { hop: 'design-review-4', god: 'athena', status: 'parked-unknown', durationMs: 500_000 },
];
const designHop = buildEtaModel({
  hops: [{ id: 'design-review-final', god: 'athena', status: 'pending', designGate: true }],
  telemetry: designRows,
  now: NOW,
});
const codeHop = buildEtaModel({
  hops: [{ id: 'build-page', god: 'athena', status: 'pending' }],
  telemetry: designRows,
  now: NOW,
});
expect('a design gate estimates more than the same god on a code hop',
  designHop.eta50Ms > codeHop.eta50Ms, `${designHop.eta50Ms} vs ${codeHop.eta50Ms}`);
expect('the design gate count is reported',
  designHop.designGateCount === 1, designHop.designGateCount);

// ── 5. The band + confidence are part of the answer ─────────────────────────
const thin = buildEtaModel({ hops: fixtureHops, telemetry: fixtureRows, now: NOW });
expect('a 2-sample lane is low confidence (never a false high)',
  thin.confidence === 'low', thin.confidence);
const manyRows = Array.from({ length: 40 }, (_, i) => ({
  hop: `x${i}`, god: 'hephaestus', status: 'completed', durationMs: 600_000 + (i % 5) * 10_000,
}));
const thick = buildEtaModel({
  hops: [{ id: 'x-next', god: 'hephaestus', status: 'pending' }],
  telemetry: manyRows,
  now: NOW,
});
expect('a 40-sample, tight lane is high confidence',
  thick.confidence === 'high', `${thick.confidence} (${thick.sampleCount})`);
expect('the band is formatted as p50 + p90, never a single number',
  formatEtaBand({ eta50Ms: 3_240_000, eta90Ms: 6_000_000 }) === 'p50 54m · p90 1h40',
  formatEtaBand({ eta50Ms: 3_240_000, eta90Ms: 6_000_000 }));
expect('formatEta handles hours and minutes', formatEta(3_240_000) === '54m' && formatEta(5_040_000) === '1h24',
  `${formatEta(3_240_000)} / ${formatEta(5_040_000)}`);

if (failures > 0) {
  console.error(`\neta-model: ${failures} FAIL`);
  process.exit(1);
}
console.log('\neta-model: all green.');
