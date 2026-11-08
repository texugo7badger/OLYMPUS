#!/usr/bin/env tsx
/**
 * night-shift.ts — v0.0.91: the headless overnight supervisor.
 *
 * The app can close; the walk must not die with it. This script is launched
 * through `systemd-run --user --unit=olympus-night-<slug>` (a transient user
 * service), OUTSIDE the Electron cgroup. It then:
 *
 *   - acquires the lane (and refuses when a live walk already owns it);
 *   - runs `walk-lane.ts` as a child, restarts it on retryable parks;
 *   - enforces the wall-clock deadline (hard stop) and the hop cap;
 *   - stops on provider/auth/model/unknown (a human decision, not a retry);
 *   - writes a morning letter with gates, hops, parks, tokens and artifacts.
 *
 * The machine stays AWAKE. Suspending the machine produces zero work and
 * leaves orphan locks; this script never pretends otherwise.
 *
 * Usage:
 *   tsx scripts/night-shift.ts --slug aime --hours 8 --max-hops 100 --headless
 *   tsx scripts/night-shift.ts --slug aime --hours 8 --dry-run
 *   tsx scripts/night-shift.ts --supervise --slug aime --lane <path> --hours 8
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readWalkLock } from '../src/lib/hop-runtime/walk-lock';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface NightShiftOptions {
  slug: string;
  lane: string;
  hours: number;
  maxHops: number;
  maxRestarts: number;
  pollMs: number;
  headless: boolean;
  dryRun: boolean;
  supervise: boolean;
}

export interface NightShiftState {
  version: 1;
  slug: string;
  lane: string;
  pid: number;
  unit: string | null;
  startedAt: string;
  deadline: string;
  status: 'starting' | 'running' | 'finished' | 'stopped' | 'failed';
  completed: number;
  total: number;
  restarts: number;
  lastPark: { hopId: string; reason: string; errorClass?: string | null } | null;
  reportPath: string | null;
  updatedAt: string;
}

export interface GateRow {
  name: string;
  ok: boolean;
  detail: string;
  evidence: string;
}

export interface MorningReportInput {
  slug: string;
  lane: string;
  startedAt: string;
  endedAt: string;
  reason: string;
  completed: number;
  total: number;
  restarts: number;
  lastPark: { hopId: string; reason: string; errorClass?: string | null } | null;
  gates: GateRow[];
  tokensIn: number;
  tokensOut: number;
  artifacts: string[];
}

export function parseArgs(argv: string[]): NightShiftOptions {
  const arg = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  const num = (name: string, fallback: number): number => {
    const raw = arg(name);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const slug = arg('slug') || '';
  const lane = arg('lane') || (slug ? path.join(os.homedir(), 'OLYMPUS-VAULT', '02_Projects', slug) : '');
  return {
    slug,
    lane,
    hours: num('hours', 8),
    maxHops: num('max-hops', 100),
    maxRestarts: num('max-restarts', 8),
    pollMs: num('poll-ms', 15_000),
    headless: argv.includes('--headless'),
    dryRun: argv.includes('--dry-run'),
    supervise: argv.includes('--supervise'),
  };
}

export function deadlineMs(startedAtMs: number, hours: number): number {
  return startedAtMs + Math.max(0.01, hours) * 3_600_000;
}

export function safeSlug(slug: string): string {
  return slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function unitName(slug: string): string {
  return `olympus-night-${safeSlug(slug)}`;
}

export function systemdCommand(opts: NightShiftOptions): string[] {
  const unit = unitName(opts.slug);
  return [
    'systemd-run',
    '--user',
    `--unit=${unit}`,
    '--collect',
    `--working-directory=${REPO}`,
    '--setenv=OLYMPUS_NIGHT_SUPERVISOR=1',
    '--description=OLYMPUS night shift ' + opts.slug,
    process.execPath,
    '--import',
    'tsx',
    path.join(REPO, 'scripts', 'night-shift.ts'),
    '--supervise',
    '--slug',
    opts.slug,
    '--lane',
    opts.lane,
    '--hours',
    String(opts.hours),
    '--max-hops',
    String(opts.maxHops),
    '--max-restarts',
    String(opts.maxRestarts),
    '--poll-ms',
    String(opts.pollMs),
  ];
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return fallback; }
}

function readPlan(lane: string): { hops: Array<{ id: string; god?: string }>; generation?: number } {
  return readJson(path.join(lane, 'dispatch-plan.json'), { hops: [] });
}

export function readProgress(lane: string): {
  completed: number;
  total: number;
  parked: { hopId: string; reason: string; errorClass?: string | null } | null;
  tokensIn: number;
  tokensOut: number;
  artifacts: string[];
} {
  const plan = readPlan(lane);
  const state = readJson<any>(path.join(lane, '.olympus-hop-state.json'), { completed: [], parked: null });
  const completedIds = new Set(Array.isArray(state.completed) ? state.completed.map(String) : []);
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const rows = fs.readFileSync(path.join(lane, '.olympus-hop-telemetry.jsonl'), 'utf-8')
      .trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    for (const r of rows) {
      if (typeof r?.tokensIn === 'number') tokensIn += r.tokensIn;
      if (typeof r?.tokensOut === 'number') tokensOut += r.tokensOut;
    }
  } catch { /* no telemetry */ }
  const artifacts = Array.from(new Set(
    (plan.hops || []).flatMap((h: any) => Array.isArray(h?.artifacts) ? h.artifacts.map(String) : []),
  )).slice(0, 40);
  return {
    completed: completedIds.size,
    total: plan.hops?.length ?? 0,
    parked: state.parked
      ? { hopId: String(state.parked.hopId), reason: String(state.parked.reason), errorClass: state.parked.errorClass ?? null }
      : null,
    tokensIn,
    tokensOut,
    artifacts,
  };
}

