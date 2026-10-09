#!/usr/bin/env node
/**
 * smoke.mjs — MADRUGA-FLUENCY-1's live exit gate (2026-10-09).
 *
 * A real from-scratch small build through the NEW machinery on FREE
 * (free-nvidia-build, R4 untouched):
 *   1. THE INTAKE AUTONOMY PROOF — no project selected; the prompt creates
 *      'Fluency Smoke' in 02_Projects (name + description + stacks), then a
 *      SECOND matching prompt routes to the EXISTING project (no duplicate).
 *   2. THE HOP SMOKE — a 2-hop DAG on TWO DISTINCT pools (athena/flash +
 *      hephaestus/kimi), dispatched through spawnHopDispatcher on the LIVE
 *      R4 lanes, verified deterministic-first, telemetry per hop.
 *   3. THE PREVIEW PROOF — npm install vite + the deterministic trigger ->
 *      probe-green status -> HTTP 200 from the preview URL.
 *
 * Evidence: stdout + reports/fluency-1/s5/*.txt. NOTHING here touches the
 * repo config; the lane lives in the real vault (the feature's own output,
 * disclosed in the CLOSE-OUT).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HOME = process.env.HOME;
const SLUG = 'fluency-smoke';
const LANE = path.join(HOME, 'OLYMPUS-VAULT', '02_Projects', SLUG);
const PROMPT = 'Build a "Fluency Smoke" landing page for a bakery with an interactive menu';

const log = (tag, v) => console.log(`\n=== ${tag} ===\n` + (typeof v === 'string' ? v : JSON.stringify(v, null, 2)));

const { resolveAndRegisterIntent, classifyFirstPrompt } = await import(OLYMPUS + '/src/lib/project-intent.ts');
const { listProjects } = await import(OLYMPUS + '/src/lib/project-context.ts');

// ── 1. THE INTAKE AUTONOMY PROOF ─────────────────────────────────────────────
fs.rmSync(LANE, { recursive: true, force: true }); // fresh lane per smoke run (before intake)
const before = listProjects().map((p) => p.slug);
const intent1 = await resolveAndRegisterIntent(PROMPT, ['html', 'css', 'javascript']);
log('INTAKE-1 (new project, no folder selected)', intent1);

const notePath = path.join(LANE, 'project.md');
const noteExists = fs.existsSync(notePath);
const noteText = noteExists ? fs.readFileSync(notePath, 'utf-8') : '';
log('INTAKE-1 note', { notePath, noteExists, frontmatter: noteText.slice(0, 400).split('---')[1] || noteText.slice(0, 200) });

const intent2 = classifyFirstPrompt('Add a contact section to the Fluency Smoke page', listProjects());
const after = listProjects().map((p) => p.slug);
log('INTAKE-2 (second prompt -> existing, no duplicate)', { intent2, projectsBefore: before, projectsAfter: after, noDuplicate: after.length === before.length });
if (intent2.kind === 'existing' && intent2.slug === SLUG) { console.log('INTAKE-2 ROUTED-EXISTING: OK'); } else { console.log('INTAKE-2 ROUTED-EXISTING: FAIL'); process.exitCode = 2; }
if (intent1.kind === 'new' && intent1.slug === SLUG && noteExists) { console.log('INTAKE-1 CREATED: OK'); } else { console.log('INTAKE-1 CREATED: FAIL'); process.exitCode = 2; }

// ── 2. Bootstrap the lane kit (the SPAWN-INVOCATION pattern) ────────────────
fs.mkdirSync(LANE, { recursive: true });
const kit = [
  [`${OLYMPUS}/.opencode`, `${LANE}/.opencode`],
  [`${OLYMPUS}/node_modules`, `${LANE}/node_modules`],
];
for (const [from, to] of kit) { try { fs.rmSync(to, { force: true }); } catch {} try { fs.symlinkSync(from, to, 'dir'); } catch {} }
fs.copyFileSync(`${OLYMPUS}/opencode.json`, `${LANE}/opencode.json`);
fs.copyFileSync(`${OLYMPUS}/opencode.demigods.json`, `${LANE}/opencode.demigods.json`);
log('LANE KIT', { lane: LANE, files: fs.readdirSync(LANE) });

// ── 3. THE HOP SMOKE (2 hops, 2 distinct pools) ──────────────────────────────
const plan = {
  version: 1,
  laneRoot: LANE,
  hops: [
    {
      id: 'hop-landing', god: 'apollo',
      prompt: 'Use the write tool to create two files in the current directory: (1) index.html — a single-file static landing page for "Fluency Smoke", an artisanal bakery: hero with the name and a tagline, a products section (three items with names and prices), a footer. Link styles.css and main.js (defer). (2) styles.css — a warm, appetizing palette (cream, amber, chocolate), system font stack, simple responsive layout. Do not use any framework or external assets. Then stop — the files ARE the deliverable.',
      artifacts: ['index.html', 'styles.css'], budgetTokens: 16384,
    },
    {
      id: 'hop-interactive', god: 'hephaestus',
      prompt: 'Use the write tool to create three files in the current directory: (1) main.js — an interactive menu toggle: find a ".menu-toggle" button and toggle an "open" class on ".products" when clicked; also smooth-scroll nav links to sections. (2) package.json — { "name": "fluency-smoke", "private": true, "type": "module", "scripts": { "dev": "vite --host 127.0.0.1" }, "devDependencies": { "vite": "^5.0.0" } }. (3) vite.config.js — import { defineConfig } from "vite"; export default defineConfig({ server: { host: "127.0.0.1" } }). Do not install anything. Then stop — the files ARE the deliverable.',
      artifacts: ['main.js', 'package.json', 'vite.config.js'], after: ['hop-landing'], budgetTokens: 16384,
    },
  ],
};
const { walkPlan } = await import(OLYMPUS + '/src/lib/hop-runtime/walker.ts');
console.log('\n=== WALK START (live R4 lanes, FREE) ===');
const walk = await walkPlan({ plan });
log('WALK RESULT', { completed: walk.completed, parked: walk.parked, rows: walk.rows });

// per-hop token table (the economy study)
const table = walk.rows.map((r) => `| ${r.hop} | ${r.god} | ${r.lane.includes('02_Projects') ? 'lane' : r.lane} | ${r.tokensIn ?? '-'} | ${r.tokensOut ?? '-'} | ${Math.round(r.durationMs / 1000)}s | ${r.retriesAbsorbed} | ${r.status} |`).join('\n');
log('PER-HOP TELEMETRY (markdown)', `| hop | god | lane | tokIn | tokOut | dur | retries | status |\n|---|---|---|---|---|---|---|---|\n${table}`);

if (walk.parked) {
  console.log('\n=== PARKED — RUNNING THE RESUME PROOF ===');
  const resume = await walkPlan({ plan, resume: true });
  log('RESUME RESULT', { completed: resume.completed, parked: resume.parked });
}

// ── 4. THE PREVIEW PROOF ─────────────────────────────────────────────────────
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
  } catch (e) { console.log('PREVIEW FETCH FAILED:', e.message); }
} else {
  console.log('PREVIEW NOT GREEN — the honest refusal above stands (#105)');
  process.exitCode = 3;
}

// cleanup: stop the server (zero orphans — the path is proven; the manager
// starts it for the user on the real flow)
const mgr = await import(OLYMPUS + '/src/lib/dev-server-manager.ts');
const stop = await mgr.stop(SLUG);
log('STOP (zero orphans)', stop);
console.log('\n=== SMOKE DONE ===');
