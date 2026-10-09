#!/usr/bin/env node
/**
 * smoke.mjs — MADRUGA-SMOKE-1's Batch A: THE OWED SMOKE (2026-10-09).
 *
 * FLUENCY-1's one unpaid exit gate, payable tonight: a real multi-hop build
 * through the hop runtime on FREE (free-nvidia-build, R4 UNCHANGED), the
 * Lumina SHAPE scaled down — a landing page + one interactive page:
 *
 *   0. THE INTAKE ROUTING PROOF (2nd-prompt class): fluency-smoke EXISTS and
 *      is ACTIVE (the FLUENCY-1 proof's own output, finding 7). A matching
 *      prompt must route `existing: fluency-smoke` — REUSED, not reset
 *      (the brief's preferred lane; disclosed in the CLOSE-OUT). 0 LLM.
 *   1. THE 2-HOP SMOKE on TWO DISTINCT POOLS (E8-verified lanes):
 *      hop-landing on apollo (nvidia-glm/z-ai/glm-5.3), hop-interactive on
 *      hephaestus (nvidia-kimi/moonshotai/kimi-k3). NO big writes on the
 *      flash lane (FLUENCY-1 finding 5: glacial under contention).
 *      The park->wait->resume doctrine: on a park, re-probe the lane and
 *      resume in-session when it recovers (bounded: up to 4 resumes).
 *      The per-hop ceiling rides R3's NEW knob (OLYMPUS_HOP_TIMEOUT_MS,
 *      disclosed value below) — the FLUENCY-1 resume died at the hard-coded
 *      ceiling SECONDS after the artifacts landed.
 *   2. ZERO-TERMINAL-DEATH ledger: every overload burst ABSORBED (the #107
 *      crescendo) or PARKED (the hop runtime) is LISTED — the events are
 *      the FEATURE working, not noise.
 *   3. THE PREVIEW TRIGGER (#105 doctrine): the frontend artifacts land ->
 *      npm install vite -> maybeStartDevServer -> probe-green + HTTP 200 +
 *      the URL, or the honest refusal — never a narrated "running".
 *      The lane server is STOPPED at the end (zero orphans; the manager is
 *      the host on the user's real flow).
 *   4. The per-hop telemetry table (tokensIn/out, lane, god, durationMs,
 *      retriesAbsorbed, status) — the free-first economy proof, verbatim
 *      from the lane's .olympus-hop-telemetry.jsonl.
 *
 * Evidence: stdout tee'd to reports/smoke-1/s3/smoke-transcript.txt.
 * NOTHING here touches the repo config; the lane lives in the real vault.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HOME = process.env.HOME;
const SLUG = 'fluency-smoke';
const LANE = path.join(HOME, 'OLYMPUS-VAULT', '02_Projects', SLUG);
// R3's knob, disclosed: a glacial-but-serving free lane earned the resume
// kill last night. 30 min per attempt; the park/wait/resume loop bounds the
// campaign, not the ceiling.
process.env.OLYMPUS_HOP_TIMEOUT_MS ||= '1800000';
const MAX_RESUMES = 4;

const log = (tag, v) =>
  console.log(`\n=== ${tag} ===\n` + (typeof v === 'string' ? v : JSON.stringify(v, null, 2)));

const { classifyFirstPrompt } = await import(OLYMPUS + '/src/lib/project-intent.ts');
const { listProjects } = await import(OLYMPUS + '/src/lib/project-context.ts');

// ── 0. THE INTAKE ROUTING PROOF (REUSE — never reset tonight) ───────────────
const before = listProjects().map((p) => p.slug);
const intent = classifyFirstPrompt('Add a testimonials section to the Fluency Smoke page', listProjects());
const laneNote = path.join(LANE, 'project.md');
log('INTAKE (second-prompt routing -> EXISTING, zero duplicates)', {
  intent, laneNoteExists: fs.existsSync(laneNote), projectsBefore: before,
  active: JSON.parse(fs.readFileSync(path.join(HOME, '.olympus', 'active-project.json'), 'utf-8')),
});
if (intent.kind === 'existing' && intent.slug === SLUG && fs.existsSync(laneNote)) {
  console.log('INTAKE ROUTED-EXISTING: OK');
} else {
  console.log('INTAKE ROUTED-EXISTING: FAIL');
  process.exitCode = 2;
}

// ── 1. The lane kit (the SPAWN-INVOCATION pattern; the project note stays) ──
fs.mkdirSync(LANE, { recursive: true });
for (const [from, to] of [[`${OLYMPUS}/.opencode`, `${LANE}/.opencode`], [`${OLYMPUS}/node_modules`, `${LANE}/node_modules`]]) {
  try { fs.rmSync(to, { force: true }); } catch {}
  try { fs.symlinkSync(from, to, 'dir'); } catch {}
}
fs.copyFileSync(`${OLYMPUS}/opencode.json`, `${LANE}/opencode.json`);
fs.copyFileSync(`${OLYMPUS}/opencode.demigods.json`, `${LANE}/opencode.demigods.json`);
log('LANE KIT', { lane: LANE, files: fs.readdirSync(LANE), hopTimeoutMs: process.env.OLYMPUS_HOP_TIMEOUT_MS });

// Fresh hop state per smoke run (the PLAN is new; a stale park from
// FLUENCY-1's night must not shadow tonight's plan). The project note +
// prior artifacts are NOT the state file — they stay.
for (const f of ['.olympus-hop-state.json', '.olympus-hop-telemetry.jsonl']) {
  try { fs.rmSync(path.join(LANE, f), { force: true }); } catch {}
}

// ── 2. THE 2-HOP SMOKE (two distinct pools, apollo + hephaestus) ─────────────
const plan = {
  version: 1,
  laneRoot: LANE,
  hops: [
    {
      id: 'hop-landing', god: 'apollo',
      prompt: 'Use the write tool to create two files in the current directory: (1) index.html — a single-file landing page for "Fluency Smoke", an artisanal bakery: a hero with the name and a tagline, a products section (three items with names and prices), a testimonials section (two short quotes), a nav link to menu.html, and a footer. Link styles.css and main.js (defer). (2) styles.css — a warm, appetizing palette (cream, amber, chocolate), system font stack, simple responsive layout, styled nav. No frameworks, no external assets. Then stop — the files ARE the deliverable.',
      artifacts: ['index.html', 'styles.css'], budgetTokens: 16384,
    },
    {
      id: 'hop-interactive', god: 'hephaestus',
      prompt: 'Use the write tool to create four files in the current directory (which already holds index.html + styles.css from the previous hop — read them first for coherence): (1) menu.html — an interactive menu page for the same bakery: category filter buttons (All / Breads / Pastries / Cakes) and a small grid of items with data-category attributes, a link back to index.html, linked to styles.css and main.js (defer). (2) main.js — the menu filter logic (clicking a filter button shows only matching items) plus smooth-scroll for in-page anchors. (3) package.json — { "name": "fluency-smoke", "private": true, "type": "module", "scripts": { "dev": "vite --host 127.0.0.1" }, "devDependencies": { "vite": "^5.0.0" } }. (4) vite.config.js — import { defineConfig } from "vite"; export default defineConfig({ server: { host: "127.0.0.1" } }). Do not install anything. Then stop — the files ARE the deliverable.',
      artifacts: ['menu.html', 'main.js', 'package.json', 'vite.config.js'], after: ['hop-landing'], budgetTokens: 16384,
    },
  ],
};
const { walkPlan } = await import(OLYMPUS + '/src/lib/hop-runtime/walker.ts');

const events = []; // the ZERO-TERMINAL-DEATH ledger (absorbed + parked)
let walk = null;
for (let attempt = 0; attempt <= MAX_RESUMES; attempt++) {
  console.log(`\n=== WALK ${attempt === 0 ? 'START' : `RESUME #${attempt}`} (${new Date().toISOString()}, live R4 lanes, FREE) ===`);
  walk = await walkPlan({ plan, resume: attempt > 0 });
  for (const r of walk.rows) {
    if (r.retriesAbsorbed > 0) events.push({ kind: 'absorbed', hop: r.hop, retries: r.retriesAbsorbed });
  }
  log(`WALK ${attempt === 0 ? 'RESULT' : `RESUME #${attempt} RESULT`}`, { completed: walk.completed, parked: walk.parked, rows: walk.rows });
  if (!walk.parked) break;
  events.push({ kind: 'parked', hop: walk.parked.hopId, reason: walk.parked.reason, error: walk.parked.error ?? null });
  if (attempt === MAX_RESUMES) break;
  // The doctrine: park, re-probe the lane, wait, resume — never force.
  // (The key is read into the child env, never printed.)
  console.log('parked — re-probing the lane before resume (60s cadence)...');
  const nvkey = (() => { try {
    const a = JSON.parse(fs.readFileSync(path.join(HOME, '.local', 'share', 'opencode', 'auth.json'), 'utf-8'));
    const v = a['nvidia'];
    return typeof v === 'string' ? v : (v?.key ?? '');
  } catch { return ''; } })();
  const probe = (() => { try {
    return execSync(
      `curl -s -o /dev/null -w "%{http_code}" --max-time 25 -H "Authorization: Bearer ${nvkey}" -H "Content-Type: application/json" -d '{"model":"z-ai/glm-5.3","messages":[{"role":"user","content":"ping"}],"max_tokens":1}' https://integrate.api.nvidia.com/v1/chat/completions`,
      { encoding: 'utf-8' },
    ).trim();
  } catch (e) { return `probe-failed:${String(e).slice(0, 80)}`; } })();
  log('RE-PROBE (glm-5.3)', { http: probe, at: new Date().toISOString() });
  await new Promise((r) => setTimeout(r, 60_000));
}

// ── 3. The per-hop telemetry table (the free-first economy proof) ────────────
const telemetryFile = path.join(LANE, '.olympus-hop-telemetry.jsonl');
const telemetryRows = fs.existsSync(telemetryFile)
  ? fs.readFileSync(telemetryFile, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const table = telemetryRows.map((r) =>
  `| ${r.hop} | ${r.god} | ${String(r.lane).includes('02_Projects') ? 'lane' : r.lane} | ${r.tokensIn ?? '-'} | ${r.tokensOut ?? '-'} | ${Math.round((r.durationMs ?? 0) / 1000)}s | ${r.retriesAbsorbed} | ${r.status} |`,
).join('\n');
log('PER-HOP TELEMETRY (markdown, verbatim from the lane JSONL)', `| hop | god | lane | tokIn | tokOut | dur | retries | status |\n|---|---|---|---|---|---|---|---|\n${table}`);
log('ZERO-TERMINAL-DEATH LEDGER (absorbed + parked events — the FEATURE working)', events.length ? events : 'none — the window held');

if (walk.parked) {
  console.log('\nSMOKE PARKED after the last resume — the disk carries the campaign; REPORTED, not claimed (#105).');
  process.exitCode = 4;
} else {
  console.log('\nWALK GREEN: all hops completed.');
}

// ── 4. THE PREVIEW TRIGGER (only when the frontend artifacts exist) ──────────
if (!walk.parked && fs.existsSync(path.join(LANE, 'package.json'))) {
  console.log('\n=== PREVIEW: npm install vite (harness step) ===');
  try {
    execSync('npm install --no-audit --no-fund --silent vite@5', { cwd: LANE, stdio: 'inherit', timeout: 420_000 });
    console.log('vite installed');
  } catch (e) { console.log('vite install failed:', e.message); process.exitCode = 3; }

  const { maybeStartDevServer } = await import(OLYMPUS + '/src/lib/dev-server-trigger.ts');
  const trigger = await maybeStartDevServer(SLUG, LANE);
  log('TRIGGER RESULT', trigger);
  if (trigger.triggered && trigger.status?.url) {
    try {
      const page = await fetch(trigger.status.url);
      const body = await page.text();
      console.log(`PREVIEW HTTP: ${page.status} — ${body.length} bytes — title match: ${/Fluency Smoke/i.test(body)}`);
      console.log(`PREVIEW URL: ${trigger.status.url}`);
    } catch (e) { console.log('PREVIEW FETCH FAILED:', e.message); process.exitCode = 3; }
  } else {
    console.log('PREVIEW NOT GREEN — the honest refusal above stands (#105)');
    process.exitCode = 3;
  }
  const mgr = await import(OLYMPUS + '/src/lib/dev-server-manager.ts');
  const stop = await mgr.stop(SLUG);
  log('STOP (zero orphans — the manager is the host on the real flow)', stop);
} else {
  console.log('\nPREVIEW SKIPPED — no completed frontend artifacts (the park stands, disclosed).');
}

console.log('\n=== SMOKE DONE ===');