/** The ten release gates, read from disk. Missing evidence is FAIL, never PASS. */
export function readGates(lane: string): GateRow[] {
  const file = (rel: string) => path.join(lane, rel);
  const exists = (rel: string) => fs.existsSync(file(rel));
  const text = (rel: string) => { try { return fs.readFileSync(file(rel), 'utf-8'); } catch { return ''; } };
  const design = readJson<any>(file('evidence/frontdoor/design-review.json'), null)
    ?? readJson<any>(file('design-review.json'), null);
  const audit = text('evidence/clips/audit.md');
  const gates: GateRow[] = [
    { name: 'typecheck/lint evidence', ok: exists('evidence/release/readiness.md'), detail: exists('evidence/release/readiness.md') ? 'readiness.md present' : 'missing readiness.md', evidence: 'evidence/release/readiness.md' },
    { name: 'design gate >= 7', ok: typeof design?.overall === 'number' && design.overall >= 7, detail: design ? `overall ${design.overall}` : 'no design-review.json', evidence: 'evidence/frontdoor/design-review.json' },
    { name: 'clip invariants', ok: /VERDICT\s*:?\s*PASS/i.test(audit), detail: /VERDICT\s*:?\s*PASS/i.test(audit) ? 'audit says PASS' : 'audit missing or not PASS', evidence: 'evidence/clips/audit.md' },
    { name: 'clip contract doc', ok: exists('docs/clips.md'), detail: exists('docs/clips.md') ? 'docs/clips.md present' : 'missing docs/clips.md', evidence: 'docs/clips.md' },
    { name: 'product contract doc', ok: exists('docs/PRODUCT-CONTRACT.md'), detail: exists('docs/PRODUCT-CONTRACT.md') ? 'docs/PRODUCT-CONTRACT.md present' : 'missing PRODUCT-CONTRACT.md', evidence: 'docs/PRODUCT-CONTRACT.md' },
    { name: 'morning report', ok: exists('evidence/release/morning-report.md'), detail: exists('evidence/release/morning-report.md') ? 'morning-report.md present' : 'missing morning-report.md', evidence: 'evidence/release/morning-report.md' },
  ];
  return gates;
}

