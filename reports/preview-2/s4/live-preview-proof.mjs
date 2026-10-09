#!/usr/bin/env node
/**
 * live-preview-proof.mjs — PREVIEW-2's optional garnish (the window was GREEN
 * at 07:44Z): ONE live hop on the free tier through the CURED preview seam.
 *
 *   intake (resolveAndRegisterIntent, 0 LLM — the real vault, fresh slug)
 *   -> ONE hop on apollo/nvidia-glm/z-ai/glm-5.3 (the walker's one-shot
 *      transport, OLYMPUS_HOP_TIMEOUT_MS disclosed below) writes index.html
 *      + styles.css + package.json + vite.config.js into 02_Projects/<slug>
 *   -> npm install vite (harness step)
 *   -> maybeStartDevServer(slug, reconcileProjectPath(slug).path) — the
 *      action route's exact call shape — through the CURED manager
 *   -> probe-green + HTTP 200 + the served marker -> the URL recorded
 *   -> clean stop; zero orphans.
 *
 * Evidence: stdout tee'd to reports/preview-2/s4/live-preview-proof.txt.
 * R4 is copied INTO the lane (never touched in the repo). The created
 * project (preview-two-live) is KEPT — the proof's own output, disclosed
 * (the house pattern: FLUENCY-1's fluency-smoke).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HOME = process.env.HOME;
const SLUG = 'preview-two-live';
const LANE = path.join(HOME, 'OLYMPUS-VAULT', '02_Projects', SLUG);
const ACTIVE = path.join(HOME, '.olympus', 'active-project.json');
process.env.OLYMPUS_HOP_TIMEOUT_MS ||= '1800000'; // R3's knob, disclosed (30 min ceiling)
const log = (t, v) => console.log(`\n=== ${t} ===\n` + (typeof v === 'string' ? v : JSON.stringify(v, null, 2)));

const activeBefore = fs.existsSync(ACTIVE) ? fs.readFileSync(ACTIVE, 'utf-8') : null;

const { resolveAndRegisterIntent } = await import(OLYMPUS + '/src/lib/project-intent.ts');
const { reconcileProjectPath } = await import(OLYMPUS + '/src/lib/project-context.ts');

fs.rmSync(LANE, { recursive: true, force: true }); // a stale attempt from an earlier run must not shadow tonight's
const intent = await resolveAndRegisterIntent('Build a "Preview Two Live" landing page for a night bakery', ['html', 'css', 'javascript']);
log('INTAKE (fresh slug, real vault, 0 LLM)', intent);
if (intent.kind !== 'new' || intent.slug !== SLUG) { console.log('INTAKE FAILED'); process.exit(2); }

// the lane kit (the SPAWN-INVOCATION pattern; the project note stays)
for (const [from, to] of [[OLYMPUS + '/.opencode', LANE + '/.opencode'], [OLYMPUS + '/node_modules', LANE + '/node_modules']]) {
  try { fs.rmSync(to, { force: true }); } catch {}
  try { fs.symlinkSync(from, to, 'dir'); } catch {}
}
fs.copyFileSync(OLYMPUS + '/opencode.json', LANE + '/opencode.json');
fs.copyFileSync(OLYMPUS + '/opencode.demigods.json', LANE + '/opencode.demigods.json');

const plan = {
  version: 1,
  laneRoot: LANE,
  hops: [{
    id: 'hop-preview', god: 'apollo',
    prompt: 'Use the write tool to create four files in the current directory: (1) index.html — a single-file landing page for "Preview Two Live", a night bakery: a hero with the name and a tagline, a small menu list (three items with prices), a footer. Link styles.css. (2) styles.css — a dark, warm night palette (charcoal, amber, cream), system font stack, simple layout. (3) package.json — { "name": "preview-two-live", "private": true, "type": "module", "scripts": { "dev": "vite --host 127.0.0.1" }, "devDependencies": { "vite": "^5.0.0" } }. (4) vite.config.js — import { defineConfig } from "vite"; export default defineConfig({ server: { host: "127.0.0.1" } }). Do not install anything. Then stop — the files ARE the deliverable.',
    artifacts: ['index.html', 'styles.css', 'package.json', 'vite.config.js'], budgetTokens: 16384,
  }],
};
const { walkPlan } = await import(OLYMPUS + '/src/lib/hop-runtime/walker.ts');
console.log(`\n=== WALK START (${new Date().toISOString()}, live R4 lanes, FREE) ===`);
const walk = await walkPlan({ plan });
log('WALK RESULT', { completed: walk.completed, parked: walk.parked, rows: walk.rows });
if (walk.parked || !walk.completed.includes('hop-preview')) {
  console.log('WALK NOT GREEN (parked or incomplete) — REPORTED, not claimed (#105). The deterministic suite remains the gate proof.');
  process.exitCode = 4;
} else {
  log('ARTIFACTS ON DISK', fs.readdirSync(LANE).filter((f) => !f.startsWith('.') && f !== 'node_modules'));

  console.log('\n=== npm install vite (harness step) ===');
  try {
    execSync('npm install --no-audit --no-fund --silent vite@5', { cwd: LANE, stdio: 'inherit', timeout: 420_000 });
  } catch (e) { console.log('vite install failed:', e.message); process.exitCode = 3; }

  // THE CURED SEAM, live: reconcile answers the 02_Projects note path; the
  // manager spawns THERE (pre-#112 this was the refusal at exactly this step).
  const rec = reconcileProjectPath(SLUG);
  log('RECONCILE (the lane-aware truth)', rec);
  const { maybeStartDevServer } = await import(OLYMPUS + '/src/lib/dev-server-trigger.ts');
  const trigger = await maybeStartDevServer(SLUG, rec?.path ?? LANE);
  log('TRIGGER RESULT (through the cured seam)', trigger);
  if (trigger.triggered && trigger.status?.url) {
    try {
      const page = await fetch(trigger.status.url);
      const body = await page.text();
      log('PREVIEW GREEN — THE LIVE PROOF', {
        url: trigger.status.url, http: page.status, bytes: body.length,
        marker: /Preview Two Live/i.test(body),
        responseTimeMs: trigger.status.responseTimeMs,
        note: 'the status route (/api/olympus/dev-server/status) surfaces THIS SAME manager.status output (the suite-pinned #105 path) — the panel reads it',
      });
    } catch (e) { console.log('PREVIEW FETCH FAILED:', e.message); process.exitCode = 3; }
  } else {
    console.log('PREVIEW NOT GREEN — the refusal stands (REPORTED):', trigger.reason);
    process.exitCode = 3;
  }
  const mgr = await import(OLYMPUS + '/src/lib/dev-server-manager.ts');
  const stop = await mgr.stop(SLUG);
  const after = await mgr.status(SLUG);
  log('STOP (zero orphans)', { stopOk: stop.ok, afterRunning: after.running, portFree: stop.portFree });
}

// the pointer stays where the user had it
try { if (activeBefore !== null) fs.writeFileSync(ACTIVE, activeBefore); } catch (e) { console.log('active restore failed:', e.message); }
log('HYGIENE', { activeRestored: activeBefore === null || fs.readFileSync(ACTIVE, 'utf-8') === activeBefore, liveProofProject: `${LANE} kept (disclosed)` });
console.log('\n=== LIVE PREVIEW PROOF DONE ===');
