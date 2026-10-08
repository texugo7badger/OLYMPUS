#!/usr/bin/env node
/**
 * dispatch-cwd.test.mjs — MADRUGA-PREVIEW-1 Batch C: the one-shot dispatch
 * cwd (#104) — EXTENDED by MADRUGA-SERVE-1 Batch C to the COMPLETE CLASS:
 * every spawnOpencode call site in src/ carries an explicit lane-preference
 * cwd (resolveDispatchCwd or the serve's own #99 lane), never the inherited
 * repo-root default. RED-first, child-gate env pattern (per athena-click.test.mjs).
 *
 *   resolve mode — unit resolveDispatchCwd(projectSlug?):
 *     slug given + <lane>/<slug> exists → that dir;
 *     slug given, dir missing → the lane dir;
 *     null slug → the lane dir.
 *     NEVER the repo root, never inside it.
 *   guard mode — OLYMPUS_WORKSPACE pointing inside a fake OLYMPUS root →
 *     the default lane (never the fake root, never the real repo).
 *
 *   Content pins:
 *     the athena/edit lane threads resolveDispatchCwd(projectSlug) (#104);
 *     the six follow-up sites (heartbeat, action x2, intake, doc-summarizer,
 *     compact) each carry cwd: resolveDispatchCwd(...) — the complete class;
 *     the INVARIANT: EVERY spawnOpencode call in src/ (outside the
 *     definition file) carries an explicit cwd: — no site anywhere spawns
 *     with the inherited repo-root default.
 *
 * Run: npx tsx scripts/dispatch-cwd.test.mjs (exit 0)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF = join(ROOT, 'scripts', 'dispatch-cwd.test.mjs');
const WORK = join(tmpdir(), 'olympus-p1-dispatch-cwd');

let fails = 0, checked = 0;
const check = (n, ok, d = '') => { checked++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -- ${String(d).slice(0, 300)}`}`); if (!ok) fails++; };

const child = (mode) => {
  const fake = join(WORK, `fake-${mode}`), home = join(WORK, `home-${mode}`), lane = join(WORK, `lane-${mode}`);
  for (const d of [fake, home, lane]) mkdirSync(d, { recursive: true });
  // the fake OLYMPUS root must look like one to findOlympusRoot()
  writeFileSync(join(fake, 'opencode.json'), JSON.stringify({ agent: {} }));
  const env = {
    ...process.env,
    OLYMPUS_ROOT: fake,
    OLYMPUS_HOME: home,
    // guard mode: the workspace points INSIDE the fake root — the resolver must refuse it
    OLYMPUS_WORKSPACE: mode === 'guard' ? join(fake, 'workspace') : lane,
  };
  const r = spawnSync('npx', ['tsx', SELF, 'child', mode], { encoding: 'utf-8', cwd: ROOT, timeout: 180_000, env });
  if (r.status !== 0) return { __err: `${r.status} ${r.stdout?.slice(-300)} ${r.stderr?.slice(-500)}` };
  return JSON.parse(r.stdout.trim().split('\n').filter(Boolean).pop());
};

if (process.argv[2] !== 'child') { rmSync(WORK, { recursive: true, force: true }); mkdirSync(WORK, { recursive: true }); }

if (process.argv[2] === 'child') {
  const mode = process.argv[3];
  const lane = process.env.OLYMPUS_WORKSPACE;
  const fakeRoot = process.env.OLYMPUS_ROOT;
  const { resolveDispatchCwd } = await import('../src/lib/opencode-spawn.ts');
  const out = { mode, fakeRoot };
  if (mode === 'resolve') {
    mkdirSync(join(lane, 'example-project'), { recursive: true });
    out.withSlug = resolveDispatchCwd('example-project');
    out.slugDirExists = true;
    out.missingSlug = resolveDispatchCwd('no-such-project');
    out.nullSlug = resolveDispatchCwd(null);
    out.undefinedSlug = resolveDispatchCwd();
  }
  if (mode === 'guard') {
    mkdirSync(join(lane, 'example-project'), { recursive: true });
    out.guarded = resolveDispatchCwd('example-project');
    out.guardedNull = resolveDispatchCwd(null);
  }
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

// ─── resolve mode (the unit contract) ────────────────────────────────────────
{
  const R = child('resolve');
  if (R.__err) { check('the resolve child ran', false, R.__err); }
  else {
    const lane = join(WORK, 'lane-resolve');
    check('slug + <lane>/<slug> exists → the PROJECT dir',
      R.withSlug === join(lane, 'example-project'), `got=${R.withSlug}`);
    check('slug given, dir missing → the LANE dir (never the repo root)',
      R.missingSlug === lane, `got=${R.missingSlug}`);
    check('null slug → the LANE dir', R.nullSlug === lane, `got=${R.nullSlug}`);
    check('undefined slug → the LANE dir', R.undefinedSlug === lane, `got=${R.undefinedSlug}`);
  }
}

// ─── guard mode (never the repo, never inside it) ─────────────────────────────
{
  const G = child('guard');
  if (G.__err) { check('the guard child ran', false, G.__err); }
  else {
    const fakeRoot = G.fakeRoot;
    const insideFake = (p) => p === fakeRoot || p.startsWith(fakeRoot + '/');
    const insideRealRepo = (p) => p === ROOT || p.startsWith(ROOT + '/');
    check('guard: OLYMPUS_WORKSPACE inside the OLYMPUS root → the default lane, never the fake root',
      !insideFake(G.guarded) && !insideFake(G.guardedNull), `guarded=${G.guarded} null=${G.guardedNull}`);
    check('guard: never the REAL repo root, never inside it',
      !insideRealRepo(G.guarded) && !insideRealRepo(G.guardedNull), `guarded=${G.guarded} null=${G.guardedNull}`);
  }
}

// ─── content pins (#104's own lane, athena/edit) ─────────────────────────────
{
  const route = readFileSync(join(ROOT, 'src', 'app', 'api', 'olympus', 'athena', 'edit', 'route.ts'), 'utf-8');
  check('pin: athena/edit imports resolveDispatchCwd (the lane-preference resolver)',
    /resolveDispatchCwd/.test(route) && /from\s+'@\/lib\/opencode-spawn'/.test(route), '');
  check('pin: the spawn threads cwd: resolveDispatchCwd(projectSlug) — the dispatch lands in the project, never the repo',
    /spawnOpencode\([\s\S]*?cwd:\s*resolveDispatchCwd\(projectSlug\)/.test(route), '');
  // the invariant: EVERY spawnOpencode CALL in the route carries an explicit
  // cwd (comment mentions are skipped — only real calls count)
  let callsWithoutCwd = 0, callCount = 0;
  const lines = route.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].indexOf('spawnOpencode(');
    if (at === -1) continue;
    const before = lines[i].slice(0, at).trim();
    if (before.startsWith('//') || before.startsWith('*') || before.startsWith('/*')) continue;
    callCount++;
    const window = lines.slice(i, i + 20).join('\n');
    if (!/cwd:/.test(window)) callsWithoutCwd++;
  }
  check('pin (invariant): the route no longer spawns without an explicit cwd (every spawnOpencode call carries cwd:)',
    callCount >= 1 && callsWithoutCwd === 0, `${callsWithoutCwd}/${callCount} calls without cwd`);
}

// ─── SERVE-1 Batch C: the COMPLETE dispatch-cwd class ─────────────────────────
{
  // (1) per-site pins: each of the six follow-up sites carries the
  //     lane-preference resolver on its spawn.
  const sites = [
    { file: 'src/app/api/olympus/callimachus/heartbeat/route.ts', name: 'heartbeat', expect: /cwd:\s*resolveDispatchCwd\(\)/ },
    { file: 'src/app/api/olympus/action/route.ts', name: 'action (the bookkeeping lane + the one-shot fallback)', expect: /cwd:\s*resolveDispatchCwd\(\)/, count: 2 },
    { file: 'src/app/api/olympus/intake/route.ts', name: 'intake (the project slug threaded)', expect: /cwd:\s*resolveDispatchCwd\(result\.project\?\.slug/ },
    { file: 'src/lib/doc-summarizer.ts', name: 'doc-summarizer', expect: /cwd:\s*resolveDispatchCwd\(\)/ },
    { file: 'src/app/api/olympus/compact/route.ts', name: 'compact (the shim)', expect: /cwd:\s*resolveDispatchCwd\(\)/ },
  ];
  for (const s of sites) {
    const src = readFileSync(join(ROOT, s.file), 'utf-8');
    const hits = src.match(new RegExp(s.expect, 'g'))?.length ?? 0;
    check(`class pin: ${s.name} carries cwd: resolveDispatchCwd(...) — never the inherited repo root`,
      hits >= (s.count ?? 1), `hits=${hits} in ${s.file}`);
  }

  // (2) the GLOBAL invariant: EVERY spawnOpencode call site in src/ (outside
  //     the definition file) carries an explicit cwd: — no site anywhere
  //     spawns with the repo-root default getOpencodeSpawnOptions returns.
  const walk = (dir, acc = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) acc.push(p);
    }
    return acc;
  };
  const offenders = [];
  let totalCalls = 0;
  for (const f of walk(join(ROOT, 'src'))) {
    if (f.endsWith(join('src', 'lib', 'opencode-spawn.ts'))) continue; // the definition file
    const lines = readFileSync(f, 'utf-8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const at = lines[i].indexOf('spawnOpencode(');
      if (at === -1) continue;
      const before = lines[i].slice(0, at).trim();
      if (before.startsWith('//') || before.startsWith('*') || before.startsWith('/*')) continue;
      totalCalls++;
      const window = lines.slice(i, i + 20).join('\n');
      if (!/cwd:/.test(window)) offenders.push(`${f.replace(ROOT + '/', '')}:${i + 1}`);
    }
  }
  check('class pin (GLOBAL invariant): EVERY spawnOpencode call site in src/ carries an explicit cwd:',
    totalCalls >= 8 && offenders.length === 0,
    `${offenders.length}/${totalCalls} call sites without cwd: ${offenders.join(', ') || '(none)'}`);
}

rmSync(WORK, { recursive: true, force: true });
if (fails > 0) { console.error(`\n${fails}/${checked} dispatch-cwd assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} dispatch-cwd assertions passed`);