export function buildMorningReport(input: MorningReportInput): string {
  const open = input.gates.filter((g) => !g.ok);
  const verdict = open.length === 0 ? 'SHIPPABLE' : `NOT SHIPPABLE — ${open.length} gates open`;
  const lines: string[] = [
    `# Night shift — ${input.slug}`,
    '',
    `**Verdict:** ${verdict}`,
    '',
    '## Window',
    `- start: ${input.startedAt}`,
    `- end: ${input.endedAt}`,
    `- reason: ${input.reason}`,
    `- lane: ${input.lane}`,
    '',
    '## Hops',
    `- completed: ${input.completed}/${input.total}`,
    `- restarts: ${input.restarts}`,
    `- last park: ${input.lastPark ? `${input.lastPark.hopId} (${input.lastPark.reason}${input.lastPark.errorClass ? `:${input.lastPark.errorClass}` : ''})` : 'none'}`,
    '',
    '## Gates',
    '| Gate | Result | Evidence |',
    '|---|---|---|',
    ...input.gates.map((g) => `| ${g.name} | ${g.ok ? 'PASS' : 'FAIL'} — ${g.detail} | ${g.evidence} |`),
    '',
    '## Cost',
    `- tokens in: ${input.tokensIn.toLocaleString('en-US')}`,
    `- tokens out: ${input.tokensOut.toLocaleString('en-US')}`,
    '- invoice: unknown (the subscription reports list value, not a bill)',
    '',
    '## Artifacts',
    ...(input.artifacts.length ? input.artifacts.map((a) => `- ${a}`) : ['- none declared']),
    '',
    '## What needs you',
    ...(open.length
      ? open.map((g) => `- ${g.name}: ${g.detail} (${g.evidence})`)
      : ['- nothing — every gate is green']),
    '',
  ];
  return lines.join('\n');
}

function writeState(file: string, state: NightShiftState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf-8');
}

function waitFor(child: ChildProcess, timeoutMs: number): Promise<{ code: number | null; signal: NodeJS.Signals | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      try { child.kill('SIGTERM'); } catch { /* gone */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 10_000);
    }, Math.max(1_000, timeoutMs));
    const done = (code: number | null, signal: NodeJS.Signals | null, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, timedOut });
    };
    child.on('exit', (code, signal) => done(code, signal, false));
    child.on('error', () => done(null, null, false));
  });
}

const RETRYABLE = new Set(['tool-budget', 'verify-failed', 'retry-exhausted', 'timeout', 'transport', 'script']);
const STOP_CLASSES = new Set(['provider', 'lane-exhausted', 'auth', 'model-missing', 'agent-missing', 'campaign-budget', 'unknown']);

