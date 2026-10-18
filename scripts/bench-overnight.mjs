#!/usr/bin/env node
/**
 * bench-overnight.mjs — THE OVERNIGHT QUEUE (the 2026-10-18 directive:
 * "vou deixar a madrugada inteira rodando o build que tu planejar").
 *
 * The night's orchestrator: a SEQUENTIAL queue of full-campaign benches
 * driven through the REAL machinery (selftest-campaign.mjs → /api/olympus/
 * action → the walker → the exit gate). Sequential by design: parallel
 * campaigns would thrash the pools and lie about per-campaign costs.
 *
 *   Q0  WAIT for the in-flight ORBITAL resume (poll the hop-state; the
 *       walk was already running when the night began) — its verdict row
 *       records the resume-path proof.
 *   Q1..Q6  AURORA (the misroute specimen re-run from zero) + five DIVERSE
 *       projects (magazine / dashboard / store / docs / portfolio) — each:
 *       clean lane → selftest driver → exit gate → report row.
 *
 * Every campaign gets a wall-clock budget (default 90min). A timeout parks
 * the row as RESUMABLE (the hop-state carries the campaign — a 'continue'
 * finishes it later); a crash of one campaign NEVER kills the queue.
 * The morning ledger: reports/bench-overnight/REPORT.md.
 *
 * Usage: node scripts/bench-overnight.mjs [--budget-min 90] [--port 3737]
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const BUDGET_MIN = Number(arg('budget-min', '90'));
const PORT = Number(arg('port', '3737'));

const ROOT = process.cwd();
const VAULT = join(homedir(), 'OLYMPUS-VAULT');
const OUT = join(ROOT, 'reports', 'bench-overnight');
const ORBITAL_LANE = join(VAULT, '02_Projects', 'orbital-real-time-mission-control-web');
const DRIVER = join(ROOT, 'scripts', 'selftest-campaign.mjs');
const PROMPTS = join(OUT, 'prompts');

const CAMPAIGNS = [
  { slug: 'aurora-focus', prompt: join(ROOT, 'reports', 'bench-2', 'aurora-focus-prompt.md'), label: 'AURORA FOCUS (the misroute specimen, from zero)' },
  { slug: 'eclipse-magazine', prompt: join(PROMPTS, 'magazine.md'), label: 'ECLIPSE MAGAZINE (editorial typography)' },
  { slug: 'pulse-ops', prompt: join(PROMPTS, 'dashboard.md'), label: 'PULSE OPS (data dashboard + Prisma)' },
  { slug: 'grao-e-fluxo', prompt: join(PROMPTS, 'store.md'), label: 'GRAO & FLUXO (e-commerce cart state)' },
  { slug: 'lattice-docs', prompt: join(PROMPTS, 'docs.md'), label: 'LATTICE (docs site + search)' },
  { slug: 'nova-studio', prompt: join(PROMPTS, 'portfolio.md'), label: 'NOVA STUDIO (the award-tier bar)' },
];

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const rows = [];

function readHopState(lane) {
  try {
    return JSON.parse(readFileSync(join(lane, '.olympus-hop-state.json'), 'utf-8'));
  } catch { return null; }
}

function readTelemetry(lane) {
  try {
    const raw = readFileSync(join(lane, '.olympus-hop-telemetry.jsonl'), 'utf-8');
    let tin = 0, tout = 0, hops = 0;
    for (const l of raw.trim().split('\n').filter(Boolean)) {
      try {
        const r = JSON.parse(l);
        if (r.status === 'completed') { hops++; tin += r.tokensIn || 0; tout += r.tokensOut || 0; }
      } catch {}
    }
    return { hops, tokensIn: tin, tokensOut: tout };
  } catch { return { hops: 0, tokensIn: 0, tokensOut: 0 }; }
}

async function waitForOrbital() {
  log('Q0: waiting for the in-flight ORBITAL resume…');
  const started = Date.now();
  while (Date.now() - started < BUDGET_MIN * 60_000) {
    const st = readHopState(ORBITAL_LANE);
    if (!st) break;
    const plan = existsSync(join(ORBITAL_LANE, 'dispatch-plan.json'))
      ? JSON.parse(readFileSync(join(ORBITAL_LANE, 'dispatch-plan.json'), 'utf-8'))
      : { hops: [] };
    const total = (plan.hops || []).length;
    const done = (st.completed || []).length;
    if (st.parked) {
      rows.push({ name: 'ORBITAL (resume)', verdict: `PARKED @ ${done}/${total} — ${st.parked.reason}`, tel: readTelemetry(ORBITAL_LANE) });
      return;
    }
    if (done >= total && total > 0) {
      // The full walk — verify the build too.
      const build = spawnSync('npm', ['run', 'build'], { cwd: ORBITAL_LANE, encoding: 'utf-8', timeout: 15 * 60_000 });
      rows.push({ name: 'ORBITAL (resume)', verdict: `COMPLETED ${done}/${total} · build ${build.status === 0 ? 'GREEN' : 'RED'}`, tel: readTelemetry(ORBITAL_LANE) });
      return;
    }
    await new Promise(r => setTimeout(r, 60_000));
  }
  const st = readHopState(ORBITAL_LANE) || { completed: [] };
  rows.push({ name: 'ORBITAL (resume)', verdict: `BUDGET-OUT @ ${st.completed.length}/13 — resumable`, tel: readTelemetry(ORBITAL_LANE) });
}

async function runCampaign(c) {
  const logFile = join(OUT, `log-${c.slug}.txt`);
  log(`campaign ${c.label}: START (budget ${BUDGET_MIN}min)`);
  const started = Date.now();
  const child = spawn('node', [DRIVER, '--slug', c.slug, '--port', String(PORT), '--prompt-file', c.prompt], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let tail = '';
  child.stdout.on('data', (d) => { const s = d.toString(); tail = (tail + s).slice(-4000); appendFileSync(logFile, s); });
  child.stderr.on('data', (d) => appendFileSync(logFile, d.toString()));
  const verdict = await new Promise((resolve) => {
    const killer = setTimeout(() => { child.kill('SIGKILL'); resolve('BUDGET-OUT — resumable'); }, BUDGET_MIN * 60_000);
    child.on('exit', (code) => { clearTimeout(killer); resolve(code === 0 ? 'EXIT 0 — the operator\'s bar met' : `EXIT ${code}`); });
  });
  // Enrich from the lane's own telemetry (the real lane: the pointer or the slug hint).
  let lane = join(VAULT, '02_Projects', c.slug);
  try {
    const active = JSON.parse(readFileSync(join(homedir(), '.olympus', 'active-project.json'), 'utf-8'));
    if (active?.lane && existsSync(join(active.lane, '.olympus-hop-telemetry.jsonl'))) lane = active.lane;
  } catch {}
  const st = readHopState(lane);
  const tel = readTelemetry(lane);
  const durMin = Math.round((Date.now() - started) / 60_000);
  rows.push({
    name: c.label,
    lane,
    verdict: st?.parked ? `${verdict} · PARKED (${st.parked.reason}) @ ${(st.completed || []).length}` : verdict,
    hops: st ? `${(st.completed || []).length} completed` : 'no hop-state',
    tokens: tel.tokensIn || tel.tokensOut ? `${(tel.tokensIn / 1000).toFixed(0)}k in / ${(tel.tokensOut / 1000).toFixed(0)}k out` : '—',
    duration: `${durMin}min`,
  });
  log(`campaign ${c.slug}: DONE — ${verdict}`);
}

function writeReport() {
  const lines = [
    '# The Overnight Bench — 2026-10-18',
    '',
    `Runner: bench-overnight.mjs · budget ${BUDGET_MIN}min/campaign · sequential · the REAL machinery (walker + exit gate + HITL).`,
    `Strategy: go-balanced (the GO-plan economy night).`,
    '',
    '| # | Campaign | Verdict | Hops | Tokens | Duration |',
    '|---|---|---|---|---|---|',
  ];
  rows.forEach((r, i) => {
    lines.push(`| ${i} | ${r.name} | ${r.verdict} | ${r.hops || '—'} | ${r.tokens || '—'} | ${r.duration || '—'} |`);
  });
  lines.push('', 'Per-campaign logs: `log-<slug>.txt`. Issues found become GitHub issues with the specimen attached.', '');
  writeFileSync(join(OUT, 'REPORT.md'), lines.join('\n'));
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  log(`the overnight queue: ${CAMPAIGNS.length} campaigns after the ORBITAL wait`);
  await waitForOrbital();
  for (const c of CAMPAIGNS) {
    await runCampaign(c);
    writeReport();
  }
  writeReport();
  log('THE NIGHT IS COMPLETE — REPORT.md written');
})();
