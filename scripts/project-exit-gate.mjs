#!/usr/bin/env node
/**
 * project-exit-gate.mjs — THE GENERATED-PROJECT EXIT GATE (MADRUGA-FIX-1, F1).
 *
 * "A generated project runs on the first try" as a STRUCTURAL property:
 * the gate is the done-condition for generated projects, wired at BOTH
 * invocation points (the generator's done-condition AND the driver's
 * census — replacing the byte-counting gate that scored never-rendering
 * projects as completed: BENCH-IN-1 P-A/P-H, register D10/D30, decision F6).
 *
 * Usage: node scripts/project-exit-gate.mjs <projectDir> [--json]
 *                                            [--skip-build] [--label NAME]
 *        OLYMPUS_GATE_SKIP_BUILD=1 == --skip-build (EDQUOT degrade).
 *
 * The seven checks (all attempted; failures collect — never a bare exit 1):
 *   1 lockfile        package-lock.json present (P-G)
 *   2 npm-ci          `npm ci` exit 0 (P-B — phantom versions/manifest drift
 *                     die here, deterministically)
 *   3 build           `npm run build` exit 0 (P-D/P-F — invalid @apply and
 *                     malformed JSX die here). EDQUOT/R5: generated projects
 *                     are small; if the build quota blocks, --skip-build
 *                     degrades LOUDLY (LIVE-PROBE-SKIPPED) — never silently.
 *   4 dev-curl-200   `next dev` on an EPHEMERAL port + GET / == HTTP 200,
 *                     then the gate kills its own dev server (no lingering
 *                     processes, no pidfiles; R6 ports 3737/3738/3740/3777
 *                     untouched — the ephemeral range is 21000+).
 *   5 symlinks        zero ABSOLUTE symlinks under the dir (P-E)
 *   6 imports-deps    every imported bare package is declared (P-B)
 *   7 composition     app/page.tsx exists and COMPOSES the kit (imports the
 *                     built sections/components — the D30 composition
 *                     metric; NO byte ruler: the retired 2000-byte bar
 *                     false-positived a real 1780B page, the G4 specimen).
 *                     Pairs with check 4 — the page must exist, compose,
 *                     and render (P-A)
 *
 * Exit codes: 0 all-pass; 1 any fail; 2 usage error. The structured report
 * (project-named, per-check status + detail) always prints.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import {
  existsSync, lstatSync, readFileSync, readlinkSync, readdirSync, statSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const projectDirArg = args.find(a => !a.startsWith('--'));
const FLAG_JSON = args.includes('--json');
const SKIP_BUILD = args.includes('--skip-build') || process.env.OLYMPUS_GATE_SKIP_BUILD === '1';
const labelIdx = args.indexOf('--label');
const LABEL = labelIdx >= 0 ? args[labelIdx + 1] : (projectDirArg ? projectDirArg.split('/').filter(Boolean).pop() || 'unnamed' : 'unnamed');

const results = [];
const add = (id, name, status, detail) => results.push({ id, name, status, detail });

function usageFail(msg) {
  const report = { gate: 'project-exit-gate', project: LABEL, dir: projectDirArg || null, verdict: 'FAIL', checks: [{ id: '0', name: 'usage', status: 'fail', detail: msg }] };
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

if (!projectDirArg) usageFail('usage: node scripts/project-exit-gate.mjs <projectDir> [--json] [--skip-build] [--label NAME] (exit 2 was reserved for usage; this report IS the failure)');
const PROJECT = resolve(projectDirArg);
if (!existsSync(PROJECT) || !statSync(PROJECT).isDirectory()) usageFail(`project dir not found: ${PROJECT}`);

const run = (cmd, cmdArgs, cwd, timeoutMs = 300_000) => {
  const r = spawnSync(cmd, cmdArgs, { cwd, encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.slice(-4000) };
};

// ── (1) lockfile (P-G) ───────────────────────────────────────────────────────
const lockPath = join(PROJECT, 'package-lock.json');
const hasLockfile = existsSync(lockPath);
add('1', 'lockfile', hasLockfile ? 'pass' : 'fail',
  hasLockfile ? 'package-lock.json present' : 'package-lock.json MISSING (P-G: same zip, same behavior on every machine — a project without a pin is not done)');

// ── (2) npm ci (P-B) ─────────────────────────────────────────────────────────
let ciOk = false;
if (!hasLockfile) {
  add('2', 'npm-ci', 'fail', 'unrunnable: no lockfile to install from (fix check 1 first)');
} else {
  const r = run('npm', ['ci', '--no-audit', '--no-fund'], PROJECT, 300_000);
  ciOk = r.code === 0;
  add('2', 'npm-ci', ciOk ? 'pass' : 'fail',
    ciOk ? 'npm ci exit 0' : `npm ci FAILED (P-B: phantom versions / manifest-vs-lock drift die here) — exit ${r.code}:\n${r.out.slice(-1200)}`);
}

// ── (3) build (P-D/P-F) ──────────────────────────────────────────────────────
let buildPassed = false;
if (SKIP_BUILD) {
  add('3', 'build', 'skipped',
    'LIVE-PROBE-SKIPPED (EDQUOT/R5 protocol degrade, EXPLICIT — never silent): the build step was skipped by flag/env; dev+curl-200 (check 4) is still enforced.');
} else if (!ciOk) {
  add('3', 'build', 'skipped', 'unrunnable: npm ci did not pass (fix check 2 first)');
} else {
  const r = run('npm', ['run', 'build'], PROJECT, 420_000);
  buildPassed = r.code === 0;
  add('3', 'build', buildPassed ? 'pass' : 'fail',
    buildPassed ? 'npm run build exit 0' : `npm run build FAILED (P-D/P-F: invalid @apply + malformed JSX die here) — exit ${r.code}:\n${r.out.slice(-1200)}`);
}

// ── (4) dev + curl == 200 (ephemeral port, self-cleaning) ─────────────────────
const devRunnable = SKIP_BUILD ? ciOk : buildPassed;
if (!devRunnable) {
  add('4', 'dev-curl-200', 'skipped', `unrunnable: ${SKIP_BUILD ? 'npm ci' : 'build'} did not pass (fix the earlier check first)`);
} else {
  const port = await freeEphemeralPort();
  let devProc = null;
  try {
    devProc = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--hostname', '127.0.0.1'],
      { cwd: PROJECT, env: { ...process.env, PORT: String(port), NODE_ENV: 'development' }, detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
    const code = await waitForHttp(`http://127.0.0.1:${port}/`, 90_000);
    if (code === 200) {
      add('4', 'dev-curl-200', 'pass', `next dev (ephemeral port ${port}) + GET / == HTTP 200`);
    } else {
      add('4', 'dev-curl-200', 'fail', `GET / ${code === null ? 'never answered (timeout)' : `returned HTTP ${code}`} on the ephemeral dev server (P-A/P-H: a route that does not render HTTP 200 is not done)`);
    }
  } catch (e) {
    add('4', 'dev-curl-200', 'fail', `dev server probe failed: ${e.message}`);
  } finally {
    if (devProc && devProc.pid) {
      try { process.kill(-devProc.pid, 'SIGKILL'); } catch { try { devProc.kill('SIGKILL'); } catch {} }
      try { devProc.unref(); } catch {}
    }
    // Gate hygiene: verify the port was released — no lingering dev servers.
    // (SIGKILL teardown is asynchronous: poll up to 10s before flagging.)
    let released = false;
    for (let i = 0; i < 40 && !released; i++) {
      released = await portIsFree(port);
      if (!released) await new Promise(r => setTimeout(r, 250));
    }
    if (!released) {
      const r4 = results.find(x => x.id === '4');
      r4.status = 'fail';
      r4.detail += `\nGATE HYGIENE FAILURE: ephemeral port ${port} STILL LISTENING after kill — the gate must clean up after itself.`;
    }
  }
}

// ── (5) zero absolute symlinks (P-E) ─────────────────────────────────────────
const absoluteSymlinks = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.next', 'out', 'dist', 'build', '.turbo', '_next'].includes(entry.name)) continue;
    const p = join(dir, entry.name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      let target = null;
      try { target = readlinkSync(p); } catch { /* unreadable */ }
      if (target === null || isAbsolute(target) || target.startsWith('/home/')) {
        absoluteSymlinks.push(`${p} -> ${target ?? '(unreadable)'}`);
      }
    } else if (st.isDirectory()) {
      walk(p);
    }
  }
})(PROJECT);
add('5', 'symlinks', absoluteSymlinks.length === 0 ? 'pass' : 'fail',
  absoluteSymlinks.length === 0 ? 'zero absolute symlinks under the project (P-E)' : `ABSOLUTE SYMLINKS (P-E: deliverables must be portable — copy or exclude, never symlink out):\n  ${absoluteSymlinks.join('\n  ')}`);

