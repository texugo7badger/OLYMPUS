#!/usr/bin/env node
/**
 * gods-check.mjs — v0.0.31 (R31-15).
 *
 * The maintainer asked: "confirm all gods are functional". This is the
 * deterministic half (0 tokens, every run): every god has an agent entry, a
 * mode, a model that resolves in the live catalog, a non-empty prompt file,
 * demigods on disk, a mastered-skills profile and an instinct directory.
 *
 * The optional live half (`--live`) runs one tiny turn per god on its lane
 * and records latency + tokens. It spends real tokens — opt-in only.
 *
 * Usage:
 *   npm run gods:check
 *   npm run gods:check -- --json
 *   npm run gods:check -- --live
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = process.env.OLYMPUS_VAULT || path.join(homedir(), 'OLYMPUS-VAULT');
const CACHE = process.env.XDG_CACHE_HOME
  ? path.join(process.env.XDG_CACHE_HOME, 'opencode', 'models.json')
  : path.join(homedir(), '.cache', 'opencode', 'models.json');

const GODS = ['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus'];
const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const live = args.has('--live');

function readJson(file, fallback = null) {
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return fallback; }
}

function promptPath(agent) {
  const p = String(agent?.prompt || '');
  const m = p.match(/^\{file:(.+)\}$/);
  return m ? path.join(ROOT, m[1]) : null;
}

function modelWindow(catalog, lane) {
  const [providerID, ...rest] = String(lane || '').split('/');
  const modelID = rest.join('/');
  const models = catalog?.[providerID]?.models || {};
  const m = models[modelID];
  const ctx = Number(m?.limit?.context ?? m?.context);
  return Number.isFinite(ctx) && ctx > 0 ? ctx : null;
}

function countFiles(dir, ext) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(ext)).length;
  } catch { return 0; }
}

const cfg = readJson(path.join(ROOT, 'opencode.json'), {});
const catalog = readJson(CACHE, {});
const rows = [];
let failures = 0;

for (const god of GODS) {
  const agent = cfg?.agent?.[god];
  const issues = [];
  if (!agent) issues.push('agent entry missing');
  const mode = agent?.mode || null;
  const lane = agent?.model || null;
  const ctx = modelWindow(catalog, lane);
  if (!lane) issues.push('model lane missing');
  else if (!ctx) issues.push(`model ${lane} not in the catalog`);
  const pp = promptPath(agent);
  if (!pp) issues.push('prompt is not a file ref');
  else if (!existsSync(pp)) issues.push(`prompt file missing: ${pp}`);
  else if (statSync(pp).size < 200) issues.push('prompt file is suspiciously small');
  const demigods = countFiles(path.join(ROOT, '.opencode', 'prompts', 'agents', 'demigods', god), '.txt');
  if (demigods === 0) issues.push('no demigod prompts on disk');
  const skills = existsSync(path.join(ROOT, '.opencode', 'vault-brain', 'mastered-skills', `${god}.md`));
  if (!skills) issues.push('mastered-skills profile missing');
  const instincts = existsSync(path.join(VAULT, '05_Auto_Learning', 'instincts', god));
  if (!instincts) issues.push('instinct directory missing');
  if (issues.length) failures++;
  rows.push({ god, mode, lane, context: ctx, prompt: pp ? 'ok' : 'missing', demigods, skills, instincts, issues });
}

const totalDemigods = rows.reduce((n, r) => n + r.demigods, 0);

if (asJson) {
  console.log(JSON.stringify({ ok: failures === 0, totalDemigods, rows }, null, 2));
} else {
  console.log(`gods:check — ${GODS.length} gods, ${totalDemigods} demigods, catalog ${existsSync(CACHE) ? 'present' : 'MISSING'}\n`);
  for (const r of rows) {
    const ctx = r.context ? `${Math.round(r.context / 1000)}k` : '—';
    console.log(
      `${r.issues.length ? 'FAIL' : 'PASS'}  ${r.god.padEnd(12)} ` +
      `${String(r.mode || '-').padEnd(9)} ${String(r.lane || '-').padEnd(34)} ` +
      `ctx ${String(ctx).padEnd(5)} demigods ${String(r.demigods).padEnd(3)} ` +
      `skills ${r.skills ? 'Y' : 'N'} instincts ${r.instincts ? 'Y' : 'N'}` +
      (r.issues.length ? `\n      ${r.issues.join('\n      ')}` : ''),
    );
  }
  console.log(`\n${failures === 0 ? 'gods:check GREEN' : `gods:check FAILED (${failures} god(s))`}`);
}

if (live) {
  console.log('\nlive ping — one tiny turn per god (real tokens, opt-in)\n');
  const bin = path.join(ROOT, 'node_modules', '.bin', 'opencode');
  for (const r of rows) {
    if (!r.lane) continue;
    const started = Date.now();
    const res = spawnSync(bin, ['run', '--standalone', '--agent', r.god, '--model', r.lane, '--format', 'json', 'Reply with exactly: OK'], {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 120_000,
      env: { ...process.env, OPENCODE_DISABLE_AUTOUPDATE: '1' },
    });
    const ms = Date.now() - started;
    let tokensIn = 0, tokensOut = 0, text = '';
    for (const line of String(res.stdout || '').split('\n')) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev?.type === 'text' && typeof ev.text === 'string') text += ev.text;
        if (ev?.tokens) { tokensIn += Number(ev.tokens.input) || 0; tokensOut += Number(ev.tokens.output) || 0; }
        if (ev?.type === 'step-finish' && ev?.tokens) { tokensIn += Number(ev.tokens.input) || 0; tokensOut += Number(ev.tokens.output) || 0; }
      } catch { /* not JSON */ }
    }
    const ok = res.status === 0 && /OK/i.test(text);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.god.padEnd(12)} ${String(ms + 'ms').padEnd(9)} in ${tokensIn} / out ${tokensOut}${ok ? '' : `  — exit ${res.status} ${String(res.stderr || '').slice(-160)}`}`);
  }
}

process.exit(failures === 0 ? 0 : 1);
