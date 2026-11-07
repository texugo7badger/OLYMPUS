#!/usr/bin/env node
/**
 * bench-hops.mjs — v0.0.86: the hop benchmark the AIME logs asked for.
 *
 * THE SPECIMEN: the only way to answer "why is the walk stopping?" was to
 * scroll `.olympus-hop-telemetry.jsonl` by hand. 345 rows, 87 parks, 75 of
 * them with an empty error — no totals, no percentiles, no cause table. This
 * script turns one lane's hop telemetry into a benchmark report (human or
 * JSON) and an optional GATE so a nightly run can fail loudly.
 *
 * Usage:
 *   node scripts/bench-hops.mjs --lane ~/OLYMPUS-VAULT/02_Projects/aime
 *   node scripts/bench-hops.mjs --lane <dir> --json
 *   node scripts/bench-hops.mjs --lane <dir> --gate
 *     gate: 0 completed rows / parked share > 20% / null-token share > 40%
 *           / any parked row in the last 20 with an empty cause.
 *
 * Exit: 0 = report printed (or the gate passed); 1 = the gate failed.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const getArg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const asJson = argv.includes('--json');
const gate = argv.includes('--gate');
const lane = path.resolve(getArg('--lane') || path.join(os.homedir(), 'OLYMPUS-VAULT', '02_Projects', 'aime'));
const file = path.join(lane, '.olympus-hop-telemetry.jsonl');

function pct(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
const mins = (ms) => (typeof ms === 'number' && Number.isFinite(ms) ? Math.round(ms / 600) / 100 : null);

let rows = [];
try {
  rows = fs.readFileSync(file, 'utf-8').trim().split('\n').map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
} catch {
  console.error(`bench-hops: no telemetry at ${file}`);
  process.exit(2);
}

const completed = rows.filter((r) => r.status === 'completed');
const parked = rows.filter((r) => String(r.status || '').startsWith('parked'));
const durations = rows.map((r) => r.durationMs).filter((n) => typeof n === 'number' && n >= 0);
const completedDurations = completed.map((r) => r.durationMs).filter((n) => typeof n === 'number' && n >= 0);
const nullTokens = rows.filter((r) => r.tokensIn == null || r.tokensOut == null).length;
const tokensIn = rows.map((r) => r.tokensIn).filter((n) => typeof n === 'number');
const tokensOut = rows.map((r) => r.tokensOut).filter((n) => typeof n === 'number');

const byStatus = {};
const byGod = {};
const byLane = {};
const byClass = {};
const causes = {};
for (const r of rows) {
  byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  byGod[r.god] = (byGod[r.god] || 0) + 1;
  const laneName = r.lane ? String(r.lane).split('/').slice(-1)[0] : '?';
  byLane[laneName] = (byLane[laneName] || 0) + 1;
  if (String(r.status || '').startsWith('parked')) {
    const cls = r.errorClass || 'unclassified';
    byClass[cls] = (byClass[cls] || 0) + 1;
    const key = `${r.status} · ${cls} · ${String(r.error || '(no error)').slice(0, 90)}`;
    causes[key] = (causes[key] || 0) + 1;
  }
}

const recent = rows.slice(-20);
const recentEmptyCause = recent.filter((r) => String(r.status || '').startsWith('parked') && !r.error && !r.errorClass).length;
const lastCompleted = completed.length ? completed[completed.length - 1] : null;

const report = {
  lane,
  file,
  generatedAt: new Date().toISOString(),
  rows: rows.length,
  completed: completed.length,
  parked: parked.length,
  parkedShare: rows.length ? Math.round((parked.length / rows.length) * 1000) / 10 : 0,
  nullTokens,
  nullTokenShare: rows.length ? Math.round((nullTokens / rows.length) * 1000) / 10 : 0,
  durationMinutes: {
    p50: mins(pct(durations, 50)),
    p90: mins(pct(durations, 90)),
    max: mins(pct(durations, 100)),
    completedP50: mins(pct(completedDurations, 50)),
    completedP90: mins(pct(completedDurations, 90)),
    completedMax: mins(pct(completedDurations, 100)),
  },
  tokens: {
    inTotal: tokensIn.reduce((a, b) => a + b, 0),
    outTotal: tokensOut.reduce((a, b) => a + b, 0),
    inP50: pct(tokensIn, 50),
    outP50: pct(tokensOut, 50),
  },
  byStatus,
  byGod,
  byLane,
  parkClasses: byClass,
  topCauses: Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([cause, count]) => ({ cause, count })),
  lastCompleted: lastCompleted ? { hop: lastCompleted.hop, god: lastCompleted.god, ts: lastCompleted.ts, durationMinutes: mins(lastCompleted.durationMs) } : null,
  recentRows: recent.length,
  recentParksWithoutCause: recentEmptyCause,
};

const failures = [];
if (gate) {
  if (rows.length === 0) failures.push('no telemetry rows');
  if (rows.length > 0 && report.completed === 0) failures.push('zero completed rows');
  if (report.parkedShare > 20) failures.push(`parked share ${report.parkedShare}% > 20%`);
  if (report.nullTokenShare > 40) failures.push(`null-token share ${report.nullTokenShare}% > 40%`);
  if (recentEmptyCause > 0) failures.push(`${recentEmptyCause} recent park(s) with no cause`);
}
report.gate = gate ? { ok: failures.length === 0, failures } : null;

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`hop benchmark — ${report.lane}`);
  console.log(`rows ${report.rows} · completed ${report.completed} · parked ${report.parked} (${report.parkedShare}%) · null tokens ${report.nullTokens} (${report.nullTokenShare}%)`);
  console.log(`duration p50 ${report.durationMinutes.p50}m · p90 ${report.durationMinutes.p90}m · max ${report.durationMinutes.max}m`);
  console.log(`completed p50 ${report.durationMinutes.completedP50}m · p90 ${report.durationMinutes.completedP90}m · max ${report.durationMinutes.completedMax}m`);
  console.log(`tokens ${report.tokens.inTotal} in / ${report.tokens.outTotal} out (median ${report.tokens.inP50}/${report.tokens.outP50})`);
  console.log(`status ${Object.entries(byStatus).map(([k, v]) => `${k}:${v}`).join(' · ')}`);
  console.log(`park classes ${Object.entries(byClass).map(([k, v]) => `${k}:${v}`).join(' · ') || '(none)'}`);
  if (report.topCauses.length) {
    console.log('top causes:');
    for (const c of report.topCauses) console.log(`  ${c.count}× ${c.cause}`);
  }
  if (report.lastCompleted) console.log(`last completed ${report.lastCompleted.hop} (${report.lastCompleted.god}) at ${report.lastCompleted.ts}`);
  if (gate) console.log(failures.length === 0 ? 'bench-hops gate: PASS' : `bench-hops gate: FAIL — ${failures.join('; ')}`);
}
process.exit(gate && failures.length ? 1 : 0);