// ── (6) imports vs deps (P-B) ────────────────────────────────────────────────
const pkg = (() => { try { return JSON.parse(readFileSync(join(PROJECT, 'package.json'), 'utf-8')); } catch { return null; } })();
const declared = new Set([...Object.keys(pkg?.dependencies || {}), ...Object.keys(pkg?.devDependencies || {})]);
const NODE_BUILTINS = new Set(['assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http', 'https', 'module', 'net', 'os', 'path', 'process', 'querystring', 'stream', 'string_decoder', 'timers', 'tty', 'url', 'util', 'vm', 'worker_threads', 'zlib']);
const undeclared = new Set();
const importRe = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
(function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', 'out', 'dist', 'build', '.turbo', '_next'].includes(entry.name)) continue;
    const p = join(dir, entry.name);
    const st = lstatSync(p);
    if (st.isDirectory()) scan(p);
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) {
      const src = readFileSync(p, 'utf-8');
      for (const m of src.matchAll(importRe)) {
        const spec = m[1];
        if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('node:') || spec.startsWith('~')) continue;
        const parts = spec.split('/');
        const pkgName = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
        if (NODE_BUILTINS.has(pkgName)) continue;
        if (!declared.has(pkgName)) undeclared.add(`${pkgName} (imported in ${relative(PROJECT, p)})`);
      }
    }
  }
})(PROJECT);
add('6', 'imports-deps', undeclared.size === 0 ? 'pass' : 'fail',
  undeclared.size === 0 ? 'every imported package is declared (P-B)' : `USED-UNDECLARED packages (P-B: the manifest must declare what the code imports):\n  ${[...undeclared].join('\n  ')}`);

