#!/usr/bin/env node
/**
 * bench-aime-report.mjs — v0.1.9: turn a lane's hop telemetry into a saved run.
 *
 * The app already records per-hop telemetry (`.olympus-hop-telemetry.jsonl`)
 * and per-session benchmark rows. This script writes a durable run directory
 * with a JSON + Markdown report: completion, parks by class, null-token share,
 * p50/p90 duration, tokens, per-god and per-lane breakdown. It is the bridge
 * between "we recorded it" and "we can audit it later".
 *
 * Usage:
 *   npm run bench:report -- --lane ~/OLYMPUS-VAULT/02_Projects/aime
 *   npm run bench:report -- --lane <dir> --out <dir>
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const lane = path.resolve(getArg('--lane', path.join(os.homedir(), 'OLYMPUS-VAULT', '02_Projects', 'aime')));
const file = path.join(lane, '.olympus-hop-telemetry.jsonl');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(getArg('--out', path.join(os.homedir(), 'OLYMPUS-VAULT', '07_Reviews', 'benchmarks', 'runs', `${path.basename(lane)}-${stamp}`)));

if (!fs.existsSync(file)) {
  console.error(`bench-aime-report: no telemetry at ${file}`);
  process.exit(2);
}
const rows = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean).map((line) => {
  try { return JSON.parse(line); } catch { return null; }
}).filter(Boolean);
const pct = (p) => {
  if (!rows.length) return 0;
  const sorted = rows.map((r) => r.durationMs).filter((n) => typeof n === 'number' && n >= 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
};
const status = {};
const causes = {};
const byGod = {};
const byLane = {};
let tokensIn = 0, tokensOut = 0, nullTokens = 0, completed = 0, parked = 0;
for (const r of rows) {
  const s = String(r.status || 'unknown');
  status[s] = (status[s] || 0) + 1;
  if (s === 'completed') completed++;
  if (s.startsWith('parked')) {
    parked++;
    const cls = r.errorClass || 'unclassified';
    causes[cls] = (causes[cls] || 0) + 1;
  }
  if (typeof r.tokensIn === 'number') tokensIn += r.tokensIn; else nullTokens++;
  if (typeof r.tokensOut === 'number') tokensOut += r.tokensOut;
  const god = r.god || 'unknown';
  byGod[god] = (byGod[god] || 0) + 1;
  const l = r.lane ? String(r.lane).split('/').pop() : 'unknown';
  byLane[l] = (byLane[l] || 0) + 1;
}
const report = {
  generatedAt: new Date().toISOString(),
  lane,
  file,
  rows: rows.length,
  completed,
  parked,
  parkedShare: rows.length ? Math.round((parked / rows.length) * 1000) / 10 : 0,
  nullTokenShare: rows.length ? Math.round((nullTokens / rows.length) * 1000) / 10 : 0,
  tokens: { input: tokensIn, output: tokensOut },
  durationMs: { p50: pct(50), p90: pct(90), max: pct(100) },
  status,
  parkCauses: causes,
  byGod,
  byLane,
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const md = [
  `# Benchmark run — ${path.basename(lane)}`,
  '',
  `Generated: ${report.generatedAt}`,
  `Lane: ${lane}`,
  '',
  '| Metric | Value |',
  '|---|---:|',
  `| Hops | ${report.rows} |`,
  `| Completed | ${report.completed} |`,
  `| Parked | ${report.parked} (${report.parkedShare}%) |`,
  `| Null-token rows | ${report.nullTokenShare}% |`,
  `| Tokens in / out | ${report.tokens.input} / ${report.tokens.output} |`,
  `| Duration p50 / p90 / max | ${report.durationMs.p50 ?? '—'} / ${report.durationMs.p90 ?? '—'} / ${report.durationMs.max ?? '—'} ms |`,
  '',
  '## Park causes',
  ...Object.entries(report.parkCauses).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
  '',
  '## Per god',
  ...Object.entries(report.byGod).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
  '',
  'The raw telemetry stays next to the lane; this directory is the durable, comparable run record.',
];
fs.writeFileSync(path.join(outDir, 'report.md'), md.join('\n') + '\n');
console.log(`bench-aime-report: ${outDir}`);
console.log(`rows=${report.rows} completed=${report.completed} parked=${report.parked} (${report.parkedShare}%) nullTokens=${report.nullTokenShare}%`);
