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
// --start-at N: skip the first N campaigns (a restart after a runner patch —
// the in-flight campaign's driver survives as an orphan + finishes solo).
const START_AT = Number(arg('start-at', '0'));

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
      // The walk is done — the misrouted AURORA driver may still be running
      // ITS verify (two npm builds on one lane collide). Wait for any live
      // selftest driver to exit first (10min patience), then verify.
      // A RESTARTED runner (--start-at) must wait for the ORPHAN campaign's
      // driver to finish before starting the next — two concurrent walks
      // on one app server is exactly the pileup the queue exists to avoid.
      const drvPatienceMs = (START_AT > 0 ? BUDGET_MIN : 10) * 60_000;
      const drvStart = Date.now();
      while (Date.now() - drvStart < drvPatienceMs) {
        const pg = spawnSync('pgrep', ['-f', 'selftest-campaign'], { encoding: 'utf-8' });
        if ((pg.stdout || '').trim() === '') break;
        log('Q0: an in-flight driver is still walking — waiting it out…');
        await new Promise(r => setTimeout(r, 30_000));
      }
      const build = spawnSync('npm', ['run', 'build'], { cwd: ORBITAL_LANE, encoding: 'utf-8', timeout: 15 * 60_000 });
      rows.push({ name: 'ORBITAL (resume)', verdict: `COMPLETED ${done}/${total} · build ${build.status === 0 ? 'GREEN' : 'RED'}`, tel: readTelemetry(ORBITAL_LANE) });
      return;
    }
    await new Promise(r => setTimeout(r, 60_000));
  }
  const st = readHopState(ORBITAL_LANE) || { completed: [] };
  rows.push({ name: 'ORBITAL (resume)', verdict: `BUDGET-OUT @ ${st.completed.length}/13 — resumable`, tel: readTelemetry(ORBITAL_LANE) });
}

/**
 * #144 CONTAINMENT (the misroute cure, runner-side): the intent matcher's
 * PATH branch wins over every naming/matching heuristic — a QUOTED lane
 * path routes there, never creates elsewhere. The runner pre-creates the
 * campaign's lane + the project note, then appends the quoted path to the
 * prompt: every campaign lands in ITS OWN lane, zero contamination of the
 * previous ones.
 */
function pinCampaignLane(c) {
  const lane = join(VAULT, '02_Projects', c.slug);
  const note = join(lane, 'project.md');
  if (!existsSync(note)) {
    mkdirSync(lane, { recursive: true });
    const iso = new Date().toISOString();
    writeFileSync(note, [
      '---',
      `slug: ${c.slug}`,
      `name: ${c.slug}`,
      `path: ${lane}`,
      `created: ${iso}`,
      `last_active: ${iso}`,
      `description: ${c.label}`,
      '---',
      '',
      `# ${c.label}`,
      '',
      'The overnight bench lane (pre-created by the runner so the intent '
      + 'matcher routes THIS campaign here — the quoted-path branch).',
      '',
    ].join('\n'));
  }
  const pinned = join(OUT, `prompt-${c.slug}-pinned.txt`);
  const base = readFileSync(c.prompt, 'utf-8');
  writeFileSync(pinned, base + `\n\nProject lane: "${lane}"\n(The quoted path above is THIS project's lane — route here.)\n`);
  return pinned;
}

async function runCampaign(c) {
  const logFile = join(OUT, `log-${c.slug}.txt`);
  const promptFile = pinCampaignLane(c);
  log(`campaign ${c.label}: START (budget ${BUDGET_MIN}min · lane pinned)`);
  const started = Date.now();
  const child = spawn('node', [DRIVER, '--slug', c.slug, '--port', String(PORT), '--prompt-file', promptFile, '--no-clean'], {
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
  // A restarted runner (--start-at) folds the orphan campaign's row from
  // its driver log + the lane's own telemetry before continuing.
  if (START_AT > 0) {
    const orphan = CAMPAIGNS[START_AT - 1];
    if (orphan) {
      const logFile = join(OUT, `log-${orphan.slug}.txt`);
      if (existsSync(logFile)) {
        const last = readFileSync(logFile, 'utf-8').trim().split('\n').pop() || '';
        rows.push({ name: `${orphan.label} (orphan driver — pre-patch run)`, verdict: last.slice(0, 120) || 'see log', hops: '—', tokens: '—', duration: '—' });
      }
    }
  }
  for (const c of CAMPAIGNS.slice(START_AT)) {
    await runCampaign(c);
    writeReport();
  }
  writeReport();
  log('THE NIGHT IS COMPLETE — REPORT.md written');
})();
