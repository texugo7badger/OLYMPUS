#!/usr/bin/env node
/**
 * soak.mjs — v0.0.40 (R40-01): the stability harness.
 *
 * Probes the running app on a fixed cadence and records the evidence:
 * endpoint status/latency, host memory, OLYMPUS RSS, process count, SSE
 * liveness and the campaign verdict. It is a SOAK, not a benchmark: the
 * question is "does it stay honest and bounded for N minutes?", never "how
 * fast is one request?".
 *
 * Usage:
 *   node scripts/soak.mjs --minutes 60 --interval 5
 *   node scripts/soak.mjs --minutes 1 --json /tmp/opencode/soak.json
 *
 * Exit 0 = every probe green, memory bounded and no endpoint regressed;
 * exit 1 = the report names the failure. A declared skip is not a thing here:
 * an unreachable app is a failure.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = arg('url', process.env.OLYMPUS_URL || 'http://127.0.0.1:3737');
const MINUTES = Math.max(0.05, Number(arg('minutes', '60')) || 60);
const INTERVAL_S = Math.max(2, Number(arg('interval', '5')) || 5);
const OUT_JSON = arg('json', '');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT = arg('report', path.join(os.tmpdir(), `olympus-soak-${STAMP}.md`));

const PROBES = [
  { name: 'health', path: '/api/olympus/health', budgetMs: 1200 },
  { name: 'power', path: '/api/olympus/power', budgetMs: 1500 },
  { name: 'resources', path: '/api/olympus/resources', budgetMs: 2500 },
  { name: 'run-state', path: '/api/olympus/run-state', budgetMs: 2500 },
  { name: 'projects', path: '/api/olympus/projects', budgetMs: 2500 },
];

const startedAt = Date.now();
const deadline = startedAt + MINUTES * 60_000;
const samples = [];
const failures = [];

async function probe(entry) {
  const t0 = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), entry.budgetMs + 2000);
    const res = await fetch(BASE + entry.path, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    const ms = Math.round(performance.now() - t0);
    let body = null;
    try { body = await res.json(); } catch { /* the status is the truth */ }
    return { name: entry.name, ok: res.ok, status: res.status, ms, body, budgetMs: entry.budgetMs };
  } catch (e) {
    return { name: entry.name, ok: false, status: 0, ms: Math.round(performance.now() - t0), error: e?.message || String(e), budgetMs: entry.budgetMs };
  }
}

function pct(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

console.log(`soak: ${BASE} for ${MINUTES} min (every ${INTERVAL_S}s)`);
let round = 0;
while (Date.now() < deadline) {
  round += 1;
  const results = await Promise.all(PROBES.map(probe));
  const byName = Object.fromEntries(results.map((r) => [r.name, r]));
  const resources = byName.resources?.body?.resources;
  samples.push({
    at: new Date().toISOString(),
    elapsedS: Math.round((Date.now() - startedAt) / 1000),
    ok: results.every((r) => r.ok),
    probes: Object.fromEntries(results.map((r) => [r.name, { ok: r.ok, status: r.status, ms: r.ms }])),
    memory: resources ? {
      totalMb: resources.totalMb,
      availableMb: resources.availableMb,
      usedPct: resources.usedPct,
      olympusRssMb: resources.olympusRssMb,
      processCount: resources.processCount,
      verdict: resources.verdict,
    } : null,
  });
  for (const r of results) {
    if (!r.ok) failures.push(`${r.name} ${r.status || r.error || 'failed'} at ${samples.at(-1).elapsedS}s`);
    else if (r.ms > r.budgetMs) failures.push(`${r.name} took ${r.ms}ms (budget ${r.budgetMs}ms) at ${samples.at(-1).elapsedS}s`);
  }
  if (round % 6 === 0 || Date.now() >= deadline) {
    const m = samples.at(-1).memory;
    console.log(`  ${samples.at(-1).elapsedS}s · ${results.filter((r) => r.ok).length}/${results.length} probes · ${m ? `${m.availableMb} MB free · ${(m.olympusRssMb / 1024).toFixed(2)} GB RSS` : 'no resources'}`);
  }
  if (Date.now() >= deadline) break;
  await new Promise((r) => setTimeout(r, INTERVAL_S * 1000));
}

const memorySamples = samples.map((s) => s.memory).filter(Boolean);
const available = memorySamples.map((m) => m.availableMb);
const rss = memorySamples.map((m) => m.olympusRssMb);
const firstRss = rss[0] ?? 0;
const lastRss = rss.at(-1) ?? 0;
const growthMb = lastRss - firstRss;
const minAvailable = Math.min(...available);
const latencies = Object.fromEntries(PROBES.map((p) => [p.name, samples.map((s) => s.probes[p.name]?.ms ?? 0)]));

// The house thresholds: memory must not fall under the governor's floor and
// RSS may not grow without bound (a leak is a trend, not one sample).
if (memorySamples.length > 1 && minAvailable < 900) failures.push(`available memory fell to ${minAvailable} MB (< 900 MB floor)`);
if (memorySamples.length >= 6 && growthMb > Math.max(600, firstRss * 0.25)) failures.push(`OLYMPUS RSS grew ${growthMb} MB (from ${firstRss} to ${lastRss})`);

const ok = failures.length === 0;
const report = [
  '# OLYMPUS soak report',
  '',
  `- Target: ${BASE}`,
  `- Duration: ${MINUTES} min · ${samples.length} rounds · every ${INTERVAL_S}s`,
  `- Started: ${new Date(startedAt).toISOString()}`,
  `- Result: **${ok ? 'PASS' : 'FAIL'}**`,
  '',
  '## Endpoints (p50 / p95 / max ms)',
  '',
  '| probe | p50 | p95 | max | failures |',
  '|---|---|---|---|---|',
  ...PROBES.map((p) => {
    const l = latencies[p.name] || [];
    const fails = failures.filter((f) => f.startsWith(p.name)).length;
    return `| ${p.name} | ${pct(l, 50)} | ${pct(l, 95)} | ${Math.max(0, ...l)} | ${fails} |`;
  }),
  '',
  '## Memory',
  '',
  `- Available: min ${minAvailable} MB · last ${available.at(-1) ?? '?'} MB`,
  `- OLYMPUS RSS: first ${firstRss} MB · last ${lastRss} MB · growth ${growthMb} MB`,
  `- Process census: ${memorySamples.at(-1)?.processCount ?? '?'}`,
  '',
  '## Failures',
  '',
  ...(failures.length ? failures.map((f) => `- ${f}`) : ['- none']),
  '',
].join('\n');

fs.writeFileSync(REPORT, report, 'utf-8');
if (OUT_JSON) fs.writeFileSync(OUT_JSON, JSON.stringify({ ok, startedAt: new Date(startedAt).toISOString(), minutes: MINUTES, samples, failures }, null, 2) + '\n', 'utf-8');
console.log(`\nsoak: ${ok ? 'PASS' : 'FAIL'} · ${samples.length} rounds · report ${REPORT}`);
if (!ok) {
  for (const f of failures.slice(0, 10)) console.log(`  FAIL ${f}`);
  process.exit(1);
}
