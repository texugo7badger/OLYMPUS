#!/usr/bin/env node
/**
 * project-context.test.mjs — MADRUGA-PREVIEW-1 Batch B: the note/lane
 * reconciliation (#103). RED-first, child-gate env pattern (per
 * athena-click.test.mjs: OLYMPUS_VAULT/OLYMPUS_HOME/OLYMPUS_ROOT tmp dirs —
 * the real vault/note/lane are never touched).
 *
 *   reconcile mode — the reconciliation contract:
 *     (1) note path MISSING on disk + <lane>/<slug> exists → repoints the
 *         note (returns the lane path, noteUpdated true)
 *     (2) note path EXISTS (a bench fossil) + lane copy exists → returns
 *         the lane path, does NOT write (source 'note-stale' — surfaced,
 *         never clobbered; the note on disk unchanged)
 *     (3) no note → null-safe
 *     (4) healthy note (path == lane, alive) → the note path, no write
 *   guard mode — a path inside the OLYMPUS root is never resolved into:
 *     OLYMPUS_WORKSPACE pointing inside a fake OLYMPUS root → the resolver
 *     falls back (never the repo); reconcileProjectPath never returns a
 *     path inside the root (the #99 incident shape: a note pointing into
 *     the repo). inroot mode — the same note shape WITH a lane copy in a
 *     valid lane → self-heal to the lane (the fossil repointed).
 *
 *   Content pins: the status route response carries path + pathSource; the
 *   component's tip renders the RESOLVED path + the one dim stale-note line.
 *
 * Run: npx tsx scripts/project-context.test.mjs (exit 0)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SELF = join(ROOT, 'scripts', 'project-context.test.mjs');
const WORK = join(tmpdir(), 'olympus-p1-note-lane');

let fails = 0, checked = 0;
const check = (n, ok, d = '') => { checked++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `  -- ${String(d).slice(0, 300)}`}`); if (!ok) fails++; };

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
  const vault = process.env.OLYMPUS_VAULT;
  const projectsDir = join(vault, '02_Projects');
  mkdirSync(projectsDir, { recursive: true });

  const note = (slug, path) => {
    const dir = join(projectsDir, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'project.md'), `---\ntype: project\nslug: ${slug}\nname: ${slug}\npath: ${path}\nstacks: []\ncreated: 2026-10-08T00:00:00.000Z\nlast_active: 2026-10-08T00:00:00.000Z\nlivePreviewPort: 3001\n---\n\nbody\n`);
  };
  const notePathNow = (slug) => {
    const raw = readFileSync(join(projectsDir, slug, 'project.md'), 'utf-8');
    const m = raw.match(/^path:\s*(.*)$/m);
    return m ? m[1].trim() : null;
  };

  const { reconcileProjectPath } = await import('../src/lib/project-context.ts');
  const { workspaceLaneDir } = await import('../src/lib/opencode-spawn.ts');
  const out = { mode };

  out.laneDir = workspaceLaneDir();
  out.laneDirInsideRoot = out.laneDir === fakeRoot || out.laneDir.startsWith(fakeRoot + '/');

  if (mode === 'reconcile') {
    // (1) the self-heal: note path MISSING on disk + lane copy exists
    mkdirSync(join(lane, 'case-heal'), { recursive: true });
    note('case-heal', join(WORK, 'missing', 'case-heal'));
    const r1 = reconcileProjectPath('case-heal');
    out.heal = { result: r1, noteAfter: notePathNow('case-heal') };

    // (2) the fossil: note path EXISTS on disk (a bench fossil) + lane copy exists
    mkdirSync(join(lane, 'case-stale'), { recursive: true });
    mkdirSync(join(WORK, 'bench-fossil', 'case-stale'), { recursive: true });
    note('case-stale', join(WORK, 'bench-fossil', 'case-stale'));
    const r2 = reconcileProjectPath('case-stale');
    out.stale = { result: r2, noteAfter: notePathNow('case-stale') };

    // (3) no note → null-safe
    out.none = reconcileProjectPath('case-no-such-note');

    // (3b) null slug → null-safe
    out.noneSlug = reconcileProjectPath(null);

    // (4) healthy: note path == the lane copy, alive → the note path, no write
    mkdirSync(join(lane, 'case-healthy'), { recursive: true });
    note('case-healthy', join(lane, 'case-healthy'));
    const r4 = reconcileProjectPath('case-healthy');
    out.healthy = { result: r4, noteAfter: notePathNow('case-healthy') };
  }

  if (mode === 'guard') {
    // a note pointing INSIDE the OLYMPUS root with NO lane copy in the
    // EFFECTIVE lane (the refused workspace falls back to the default) →
    // never resolved into: the lane dir itself, no write.
    mkdirSync(join(fakeRoot, 'stray-project'), { recursive: true });
    note('case-inroot', join(fakeRoot, 'stray-project'));
    out.inRoot = reconcileProjectPath('case-inroot');
    out.inRootInside = out.inRoot ? (out.inRoot.path === fakeRoot || out.inRoot.path.startsWith(fakeRoot + '/')) : null;
    out.inRootNoteAfter = notePathNow('case-inroot');
  }

  if (mode === 'inroot') {
    // a note pointing INSIDE the OLYMPUS root + a lane copy in the VALID tmp
    // lane → self-heal to the lane (the #99 incident shape, cured).
    mkdirSync(join(fakeRoot, 'stray-project'), { recursive: true });
    mkdirSync(join(lane, 'case-inroot2'), { recursive: true });
    note('case-inroot2', join(fakeRoot, 'stray-project'));
    out.inRootHeal = reconcileProjectPath('case-inroot2');
    out.inRootHealInside = out.inRootHeal ? (out.inRootHeal.path === fakeRoot || out.inRootHeal.path.startsWith(fakeRoot + '/')) : null;
    out.inRootHealNoteAfter = notePathNow('case-inroot2');
  }

  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

// ─── reconcile mode ─────────────────────────────────────────────────────────
{
  const R = child('reconcile');
  if (R.__err) { check('the reconcile child ran', false, R.__err); }
  else {
    const lane = join(WORK, 'lane-reconcile');
    check('(1) missing note path + lane copy → returns the LANE path',
      R.heal?.result?.path === join(lane, 'case-heal'), JSON.stringify(R.heal?.result).slice(0, 200));
    check('(1) the note is repointed (noteUpdated true) and the note on disk now carries the lane path',
      R.heal?.result?.noteUpdated === true && R.heal?.noteAfter === join(lane, 'case-heal'),
      `noteAfter=${R.heal?.noteAfter}`);
    check('(2) alive fossil + lane copy → returns the LANE path with source note-stale',
      R.stale?.result?.path === join(lane, 'case-stale') && R.stale?.result?.source === 'note-stale',
      JSON.stringify(R.stale?.result).slice(0, 200));
    check('(2) the fossil is surfaced, never clobbered (noteUpdated false, the note on disk unchanged)',
      R.stale?.result?.noteUpdated === false && R.stale?.noteAfter === join(WORK, 'bench-fossil', 'case-stale'),
      `noteAfter=${R.stale?.noteAfter}`);
    check('(3) no note → null (null-safe)', R.none === null, JSON.stringify(R.none));
    check('(3b) null slug → null (null-safe)', R.noneSlug === null, JSON.stringify(R.noneSlug));
    check('(4) healthy note (path == lane) → the note path, source note, no write',
      R.healthy?.result?.path === join(lane, 'case-healthy') && R.healthy?.result?.source === 'note' && R.healthy?.result?.noteUpdated === false,
      JSON.stringify(R.healthy?.result).slice(0, 200));
    check('the lane resolution never created the lane at import (the pure resolver — no side effects on the GET probe path)',
      existsSync(lane), `lane=${lane}`);
  }
}

// ─── guard mode ──────────────────────────────────────────────────────────────
{
  const G = child('guard');
  if (G.__err) { check('the guard child ran', false, G.__err); }
  else {
    check('guard: workspaceLaneDir refuses OLYMPUS_WORKSPACE inside the OLYMPUS root (falls back, never the repo)',
      G.laneDirInsideRoot === false, `laneDir=${G.laneDir}`);
    check('guard: reconcileProjectPath never returns a path inside the OLYMPUS root (no lane copy → the lane dir itself, no write)',
      G.inRootInside === false && G.inRoot?.source === 'lane' && G.inRoot?.noteUpdated === false && G.inRootNoteAfter?.startsWith(join(WORK, 'fake-guard')) === true,
      JSON.stringify(G.inRoot).slice(0, 200));
  }
}

// ─── inroot mode (the #99 incident shape: note inside the root + lane copy) ──
{
  const I = child('inroot');
  if (I.__err) { check('the inroot child ran', false, I.__err); }
  else {
    check('inroot: a note pointing into the root + a lane copy → self-healed to the lane (outside the root)',
      I.inRootHealInside === false && I.inRootHeal?.source === 'lane' && I.inRootHeal?.noteUpdated === true,
      JSON.stringify(I.inRootHeal).slice(0, 200));
    check('inroot: the note on disk was repointed to the lane (the fossil no longer points into the repo)',
      I.inRootHealNoteAfter === join(WORK, 'lane-inroot', 'case-inroot2'), `noteAfter=${I.inRootHealNoteAfter}`);
  }
}

// ─── content pins (route + component) ────────────────────────────────────────
{
  const route = readFileSync(join(ROOT, 'src', 'app', 'api', 'olympus', 'live-preview', 'route.ts'), 'utf-8');
  check('pin: the status route calls reconcileProjectPath (the lane-aware truth, not the raw note path)',
    /reconcileProjectPath\(/.test(route), '');
  check('pin: the route response carries path + pathSource',
    /path:\s*reconciled\?\.path\b/.test(route) && /pathSource:\s*reconciled\?\.source\b/.test(route), '');

  const comp = readFileSync(join(ROOT, 'src', 'components', 'olympus', 'live-preview.tsx'), 'utf-8');
  check('pin: the component derives the tip path from the RESOLVED status path (note raw path only as fallback)',
    /const\s+resolvedPath\s*=\s*status\?\.path\s*(?:\?\?|\|\|)\s*activeProject\?\.path/.test(comp), '');
  check('pin: the tip renders the resolved path in the cd command',
    /cd\s+"\{resolvedPath\s*\?\?/.test(comp) || /cd\s+"\{resolvedPath\}/.test(comp) || /resolvedPath\s*\?\?\s*'<project>'/.test(comp), '');
  check('pin: the one dim stale-note line exists (a line, not a modal)',
    /note path is stale — the project lives at/.test(comp) && /note-stale/.test(comp), '');
}

rmSync(WORK, { recursive: true, force: true });
if (fails > 0) { console.error(`\n${fails}/${checked} project-context assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} project-context assertions passed`);
