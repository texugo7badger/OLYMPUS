#!/usr/bin/env node
/**
 * dev-server-manager.test.mjs — MADRUGA-SERVE-1 Batch A: the durable
 * dev-server manager (#86, the manager half). RED-first, child-gate env
 * pattern (per project-context.test.mjs: OLYMPUS_ROOT/OLYMPUS_VAULT/
 * OLYMPUS_WORKSPACE/HOME tmp dirs — the real vault, lane, home, and repo
 * are never touched by any fixture).
 *
 *   lifecycle mode — the full contract against REAL ephemeral fixture
 *     servers (a tiny HTTP "dev server" driven through the manager's own
 *     spawn path: npm run dev -- -p <port> in the lane project):
 *       (A1)  start → ok, not alreadyRunning, pid > 0, port === the note's
 *             livePreviewPort (parity with the panel)
 *       (A2)  the state file contract: ~/.local/share/olympus/dev-servers/
 *             <slug>.json exists with EXACTLY {pid,port,host,projectPath,
 *             startedAt,logFile,lastProbe}
 *       (A3)  status(slug) polled green — running comes from the PROBE
 *             (probeDevServer), host surfaced, url reachable-shaped
 *       (A4)  status(port) — the by-port lookup finds the same slug
 *       (A5)  HTTP GET on the served page → 200 + the fixture marker
 *       (A6)  idempotence: start again → alreadyRunning, SAME pid + port
 *             (never a second spawn on the same port)
 *       (A7)  stop → ok, port free
 *       (A8)  zero orphans: probe false on the port + kill(pid,0) ESRCH
 *       (A9)  the state file is removed by stop
 *       (A10) the crash-orphan case: a state file with a DEAD pid → status
 *             is the honest "down (stale state, pid dead)" + the file
 *             self-heals (removed) — never a false "running"
 *       (A11) the clean restart after the heal: start → green → stop
 *       (A12) the sweep: the note port is silent when the child ends
 *   guard mode — the never-inside-the-repo guard, behaviorally:
 *       (B1)  OLYMPUS_WORKSPACE pointing INSIDE a fake OLYMPUS root →
 *             start lands in the HOME-default lane fallback, NEVER the root
 *       (B2)  the state file lands under the tmp HOME dev-servers dir
 *       (B3)  the guard-mode server is real (polled green) and stops clean
 *   content pins (driver-side, on the module source):
 *       (C1)  detached spawn (detached: true) — the #105 lesson: the
 *             interactive lane cannot host a durable process
 *       (C2)  child.unref() — the server survives the spawning session
 *       (C3)  the insideOlympusRoot guard before spawn (the #99 shape)
 *       (C4)  status truth = probeDevServer (the #102 probe, reused)
 *       (C5)  the group-stop ladder: SIGTERM first, SIGKILL disclosed
 *
 * Run: npx tsx scripts/dev-server-manager.test.mjs (exit 0)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF = join(ROOT, 'scripts', 'dev-server-manager.test.mjs');
const MODULE = join(ROOT, 'src', 'lib', 'dev-server-manager.ts');
const WORK = join(tmpdir(), 'olympus-serve-1-manager');

let fails = 0, checked = 0;
const check = (n, ok, d = '') => { checked++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -- ${String(d).slice(0, 320)}`}`); if (!ok) fails++; };

const child = (mode) => {
  const fake = join(WORK, `fake-${mode}`), vault = join(WORK, `vault-${mode}`), home = join(WORK, `home-${mode}`);
  const lane = join(WORK, `lane-${mode}`);
  for (const d of [fake, vault, home, lane]) mkdirSync(d, { recursive: true });
  // the fake OLYMPUS root must look like one to findOlympusRoot()
  writeFileSync(join(fake, 'opencode.json'), JSON.stringify({ agent: {} }));
  const env = {
    ...process.env,
    OLYMPUS_ROOT: fake,
    OLYMPUS_VAULT: vault,
    // guard mode: the workspace points INSIDE the fake root — the lane
    // resolver must refuse it and fall back to the tmp HOME default lane
    OLYMPUS_WORKSPACE: mode === 'guard' ? join(fake, 'workspace') : lane,
    HOME: home,
  };
  const r = spawnSync('npx', ['tsx', SELF, 'child', mode], { encoding: 'utf-8', cwd: ROOT, timeout: 180_000, env });
  if (r.status !== 0) return { __err: `${r.status} ${r.stdout?.slice(-400)} ${r.stderr?.slice(-600)}` };
  return JSON.parse(r.stdout.trim().split('\n').filter(Boolean).pop());
};

if (process.argv[2] !== 'child') { rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true }); }

// ─── the fixture "dev server" project (a real npm-runnable HTTP server) ────
const FIXTURE_SERVER_JS = `const http = require('http');
const fs = require('fs');
const i = process.argv.indexOf('-p');
const port = Number(process.argv[i + 1] || process.env.PORT || 0);
const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<title>fixture dev server ok</title>');
});
srv.listen(port, '127.0.0.1', () => { try { fs.writeFileSync(__dirname + '/ready.txt', String(port)); } catch {} });
`;

if (process.argv[2] === 'child') {
  const mode = process.argv[3];
  const lane = process.env.OLYMPUS_WORKSPACE;
  const home = process.env.HOME;
  const fakeRoot = process.env.OLYMPUS_ROOT;
  const vault = process.env.OLYMPUS_VAULT;
  const out = { mode, pids: [], steps: {} };
  const net = await import('node:net');
  const { probeDevServer } = await import('../src/lib/dev-server-probe.ts');
  const mgr = await import('../src/lib/dev-server-manager.ts');

  const freePort = () => new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });

  // ── #112 (PREVIEW-2): the intake-registered project shape — the note's
  // path IS the 02_Projects/<slug> dir itself (the #110 intake), no
  // workspace-lane copy anywhere. The manager must spawn THERE. RED before
  // the cure: the workspaceLaneDir()-only derivation refuses outright
  // (SMOKE-1's live refusal, reproduced in a fixture).
  if (mode === 'intake02') {
    const slug2 = 'fixture-intake02';
    const intakeDir = join(vault, '02_Projects', slug2);
    mkdirSync(intakeDir, { recursive: true });
    writeFileSync(join(intakeDir, 'package.json'), JSON.stringify({ name: slug2, scripts: { dev: 'node fixture-server.js' } }, null, 2));
    writeFileSync(join(intakeDir, 'fixture-server.js'), FIXTURE_SERVER_JS);
    const p = await freePort();
    writeFileSync(join(intakeDir, 'project.md'), `---\ntype: project\nslug: ${slug2}\nname: ${slug2}\npath: ${intakeDir}\nstacks: [html]\ncreated: 2026-10-09T00:00:00.000Z\nlast_active: 2026-10-09T00:00:00.000Z\nlivePreviewPort: ${p}\n---\n\nbody\n`);
    out.steps.intakeDir = intakeDir;
    out.steps.laneCopyExists = existsSync(join(lane, slug2));
    const started = await mgr.start(slug2);
    out.steps.started = started;
    out.pids.push(started?.pid);
    if (started?.ok) {
      const st = await (async () => {
        const t0 = Date.now();
        for (;;) {
          const s = await mgr.status(slug2);
          if (s.running || Date.now() - t0 > 30_000) return s;
          await new Promise((r) => setTimeout(r, 250));
        }
      })();
      out.steps.status = st;
      if (st.running && st.url) {
        try { const page = await fetch(st.url); const body = await page.text(); out.steps.http = { status: page.status, marker: body.includes('fixture dev server ok') }; } catch (e) { out.steps.http = { status: 0, error: e.message }; }
      }
      await mgr.stop(slug2);
      out.steps.afterStop = await mgr.status(slug2);
      out.steps.stateGone = !existsSync(join(home, '.local', 'share', 'olympus', 'dev-servers', `${slug2}.json`));
      const silent = await probeDevServer(p, 800);
      out.steps.portSilent = silent.running === false;
    }
    console.log(JSON.stringify(out));
    process.exit(0);
  }

  // ── #113 (PLANO-MASTER-1 B2): the ORPHAN-LANE COLLISION — the user's exact
  // UAT shape at the manager seam: the intake home in 02_Projects (alive, with
  // content) + a WORKSPACE-LANE copy with divergent content (a dead UAT's
  // leftover). The manager must spawn in the HOME. RED pre-cure: the
  // note-stale decision hands the spawn (and the served page!) to the orphan.
  if (mode === 'orphanlane') {
    const slug2 = 'fixture-orphanlane';
    const intakeDir = join(vault, '02_Projects', slug2);
    mkdirSync(intakeDir, { recursive: true });
    writeFileSync(join(intakeDir, 'package.json'), JSON.stringify({ name: slug2, scripts: { dev: 'node fixture-server.js' } }, null, 2));
    writeFileSync(join(intakeDir, 'fixture-server.js'), FIXTURE_SERVER_JS);
    const p = await freePort();
    writeFileSync(join(intakeDir, 'project.md'), `---\ntype: project\nslug: ${slug2}\nname: ${slug2}\npath: ${intakeDir}\nstacks: [html]\ncreated: 2026-10-09T00:00:00.000Z\nlast_active: 2026-10-09T00:00:00.000Z\nlivePreviewPort: ${p}\n---\n\nbody\n`);
    // the orphan lane copy: a FULL dev-server-capable copy whose server serves
    // a DIFFERENT marker — if the spawn lands there, the page proves it.
    const orphanDir = join(lane, slug2);
    mkdirSync(orphanDir, { recursive: true });
    writeFileSync(join(orphanDir, 'package.json'), JSON.stringify({ name: slug2, scripts: { dev: 'node fixture-server.js' } }, null, 2));
    writeFileSync(join(orphanDir, 'fixture-server.js'), FIXTURE_SERVER_JS.replace('fixture dev server ok', 'THE ORPHAN LANE MARKER'));
    writeFileSync(join(orphanDir, 'orphan-artifact.txt'), 'leftover from a dead UAT');
    out.steps.intakeDir = intakeDir;
    out.steps.orphanDir = orphanDir;
    out.steps.orphanCopyExists = existsSync(orphanDir);
    const started = await mgr.start(slug2);
    out.steps.started = started;
    out.pids.push(started?.pid);
    if (started?.ok) {
      const st = await (async () => {
        const t0 = Date.now();
        for (;;) {
          const s = await mgr.status(slug2);
          if (s.running || Date.now() - t0 > 30_000) return s;
          await new Promise((r) => setTimeout(r, 250));
        }
      })();
      out.steps.status = st;
      if (st.running && st.url) {
        try {
          const page = await fetch(st.url); const body = await page.text();
          out.steps.http = { status: page.status, homeMarker: body.includes('fixture dev server ok'), orphanMarker: body.includes('THE ORPHAN LANE MARKER') };
        } catch (e) { out.steps.http = { status: 0, error: e.message }; }
      }
      await mgr.stop(slug2);
      out.steps.afterStop = await mgr.status(slug2);
      out.steps.stateGone = !existsSync(join(home, '.local', 'share', 'olympus', 'dev-servers', `${slug2}.json`));
      const silent = await probeDevServer(p, 800);
      out.steps.portSilent = silent.running === false;
    }
    console.log(JSON.stringify(out));
    process.exit(0);
  }

  // ── #112 refusal preservation: an UNKNOWN slug (no note, no lane dir)
  // still earns the honest refusal — the #105 doctrine is scoped, not weakened.
  if (mode === 'unknownslug') {
    out.steps.unknown = await mgr.start('fixture-no-such-project');
    console.log(JSON.stringify(out));
    process.exit(0);
  }


  // the lane project dir the manager must spawn in (#99: lane, never the repo)
  const effectiveLane = mode === 'guard'
    ? join(home, '.local', 'share', 'olympus', 'workspace')
    : lane;
  const slug = 'fixture-manager';
  const projectDir = join(effectiveLane, slug);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: 'fixture-manager', scripts: { dev: 'node fixture-server.js' } }, null, 2));
  writeFileSync(join(projectDir, 'fixture-server.js'), FIXTURE_SERVER_JS);

  // the vault note with livePreviewPort — the port the panel already probes
  const notePort = await freePort();
  out.steps.notePort = notePort;
  const projectsDir = join(vault, '02_Projects', slug);
  mkdirSync(projectsDir, { recursive: true });
  writeFileSync(join(projectsDir, 'project.md'), `---\ntype: project\nslug: ${slug}\nname: ${slug}\npath: ${projectDir}\nstacks: []\ncreated: 2026-10-08T00:00:00.000Z\nlast_active: 2026-10-08T00:00:00.000Z\nlivePreviewPort: ${notePort}\n---\n\nbody\n`);

  const stateFile = join(home, '.local', 'share', 'olympus', 'dev-servers', `${slug}.json`);
  const pollGreen = async (slugOrPort, deadlineMs = 30_000) => {
    const t0 = Date.now();
    for (;;) {
      const st = await mgr.status(slugOrPort);
      if (st.running) return st;
      if (Date.now() - t0 > deadlineMs) return st;
      await new Promise(r => setTimeout(r, 250));
    }
  };
  try {
    // (A1/B1) start — spawns detached in the lane project dir
    const started = await mgr.start(slug);
    out.steps.started = started;
    out.pids.push(started?.pid);
    if (mode === 'guard') {
      // (B1) the guard: the spawn lands in the HOME-default lane, NEVER the root
      out.steps.guard = {
        ok: started.ok,
        projectPath: started.projectPath,
        insideFakeRoot: String(started.projectPath || '').startsWith(fakeRoot + '/') || started.projectPath === fakeRoot,
        expectedLanePath: projectDir,
        inFallbackLane: started.projectPath === projectDir,
      };
    }

    // (A2) the state-file contract — EXACTLY these fields
    if (started.ok) {
      const rawState = JSON.parse(readFileSync(stateFile, 'utf-8'));
      const keys = Object.keys(rawState).sort();
      out.steps.stateContract = {
        exists: existsSync(stateFile),
        keys,
        exact: JSON.stringify(keys) === JSON.stringify(['host', 'lastProbe', 'logFile', 'pid', 'port', 'projectPath', 'startedAt']),
        portIsNotePort: rawState.port === notePort,
        pidMatches: rawState.pid === started.pid,
        projectPathIsLane: rawState.projectPath === projectDir,
      };
    }

    // (A3/B3) status polled green — running comes ONLY from the probe
    const green = await pollGreen(slug);
    out.steps.green = green;
    out.steps.portLookup = await mgr.status(green.port);
    out.pids.push(green.pid);

    // (A5) the served page answers HTTP 200 with the fixture marker
    if (green.running) {
      try {
        const page = await fetch(green.url);
        const body = await page.text();
        out.steps.http = { status: page.status, marker: body.includes('fixture dev server ok') };
      } catch (e) { out.steps.http = { status: 0, error: e.message }; }
    }

    if (mode !== 'guard') {
      // (A6) idempotence — start again on the LIVE server: same state, no second spawn
      const again = await mgr.start(slug);
      out.steps.idempotent = {
        ok: again.ok,
        alreadyRunning: again.alreadyRunning === true,
        samePid: again.pid === started.pid,
        samePort: again.port === started.port,
      };

      // (A7) stop the live server FIRST (the state file is the stop truth)
      const stopLive = await mgr.stop(slug);
      out.steps.stopLive = { ok: stopLive.ok, portFree: stopLive.portFree };
      // (A8) zero orphans — the pid is reaped, the port is silent
      let esrch1 = false;
      try { process.kill(started.pid, 0); } catch (e) { esrch1 = e.code === 'ESRCH'; }
      out.steps.orphans = { esrch: esrch1, portStillBusy: (await probeDevServer(notePort, 800)).running };
      // (A9) the state file is removed by stop
      out.steps.fileAfterStop = existsSync(stateFile);

      // (A10) the crash-orphan case — a state file with a DEAD pid (after the
      // live server is gone, so the fabricated file is the only truth left)
      const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
      const deadPid = dead.pid; // reaped by spawnSync — guaranteed dead below
      await new Promise(r => setTimeout(r, 300));
      const stalePort = await freePort();
      mkdirSync(join(home, '.local', 'share', 'olympus', 'dev-servers'), { recursive: true });
      writeFileSync(stateFile, JSON.stringify({ pid: deadPid, port: stalePort, host: null, projectPath: projectDir, startedAt: new Date().toISOString(), logFile: join(home, 'x.log'), lastProbe: null }));
      const staleStatus = await mgr.status(slug);
      out.steps.orphan = {
        running: staleStatus.running,
        state: staleStatus.state,
        staleCleared: staleStatus.staleCleared === true,
        note: staleStatus.note,
        fileRemoved: !existsSync(stateFile),
        deadPid,
      };

      // (A11) the clean restart after the heal
      const restarted = await mgr.start(slug);
      out.steps.restarted = { ok: restarted.ok, pid: restarted.pid, samePortAsNote: restarted.port === notePort };
      out.pids.push(restarted?.pid);
      const regreen = await pollGreen(slug);
      out.steps.regreen = { running: regreen.running };
      const restop = await mgr.stop(slug);
      out.steps.restop = { ok: restop.ok, portFree: restop.portFree };
      // the restarted pid is reaped too
      let esrch2 = false;
      try { process.kill(restarted.pid, 0); } catch (e) { esrch2 = e.code === 'ESRCH'; }
      out.steps.orphans2 = { esrch: esrch2 };
    } else {
      const gstop = await mgr.stop(slug);
      out.steps.guardStop = { ok: gstop.ok, portFree: gstop.portFree };
      let esrch = false;
      try { process.kill(started.pid, 0); } catch (e) { esrch = e.code === 'ESRCH'; }
      out.steps.guardOrphan = { esrch };
    }
  } finally {
    // best-effort cleanup + the honest sweep: never leave a managed fixture
    // server behind (zero orphans — the pids below were created by this suite)
    try { await mgr.stop(slug); } catch {}
    for (const p of out.pids) { try { process.kill(-p, 'SIGKILL'); } catch {} try { process.kill(p, 'SIGKILL'); } catch {} }
    await new Promise(r => setTimeout(r, 300));
    out.steps.sweepPortSilent = !(await probeDevServer(notePort, 800)).running;
  }
  console.log(JSON.stringify(out));
  process.exit(0);
}

if (process.argv[2] !== 'child') {
  // ─── driver: the two children ────────────────────────────────────────────
  const lifecycle = child('lifecycle');
  if (lifecycle.__err) {
    check('A the lifecycle child ran', false, lifecycle.__err);
  } else {
    const s = lifecycle.steps;
    check('A1 start → ok, not alreadyRunning, pid > 0', s.started?.ok === true && s.started?.alreadyRunning !== true && typeof s.started?.pid === 'number' && s.started.pid > 0, JSON.stringify(s.started));
    check('A1 start → port === the note livePreviewPort (panel parity)', s.started?.port === s.notePort && s.stateContract?.portIsNotePort === true, `started.port=${s.started?.port} notePort=${s.notePort}`);
    check('A2 the state file exists with EXACTLY {pid,port,host,projectPath,startedAt,logFile,lastProbe}', s.stateContract?.exists === true && s.stateContract?.exact === true, `keys: ${s.stateContract?.keys}`);
    check('A2 the state pid + projectPath are the spawn truth', s.stateContract?.pidMatches === true && s.stateContract?.projectPathIsLane === true, JSON.stringify(s.stateContract));
    check('A3 status(slug) polled green — running via the probe', s.green?.running === true, JSON.stringify(s.green));
    check('A3 status carries host + the reachable url', s.green?.host === 'ipv4' && typeof s.green?.url === 'string' && s.green.url.startsWith('http://127.0.0.1:'), JSON.stringify({ host: s.green?.host, url: s.green?.url }));
    check('A4 status(port) — the by-port lookup finds the slug', s.portLookup?.slug === 'fixture-manager' && s.portLookup?.running === true, JSON.stringify(s.portLookup));
    check('A5 HTTP GET the served page → 200 + the fixture marker', s.http?.status === 200 && s.http?.marker === true, JSON.stringify(s.http));
    check('A6 idempotence — start again → alreadyRunning, SAME pid + port', s.idempotent?.ok === true && s.idempotent?.alreadyRunning === true && s.idempotent?.samePid === true && s.idempotent?.samePort === true, JSON.stringify(s.idempotent));
    check('A7 stop → ok + port free', s.stopLive?.ok === true && s.stopLive?.portFree === true, JSON.stringify(s.stopLive));
    check('A8 zero orphans — pid reaped (ESRCH) + port not listening', s.orphans?.esrch === true && s.orphans?.portStillBusy === false, JSON.stringify(s.orphans));
    check('A9 the state file is removed by stop', s.fileAfterStop === false, `exists=${s.fileAfterStop}`);
    check('A10 the crash-orphan: status is honest down (stale state, pid dead) — never a false running', s.orphan?.running === false && s.orphan?.state === 'down-stale' && String(s.orphan?.note || '').includes('stale state'), JSON.stringify(s.orphan));
    check('A10 the stale state file self-heals (removed)', s.orphan?.staleCleared === true && s.orphan?.fileRemoved === true, JSON.stringify(s.orphan));
    check('A11 the clean restart after the heal → green → stop', s.restarted?.ok === true && s.regreen?.running === true && s.restop?.ok === true && s.restop?.portFree === true, JSON.stringify({ restarted: s.restarted, regreen: s.regreen, restop: s.restop }));
    check('A11 the restarted pid is reaped too (zero orphans)', s.orphans2?.esrch === true, JSON.stringify(s.orphans2));
    check('A12 the sweep — the note port is silent when the child ends', s.sweepPortSilent === true, `sweepPortSilent=${s.sweepPortSilent}`);
  }
  console.log(`      lifecycle fixture pids (created + killed by this suite): ${JSON.stringify(lifecycle.pids ?? [])}`);

  const guard = child('guard');
  if (guard.__err) {
    check('B the guard child ran', false, guard.__err);
  } else {
    const g = guard.steps;
    check('B1 the guard: start lands in the HOME-default lane fallback — NEVER the fake root', g.guard?.ok === true && g.guard?.insideFakeRoot === false && g.guard?.inFallbackLane === true, JSON.stringify(g.guard));
    check('B3 the guard-mode server is real (polled green) + stops clean', g.green?.running === true && g.guardStop?.ok === true && g.guardStop?.portFree === true, JSON.stringify({ green: g.green, guardStop: g.guardStop }));
    check('B2 zero orphans in guard mode (pid reaped + sweep silent)', g.guardOrphan?.esrch === true && g.sweepPortSilent === true, JSON.stringify(g.guardOrphan));
  }
  console.log(`      guard fixture pids (created + killed by this suite): ${JSON.stringify(guard.pids ?? [])}`);

  // ─── intake02 mode (#112, PREVIEW-2): the intake-created project (the
  // note's path IS 02_Projects/<slug>, no workspace-lane copy) must start,
  // probe green, and stop clean. RED before the cure: the workspace-lane-only
  // derivation refused — SMOKE-1's live refusal reproduced in a fixture. ────
  {
    const I = child('intake02');
    if (I.__err) { check('A13/#112 the intake02 child ran', false, I.__err); }
    else {
      const s = I.steps;
      check('A13/#112 the fixture is honestly legless: NO workspace-lane copy exists (the intake shape)',
        s.laneCopyExists === false, `laneCopyExists=${s.laneCopyExists}`);
      check('A13/#112 start ACCEPTS the intake-registered project (reconcile-aware resolution)',
        s.started?.ok === true, JSON.stringify(s.started).slice(0, 280));
      check('A13/#112 the spawn lands in the 02_Projects project dir (the note path — never the legacy empty workspace derivation)',
        s.started?.projectPath === s.intakeDir, `projectPath=${s.started?.projectPath} intakeDir=${s.intakeDir}`);
      check('A13/#112 probe-green end-to-end (running + latency + url)',
        s.status?.running === true && typeof s.status?.responseTimeMs === 'number' && !!s.status?.url, JSON.stringify(s.status ?? null).slice(0, 240));
      check('A13/#112 the served page answers HTTP 200 with the fixture marker',
        s.http?.status === 200 && s.http?.marker === true, JSON.stringify(s.http ?? null));
      check('A13/#112 clean stop, state file gone, zero orphans (the port silent)',
        s.afterStop?.running === false && s.stateGone === true && s.portSilent === true,
        JSON.stringify({ afterStop: s.afterStop?.running, stateGone: s.stateGone, portSilent: s.portSilent }));
    }
  }

  // ─── orphanlane mode (#113, PLANO-MASTER-1 B2): the user's UAT shape — the
  // intake home in 02_Projects + an orphan lane copy with content. The spawn
  // must land in the HOME and serve THE HOME's page; the orphan is never the
  // spawn dir. RED pre-cure: the note-stale decision serves the orphan. ────
  {
    const O = child('orphanlane');
    if (O.__err) { check('A15/#113 the orphanlane child ran', false, O.__err); }
    else {
      const s = O.steps;
      check('A15/#113 the fixture is honest: the orphan lane copy EXISTS with divergent content',
        s.orphanCopyExists === true, `orphanCopyExists=${s.orphanCopyExists}`);
      check('A15/#113 start accepts the project (the collision does not refuse)',
        s.started?.ok === true, JSON.stringify(s.started).slice(0, 280));
      check('A15/#113 THE HOME WINS: the spawn lands in 02_Projects — NEVER the orphan lane (the user\'s UAT case)',
        s.started?.projectPath === s.intakeDir && s.started?.projectPath !== s.orphanDir,
        `projectPath=${s.started?.projectPath} intakeDir=${s.intakeDir}`);
      check('A15/#113 probe-green end-to-end (running + latency + url)',
        s.status?.running === true && typeof s.status?.responseTimeMs === 'number' && !!s.status?.url,
        JSON.stringify(s.status ?? null).slice(0, 240));
      check('A15/#113 the served page is THE HOME\'S (the home marker, never the orphan marker)',
        s.http?.status === 200 && s.http?.homeMarker === true && s.http?.orphanMarker === false,
        JSON.stringify(s.http ?? null));
      check('A15/#113 clean stop, state file gone, zero orphans (the port silent)',
        s.afterStop?.running === false && s.stateGone === true && s.portSilent === true,
        JSON.stringify({ afterStop: s.afterStop?.running, stateGone: s.stateGone, portSilent: s.portSilent }));
    }
  }

  // ─── unknownslug mode (#112 refusal preservation): an UNKNOWN slug (no
  // note, no lane dir) still earns the honest refusal — the doctrine is
  // scoped by the fix, never weakened. ─────────────────────────────────────
  {
    const U = child('unknownslug');
    check('A14/#112 refusal preserved: the unknown slug gets the honest no-lane refusal (never a narrated spawn)',
      !U.__err && U.steps?.unknown?.ok === false && /no lane project directory at/.test(U.steps?.unknown?.error || ''),
      JSON.stringify(U).slice(0, 280));
  }


  // ─── content pins (the module source) ────────────────────────────────────
  let src = '';
  try { src = readFileSync(MODULE, 'utf-8'); } catch {}
  check('C1 the spawn is DETACHED (detached: true) — the interactive lane cannot host a durable process', /detached:\s*true/.test(src), 'the #105 lesson: detached is what makes the manager durable');
  check('C2 the spawned child is unref()d — the server survives the spawning session', /\.unref\(\)/.test(src), '');
  check('C3 the insideOlympusRoot guard runs before spawn (the #99 never-the-repo shape)', /insideOlympusRoot/.test(src), 'the manager must refuse any project path inside the OLYMPUS root');
  check('C4 status truth is probeDevServer (the #102 dual-stack probe, reused — the only source of "running")', /probeDevServer\(/.test(src), '');
  check('C5 the stop ladder: SIGTERM first, SIGKILL the disclosed last resort', /SIGTERM/.test(src) && /SIGKILL/.test(src), '');
  check('C6/#112 the manager resolves the project dir through reconcileProjectPath (the #103 lane-aware truth) — never the bare lane root',
    /reconcileProjectPath\(/.test(src) && /reconciled\.path !== laneDirRoot|reconciled!?\.\s*path/.test(src), 'the workspaceLaneDir()-only derivation is still the only source (the #112 seam intact)');
  check('C7/port-args: the spawn argv is dev-script-shape-aware (the vite class gets --port --strictPort; the next class keeps -p) — the live garnish\'s CACError class pinned',
    /devServerPortArgs/.test(src) && /--strictPort/.test(src), 'the one-flag-fits-all -p spawn is still the only shape (vite rejects it — live evidence preview-2/s4)');
}

// ─── devServerPortArgs unit table (PREVIEW-2 garnish cure) — RED pre-fix ────
{
  let mod2 = null;
  try { mod2 = await import(MODULE); } catch { /* RED */ }
  const f = mod2?.devServerPortArgs;
  check('U-port/#112b devServerPortArgs exported', typeof f === 'function', 'missing — the vite-class argv has no shape resolver');
  if (typeof f === 'function') {
    check("U-port/#112b vite dev script -> --port N --strictPort (Never the bare -p; the port stays the probe's truth)",
      JSON.stringify(f('vite --host 127.0.0.1', 3080)) === JSON.stringify(['--port', '3080', '--strictPort']), JSON.stringify(f('vite --host 127.0.0.1', 3080)));
    check("U-port/#112b the next/default class keeps -p N (the SERVE-1 shape untouched)",
      JSON.stringify(f('next dev', 3080)) === JSON.stringify(['-p', '3080']), JSON.stringify(f('next dev', 3080)));
    check("U-port/#112b a bare node dev script keeps -p N (the suite fixtures' shape)",
      JSON.stringify(f('node fixture-server.js', 3080)) === JSON.stringify(['-p', '3080']), JSON.stringify(f('node fixture-server.js', 3080)));
    check("U-port/#112b unproven dialects keep the SERVE-1 shape (-p + the threaded PORT env) — no invented flags",
      JSON.stringify(f('react-scripts start', 3000)) === JSON.stringify(['-p', '3000']), JSON.stringify(f('react-scripts start', 3000)));
  }
}

if (fails > 0) { console.error(`\n${fails}/${checked} dev-server-manager assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} dev-server-manager assertions passed`);
