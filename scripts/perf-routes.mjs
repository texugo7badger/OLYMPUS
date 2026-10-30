#!/usr/bin/env node
/**
 * perf-routes.mjs — THE PANE-LATENCY HARNESS (v0.0.25).
 *
 * Boots the PRODUCTION standalone server (the one `olympus start` serves),
 * measures every pane-facing endpoint a few times, and fails when a p95
 * exceeds the budget. This is the regression gate for the "everything takes
 * too long" class — data, not vibes.
 *
 * Usage:
 *   npm run perf:routes                    # default budget 300ms
 *   PERF_BUDGET_MS=500 npm run perf:routes # looser
 *   npm run perf:routes -- --json
 *
 * The first request to a route pays Next's lazy module load; the harness
 * warms each endpoint once and measures the following runs (warm p95 is what
 * the user feels after the first click).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone', 'server.js');
const BUDGET_MS = Number(process.env.PERF_BUDGET_MS || 300);
const RUNS = Number(process.env.PERF_RUNS || 5);
const JSON_OUT = process.argv.includes('--json');

const ENDPOINTS = [
  ['/api/olympus/build-info', 'status bar / boot'],
  ['/api/olympus/mcp/list', 'MCP panel (registry)'],
  ['/api/olympus/mcp/state', 'MCP panel (toggles)'],
  ['/api/olympus/brain-stats?brief=true', 'dashboard (brief)'],
  ['/api/olympus/brain-stats', 'dashboard / god detail'],
  ['/api/olympus/god/references?god=athena', 'god detail (refs)'],
  ['/api/olympus/arsenal-recon?god=athena', 'god detail (resonance)'],
  ['/api/olympus/episodes?limit=60', 'activity feed'],
  ['/api/olympus/costs', 'status bar (costs)'],
  ['/api/olympus/craft-apps', 'craft apps'],
  ['/api/olympus/sync-map?limit=50', 'sync map'],
  ['/api/olympus/models', 'strategy builder'],
];

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function waitReady(port, child, deadlineMs = 90_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}) before ready`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/olympus/build-info`, { signal: AbortSignal.timeout(2_000) });
      if (r.status > 0) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('server did not become ready in 90s');
}

function pct(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, idx)]);
}

async function timed(url) {
  const t0 = performance.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = await res.text();
  return { ms: performance.now() - t0, status: res.status, bytes: body.length };
}

if (!fs.existsSync(STANDALONE)) {
  console.error('perf-routes: no standalone build — run `next build` (or npm run build:app) first.');
  process.exit(1);
}

const port = await freePort();
const child = spawn(process.execPath, [STANDALONE], {
  cwd: path.dirname(STANDALONE),
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1', OLYMPUS_ROOT: ROOT },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (d) => { stderr += String(d).slice(-4000); });

const rows = [];
let failures = 0;
try {
  await waitReady(port, child);
  const base = `http://127.0.0.1:${port}`;

  for (const [ep, label] of ENDPOINTS) {
    const url = `${base}${ep}`;
    try {
      const warm = await timed(url); // lazy module load + cold cache
      const samples = [];
      let lastStatus = warm.status;
      let bytes = warm.bytes;
      for (let i = 0; i < RUNS; i++) {
        const r = await timed(url);
        samples.push(r.ms);
        lastStatus = r.status;
        bytes = r.bytes;
      }
      const p50 = pct(samples, 50);
      const p95 = pct(samples, 95);
      const over = p95 > BUDGET_MS;
      if (over || lastStatus >= 500) failures++;
      rows.push({ endpoint: ep, label, status: lastStatus, bytes, warmMs: Math.round(warm.ms), p50, p95, budget: BUDGET_MS, over });
    } catch (e) {
      failures++;
      rows.push({ endpoint: ep, label, error: e?.message || String(e), over: true });
    }
  }
} finally {
  try { child.kill('SIGKILL'); } catch { /* gone */ }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), budgetMs: BUDGET_MS, runs: RUNS, rows }, null, 2));
} else {
  console.log(`perf-routes — budget ${BUDGET_MS}ms (warm p95), ${RUNS} runs each\n`);
  console.log('  p50   p95   warm  status  endpoint');
  for (const r of rows) {
    if (r.error) { console.log(`  ERR   ERR     -     -      ${r.endpoint} — ${r.error}`); continue; }
    const flag = r.over ? '  ⚠' : '';
    console.log(`  ${String(r.p50).padStart(3)}ms ${String(r.p95).padStart(3)}ms ${String(r.warmMs).padStart(5)}ms  ${String(r.status).padStart(3)}    ${r.endpoint}${flag}`);
  }
}

if (failures > 0) {
  console.error(`\nperf-routes: ${failures} endpoint(s) over budget or failing.${stderr ? `\nserver stderr tail:\n${stderr.slice(-800)}` : ''}`);
  process.exit(1);
}
console.log('\nperf-routes: every pane endpoint is within budget.');