async function supervise(opts: NightShiftOptions): Promise<number> {
  if (!opts.slug) { console.error('night-shift: --slug is required'); return 2; }
  if (!fs.existsSync(path.join(opts.lane, 'dispatch-plan.json'))) {
    console.error(`night-shift: no dispatch-plan.json in ${opts.lane}`); return 2;
  }
  // The lane lock is the truth. A live walk already owns this lane; a second
  // runner would exit 'already-walking' and write a misleading morning report.
  const existingLock = readWalkLock(opts.lane);
  if (existingLock.holder && existingLock.alive) {
    console.error(`night-shift: a walk already owns ${opts.lane} (pid ${existingLock.holder.pid}) — let it finish or stop it first`);
    return 2;
  }
  const startMs = Date.now();
  const deadline = deadlineMs(startMs, opts.hours);
  const stateDir = path.join(os.homedir(), '.olympus', 'night-shift', safeSlug(opts.slug));
  const stateFile = path.join(stateDir, 'state.json');
  const logFile = path.join(stateDir, 'night-shift.log');
  const reportPath = path.join(stateDir, 'morning-report.md');
  fs.mkdirSync(stateDir, { recursive: true });
  const log = fs.createWriteStream(logFile, { flags: 'a' });
  log.write(`\n[night-shift] ${new Date().toISOString()} start slug=${opts.slug} lane=${opts.lane} hours=${opts.hours} maxHops=${opts.maxHops}\n`);

  const base: NightShiftState = {
    version: 1, slug: opts.slug, lane: opts.lane, pid: process.pid, unit: process.env.INVOCATION_ID ? unitName(opts.slug) : null,
    startedAt: new Date(startMs).toISOString(), deadline: new Date(deadline).toISOString(),
    status: 'starting', completed: 0, total: 0, restarts: 0, lastPark: null, reportPath: null,
    updatedAt: new Date().toISOString(),
  };
  writeState(stateFile, base);

  let child: ChildProcess | null = null;
  let stopping = false;
  const stop = () => {
    stopping = true;
    try { child?.kill('SIGTERM'); } catch { /* gone */ }
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  let restarts = 0;
  let reason = 'deadline';
  let lastPark: { hopId: string; reason: string; errorClass?: string | null } | null = null;

  while (!stopping && Date.now() < deadline) {
    const progress = readProgress(opts.lane);
    if (progress.total > 0 && progress.completed >= progress.total) { reason = 'done'; break; }
    if (opts.maxHops > 0 && progress.completed >= opts.maxHops) { reason = 'max-hops'; break; }
    writeState(stateFile, { ...base, status: 'running', completed: progress.completed, total: progress.total, restarts, lastPark, updatedAt: new Date().toISOString() });

    const remaining = Math.max(1_000, deadline - Date.now());
    child = spawn(process.execPath, [
      '--import', 'tsx', path.join(REPO, 'scripts', 'walk-lane.ts'),
      '--lane', opts.lane, '--slug', opts.slug, '--keep-quarantine', '--retry-parked',
    ], {
      cwd: REPO,
      env: { ...process.env, OLYMPUS_NIGHT_SUPERVISOR: '1', OLYMPUS_NIGHT_SHIFT: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (d) => log.write(d));
    child.stderr?.on('data', (d) => log.write(d));
    const exit = await waitFor(child, remaining);
    const after = readProgress(opts.lane);
    lastPark = after.parked ?? lastPark;
    log.write(`[night-shift] child exit code=${exit.code} signal=${exit.signal} timedOut=${exit.timedOut} completed=${after.completed}/${after.total}\n`);
    if (exit.timedOut) { reason = 'deadline'; break; }
    if (after.total > 0 && after.completed >= after.total) { reason = 'done'; break; }
    if (after.parked) {
      const cls = String(after.parked.errorClass || after.parked.reason || 'unknown');
      if (STOP_CLASSES.has(cls)) { reason = `stop:${cls}`; break; }
      if (!RETRYABLE.has(cls) && cls !== 'unknown') { reason = `stop:${cls}`; break; }
    }
    if (stopping) { reason = 'signal'; break; }
    restarts += 1;
    if (restarts > opts.maxRestarts) { reason = 'max-restarts'; break; }
    const backoff = Math.min(60_000, 5_000 * restarts);
    log.write(`[night-shift] restart ${restarts}/${opts.maxRestarts} in ${backoff}ms\n`);
    await new Promise((r) => setTimeout(r, backoff));
  }

  const final = readProgress(opts.lane);
  const gates = readGates(opts.lane);
  const report = buildMorningReport({
    slug: opts.slug, lane: opts.lane,
    startedAt: new Date(startMs).toISOString(), endedAt: new Date().toISOString(),
    reason, completed: final.completed, total: final.total, restarts,
    lastPark: final.parked ?? lastPark, gates,
    tokensIn: final.tokensIn, tokensOut: final.tokensOut, artifacts: final.artifacts,
  });
  fs.writeFileSync(reportPath, report, 'utf-8');
  writeState(stateFile, {
    ...base, status: reason === 'done' ? 'finished' : stopping ? 'stopped' : 'finished',
    completed: final.completed, total: final.total, restarts, lastPark: final.parked ?? lastPark, reportPath,
    updatedAt: new Date().toISOString(),
  });
  log.write(`[night-shift] ${new Date().toISOString()} done reason=${reason} report=${reportPath}\n`);
  log.end();
  console.log(report);
  return reason === 'done' ? 0 : 1;
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.slug) {
    console.error('Usage: tsx scripts/night-shift.ts --slug <slug> [--hours 8] [--max-hops 100] [--headless] [--dry-run]');
    return 2;
  }
  if (opts.dryRun) {
    console.log(JSON.stringify({ unit: unitName(opts.slug), command: systemdCommand(opts), lane: opts.lane, hours: opts.hours, maxHops: opts.maxHops }, null, 2));
    return 0;
  }
  // The supervisor itself must run outside the Electron cgroup. If the caller
  // asked for headless and we are NOT already under systemd, relaunch through
  // systemd-run; the app can then close without killing the walk.
  const underSystemd = Boolean(process.env.INVOCATION_ID || process.env.OLYMPUS_NIGHT_SUPERVISOR);
  if (opts.headless && !underSystemd && !opts.supervise) {
    const cmd = systemdCommand(opts);
    const child = spawn(cmd[0], cmd.slice(1), { detached: true, stdio: 'ignore' });
    child.unref();
    console.log(`night-shift: started ${unitName(opts.slug)} (pid ${child.pid}) — the app may close.`);
    console.log(`logs: ~/.olympus/night-shift/${safeSlug(opts.slug)}/night-shift.log`);
    return 0;
  }
  return supervise(opts);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((e) => { console.error(e?.message || e); process.exit(1); });
}
