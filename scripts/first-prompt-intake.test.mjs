#!/usr/bin/env node
/**
 * first-prompt-intake.test.mjs — #110 the autonomous intake + the dev-server
 * trigger (FLUENCY-1, Batch D). Run: npx tsx scripts/first-prompt-intake.test.mjs
 *
 * The user's pinned directives: OLYMPUS opens with NO folder selected; the
 * FIRST prompt decides (new | existing | ask); new projects register their
 * NAME + a SHORT DESCRIPTION + the classifier's stack hints autonomously;
 * when a frontend ships, `npm run dev` runs automatically so the user sees
 * it in the OLYMPUS live preview — the #105 doctrine governs the claim
 * (probe evidence or the honest refusal).
 *
 * Parts:
 *   1. the classification table (pure — injected project lists)
 *   2. the deterministic gate (dev script + frontend marker)
 *   3. the trigger END-TO-END (child mode: real ephemeral servers through
 *      the real #86 manager; tmp HOME/VAULT/ROOT/WORKSPACE — the real
 *      vault, lane, home, and repo are never touched)
 *      — green path: gate -> start -> PROBE -> the url serves
 *      — refusal paths: no marker / no dev script / start-but-no-probe
 *   4. content pins: the lane-project-dir threading (never process.cwd())
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF = join(ROOT, 'scripts', 'first-prompt-intake.test.mjs');
const WORK = join(tmpdir(), 'olympus-fluency-1-intake');

let fails = 0, checked = 0;
const check = (n, ok, d = '') => { checked++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -- ${String(d).slice(0, 300)}`}`); if (!ok) fails++; };

// ─── the fixture "frontend dev server" (a real npm-runnable HTTP server) ─────
const FIXTURE_SERVER_JS = `const http = require('http');
const fs = require('fs');
const i = process.argv.indexOf('-p');
const port = Number(process.argv[i + 1] || process.env.PORT || 0);
const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<title>Cafeteria Grão & Alma</title><h1>fixture frontend ok</h1>');
});
srv.listen(port, '127.0.0.1', () => { try { fs.writeFileSync(__dirname + '/ready.txt', String(port)); } catch {} });
`;

if (process.argv[2] === 'child') {
  const mode = process.argv[3];
  const home = process.env.HOME;
  const fakeRoot = process.env.OLYMPUS_ROOT;
  const vault = process.env.OLYMPUS_VAULT;
  const lane = process.env.OLYMPUS_WORKSPACE;
  const out = { mode, pids: [] };
  const net = await import('node:net');
  const trigger = await import('../src/lib/dev-server-trigger.ts');
  const mgr = await import('../src/lib/dev-server-manager.ts');

  const freePort = () => new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
  const noteFor = async (slug) => {
    const projectDir = join(lane, slug);
    const port = await freePort();
    const projectsDir = join(vault, '02_Projects', slug);
    mkdirSync(projectsDir, { recursive: true });
    writeFileSync(join(projectsDir, 'project.md'), `---\ntype: project\nslug: ${slug}\nname: ${slug}\npath: ${projectDir}\nstacks: []\ncreated: 2026-10-09T00:00:00.000Z\nlast_active: 2026-10-09T00:00:00.000Z\nlivePreviewPort: ${port}\n---\n\nbody\n`);
    mkdirSync(projectDir, { recursive: true });
    return { projectDir, port };
  };

  try {
    if (mode === 'green') {
      const slug = 'fixture-intake';
      const { projectDir } = await noteFor(slug);
      writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: slug, scripts: { dev: 'node fixture-server.js' }, dependencies: { next: '15.0.0' } }, null, 2));
      writeFileSync(join(projectDir, 'fixture-server.js'), FIXTURE_SERVER_JS);
      const r = await trigger.maybeStartDevServer(slug, projectDir);
      out.result = r;
      out.pids.push(r?.status ? (await mgr.status(slug)).pid : null);
      if (r.triggered && r.status?.url) {
        try {
          const page = await fetch(r.status.url);
          const body = await page.text();
          out.http = { status: page.status, marker: body.includes('fixture frontend ok') };
        } catch (e) { out.http = { status: 0, error: e.message }; }
      }
      await mgr.stop(slug);
      out.afterStop = await mgr.status(slug);
      out.stateGone = !existsSync(join(home, '.local', 'share', 'olympus', 'dev-servers', `${slug}.json`));
    }
    if (mode === 'refuse-no-probe') {
      const slug = 'fixture-intake-refuse';
      const { projectDir } = await noteFor(slug);
      writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: slug, scripts: { dev: 'node -e "process.exit(1)"' }, dependencies: { next: '15.0.0' } }, null, 2));
      out.result = await trigger.maybeStartDevServer(slug, projectDir);
      await mgr.stop(slug);
    }
    if (mode === 'refuse-no-marker') {
      const slug = 'fixture-intake-nomarker';
      const { projectDir } = await noteFor(slug);
      writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: slug, scripts: { dev: 'node server.js' } }, null, 2));
      out.result = await trigger.maybeStartDevServer(slug, projectDir);
    }
    if (mode === 'refuse-no-dev') {
      const slug = 'fixture-intake-nodev';
      const { projectDir } = await noteFor(slug);
      writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: slug, scripts: { build: 'echo x' }, dependencies: { next: '15.0.0' } }, null, 2));
      out.result = await trigger.maybeStartDevServer(slug, projectDir);
    }
    console.log(JSON.stringify(out));
  } catch (e) {
    console.log(JSON.stringify({ mode, __err: e.message }));
    process.exit(1);
  }
  process.exit(0);
}

function childRun(mode) {
  const fake = join(WORK, `fake-${mode}`), vault = join(WORK, `vault-${mode}`), home = join(WORK, `home-${mode}`), lane = join(WORK, `lane-${mode}`);
  for (const d of [fake, vault, home, lane]) mkdirSync(d, { recursive: true });
  writeFileSync(join(fake, 'opencode.json'), JSON.stringify({ agent: {} }));
  const env = { ...process.env, OLYMPUS_ROOT: fake, OLYMPUS_VAULT: vault, OLYMPUS_WORKSPACE: lane, HOME: home };
  const r = spawnSync('npx', ['tsx', SELF, 'child', mode], { encoding: 'utf-8', cwd: ROOT, timeout: 180_000, env });
  if (r.status !== 0) return { __err: `exit ${r.status}: ${r.stdout?.slice(-300)} ${r.stderr?.slice(-500)}` };
  try { return JSON.parse(r.stdout.trim().split('\n').filter(Boolean).pop()); } catch { return { __err: `unparseable: ${r.stdout?.slice(-300)}` }; }
}

async function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });

  let intent = null, triggerMod = null;
  try { intent = await import(ROOT + '/src/lib/project-intent.ts'); } catch { /* RED */ }
  try { triggerMod = await import(ROOT + '/src/lib/dev-server-trigger.ts'); } catch { /* RED */ }

  if (!intent || typeof intent.classifyFirstPrompt !== 'function') {
    check('I: project-intent.ts exported (classifyFirstPrompt)', false, 'missing — the first prompt decides nothing; intake stays manual');
    check('I: extractProjectName (quoted / called / derived)', false, 'blocked');
    check('D: dev-server-trigger.ts exported (maybeStartDevServer)', false, 'missing — npm run dev never auto-starts; no live preview');
    check('D: the deterministic gate (dev script + frontend marker)', false, 'blocked');
    check('D: the trigger end-to-end (green + refusals)', false, 'blocked');
    check('W: the lane-project-dir threading (never process.cwd())', false, 'blocked');
    return;
  }

  const { classifyFirstPrompt, extractProjectName, deriveProjectName, INTENT_MATCH_THRESHOLD } = intent;
  const { detectFrontendDevScript, maybeStartDevServer, FRONTEND_MARKERS } = triggerMod;

  // ── 1. The classification table (pure, injected projects) ───────────────
  const proj = (slug, name, description) => ({ slug, name, description, path: '/tmp/' + slug, stacks: [], created: '', last_active: '' });
  const lumina = proj('lumina-crm', 'Lumina CRM', 'a CRM for a solar panel customers tracker');
  const petlove = proj('petlove', 'PetLove', 'a pet care companion with reminders');
  const cases = [
    ['quoted name, empty table -> new with THAT name', 'Build a "Lumina CRM" from scratch with a dashboard', [], (r) => r.kind === 'new' && r.projectName === 'Lumina CRM'],
    ['called name -> new with THAT name', 'make an app called SolarDesk for panels', [], (r) => r.kind === 'new' && /^SolarDesk$/.test(r.projectName)],
    ['no name -> derived from significant words', 'landing page for a bakery with menu', [], (r) => r.kind === 'new' && r.projectName === 'Landing Bakery Menu'],
    ['candidate name matches an existing project -> existing', 'continue the "Lumina CRM" build', [lumina, petlove], (r) => r.kind === 'existing' && r.slug === 'lumina-crm'],
    ['candidate partial name (Lumina) -> existing via token overlap', 'update "Lumina" with a settings page', [lumina, petlove], (r) => r.kind === 'existing' && r.slug === 'lumina-crm'],
    ['description overlap -> existing', 'build a CRM for solar customers', [lumina, petlove], (r) => r.kind === 'existing' && r.slug === 'lumina-crm'],
    ['weak overlap -> new (the threshold is honest)', 'build a CRM for solar customers', [petlove], (r) => r.kind === 'new'],
    ['two strong matches -> ask (never a silent guess)', 'update the "Lumina" project', [lumina, proj('lumina-two', 'Lumina Two', 'another lumina crm build')], (r) => r.kind === 'ask' && r.candidates.length >= 2],
    ['trivial prompt -> still non-empty new (the route gates trivial separately)', 'hi', [], (r) => r.kind === 'new' && !!r.projectName],
  ];
  for (const [name, prompt, table, ok] of cases) {
    const r = classifyFirstPrompt(prompt, table);
    check(`I: ${name}`, ok(r), JSON.stringify(r).slice(0, 160));
  }
  check('I: the threshold is a named export (tunable, honest)', typeof INTENT_MATCH_THRESHOLD === 'number' && INTENT_MATCH_THRESHOLD > 0 && INTENT_MATCH_THRESHOLD < 1, String(INTENT_MATCH_THRESHOLD));
  check('I: extractProjectName quoted form', extractProjectName('build "Lumina CRM" now') === 'Lumina CRM', String(extractProjectName('build "Lumina CRM" now')));
  check('I: extractProjectName called form', extractProjectName('an app called SolarDesk for panels') === 'SolarDesk', String(extractProjectName('an app called SolarDesk for panels')));
  check('I: extractProjectName null when unnamed', extractProjectName('build me a landing page') === null, String(extractProjectName('build me a landing page')));
  check('I: deriveProjectName skips stopwords', deriveProjectName('make a landing page for a bakery') === 'Landing Bakery', String(deriveProjectName('make a landing page for a bakery')));

  // ── 2. The deterministic gate (pure, fixture dirs) ──────────────────────
  const g = (id, pkg) => {
    const d = join(WORK, 'gate-' + id);
    mkdirSync(d, { recursive: true });
    if (pkg) writeFileSync(join(d, 'package.json'), JSON.stringify(pkg));
    return d;
  };
  check('D: no package.json -> not triggered', detectFrontendDevScript(g('none', null)).ok === false, 'wanted false');
  check('D: no dev script -> not triggered', detectFrontendDevScript(g('nodev', { scripts: { build: 'x' }, dependencies: { next: '1' } })).ok === false, 'wanted false');
  check('D: dev script without a frontend marker -> not triggered', detectFrontendDevScript(g('nomark', { scripts: { dev: 'node server.js' } })).ok === false, 'wanted false');
  check('D: dev script + next dep -> triggered', detectFrontendDevScript(g('next', { scripts: { dev: 'next dev' }, dependencies: { next: '15' } })).ok === true, 'wanted true');
  check('D: dev script mentioning vite -> triggered', detectFrontendDevScript(g('vite', { scripts: { dev: 'vite --port 3000' } })).ok === true, 'wanted true');
  check('D: the marker list is exported + includes the big five', ['next', 'vite', 'react-scripts', 'astro', 'svelte'].every((m) => FRONTEND_MARKERS.includes(m)), JSON.stringify(FRONTEND_MARKERS));

  // ── 3. The trigger end-to-end (real servers through the real manager) ───
  const green = childRun('green');
  if (green.__err) {
    check('D: e2e green run completed', false, green.__err);
  } else {
    check('D: e2e green — triggered with PROBE evidence (running + latency + url)', green.result?.triggered === true && green.result?.status?.running === true && typeof green.result?.status?.responseTimeMs === 'number' && !!green.result?.status?.url, JSON.stringify(green.result).slice(0, 240));
    check('D: e2e green — the served page answers HTTP 200 with the marker', green.http?.status === 200 && green.http?.marker === true, JSON.stringify(green.http));
    check('D: e2e green — stop is clean (probe down, state file removed)', green.afterStop?.running === false && green.stateGone === true, JSON.stringify({ afterStop: green.afterStop?.running, stateGone: green.stateGone }));
  }
  const noProbe = childRun('refuse-no-probe');
  if (noProbe.__err) {
    check('D: e2e refusal (no probe) run completed', false, noProbe.__err);
  } else {
    check('D: e2e refusal — start issued but no green probe -> the HONEST refusal (#105)', noProbe.result?.triggered === false && /no probe evidence|not green/i.test(noProbe.result?.reason || ''), JSON.stringify(noProbe.result).slice(0, 240));
  }
  const noMarker = childRun('refuse-no-marker');
  check('D: e2e refusal — no frontend marker -> not triggered, reason names the marker', !noMarker.__err && noMarker.result?.triggered === false && /frontend marker/.test(noMarker.result?.reason || ''), JSON.stringify(noMarker).slice(0, 200));
  const noDev = childRun('refuse-no-dev');
  check('D: e2e refusal — no dev script -> not triggered, reason names the script', !noDev.__err && noDev.result?.triggered === false && /dev.? script/i.test(noDev.result?.reason || ''), JSON.stringify(noDev).slice(0, 200));

  // ── 4. Content pins: the lane-project-dir threading ─────────────────────
  const intakeSrc = readFileSync(ROOT + '/src/lib/intake-orchestrator.ts', 'utf-8');
  check('W: laneProjectDir rides the intake request (never process.cwd() for API intake)',
    /laneProjectDir\?: string/.test(intakeSrc) && /request\.laneProjectDir \|\| extraction/.test(intakeSrc), 'the lane-dir threading is missing');
  check('W: quickIntake accepts manualStacks (the classifier hints before any file exists)',
    /manualStacks: opts\.manualStacks/.test(intakeSrc), 'stack hints not threaded');

  // ── 5. Content pins: the action-route wiring ────────────────────────────
  const routeSrc = readFileSync(ROOT + '/src/app/api/olympus/action/route.ts', 'utf-8');
  check('W: the route runs the intent stage on prompt (non-blocking, trivial-gated)',
    /resolveAndRegisterIntent\(promptText/.test(routeSrc) && /classification\.complexity !== 'trivial'/.test(routeSrc),
    'the route never asks the first-prompt question');
  check('W: the intent result rides the stream (streamWarm opts + log event)',
    /intent: intentStage/.test(routeSrc) && /opts\.intent\b/.test(routeSrc), 'the intent result is invisible');
  check('W: the post-success dev-server trigger fires on the routed slug (probe-first)',
    /maybeStartDevServer\(opts\.intent\.slug/.test(routeSrc) && /reconcileProjectPath\(opts\.intent\.slug\)/.test(routeSrc),
    'no trigger after a successful run');
}

main().then(() => {
  rmSync(WORK, { recursive: true, force: true });
  if (fails > 0) { console.error(`\n${fails} assertion(s) failed`); process.exit(1); }
  console.log('\nAll #110 first-prompt-intake assertions passed');
  process.exit(0);
}).catch((e) => { rmSync(WORK, { recursive: true, force: true }); console.error('FIXTURE CRASH:', e); process.exit(1); });