// ── (7) route composition (P-A) ───────────────────────────────────────────────
// The OLD byte-counting metric is dead (D30: file count/bytes ≠ completeness).
// Composition = the route entry EXISTS and COMPOSES the built kit (imports at
// least one local module — sections/components), with check 4 proving it
// actually renders HTTP 200. Content QUALITY stays with Phase 3's ruler
// (AUD-2 open) — the gate is structural, not aesthetic.
const pageCandidates = [
  join(PROJECT, 'src', 'app', 'page.tsx'), join(PROJECT, 'app', 'page.tsx'),
  join(PROJECT, 'src', 'app', 'page.jsx'), join(PROJECT, 'app', 'page.jsx'),
];
const page = pageCandidates.find(p => existsSync(p));
if (!page) {
  add('7', 'composition', 'fail', 'app/page.tsx MISSING (P-A: a kit without a route entry is not a landing — compose app/layout.tsx + app/page.tsx from the built sections)');
} else {
  const src = readFileSync(page, 'utf-8');
  const composesKit = /(?:import|from)[^;]*["'](\.\/|\.\.\/)/.test(src)
    || /(?:import|from)[^;]*["']@\/(?:components|sections|lib|app)\//.test(src);
  add('7', 'composition', composesKit ? 'pass' : 'fail',
    composesKit
      ? `route entry present and COMPOSED (imports the built kit — ${statSync(page).size} bytes; check 4 proves it renders)`
      : 'app/page.tsx present but does NOT compose the kit (zero local imports — a route entry must render the built sections/components; pairs with check 4)');
}

// ── Report ───────────────────────────────────────────────────────────────────
const fails = results.filter(r => r.status === 'fail');
const skippedCount = results.filter(r => r.status === 'skipped').length;
const verdict = fails.length === 0 ? (skippedCount ? 'PASS-WITH-SKIPS' : 'PASS') : 'FAIL';
const report = {
  gate: 'project-exit-gate',
  project: LABEL,
  dir: PROJECT,
  verdict,
  checks: results,
};
if (FLAG_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\n=== project-exit-gate: ${LABEL} ===`);
  for (const r of results) {
    const mark = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'SKIP';
    console.log(`  [${mark}] ${r.id}. ${r.name}${r.status !== 'pass' ? `\n        ${r.detail.replace(/\n/g, '\n        ')}` : ''}`);
  }
  console.log(`  verdict: ${verdict}\n`);
}
process.exit(fails.length === 0 ? 0 : 1);

// ── helpers ──────────────────────────────────────────────────────────────────
async function freeEphemeralPort() {
  for (let i = 0; i < 25; i++) {
    const port = 21000 + Math.floor(Math.random() * 3000);
    if (await portIsFree(port)) return port;
  }
  throw new Error('no free ephemeral port in 21000-24000');
}
function portIsFree(port) {
  return new Promise(res => {
    const probe = createServer();
    probe.once('error', () => res(false));
    probe.once('listening', () => { probe.close(() => res(true)); });
    probe.listen(port, '127.0.0.1');
  });
}
async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  let lastCode = null;
  while (Date.now() - started < timeoutMs) {
    lastCode = await fetchCode(url);
    if (lastCode === 200) return 200;
    await new Promise(r => setTimeout(r, 1500));
  }
  return lastCode;
}
async function fetchCode(url) {
  try {
    const resp = await fetch(url, { redirect: 'manual' });
    return resp.status;
  } catch {
    return null;
  }
}
