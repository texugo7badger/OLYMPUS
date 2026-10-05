#!/usr/bin/env node
/**
 * project-exit-gate.test.mjs — MADRUGA-FIX-1 F1: the exit gate's RED/GREEN
 * proof. Run: npx tsx scripts/project-exit-gate.test.mjs   (exit 0 = pass)
 *
 * RED — two ORIGINAL-BENCH DEFECT SHAPES, driven on the TRUE original
 * trees (~/olympus-bench = the package the auditor received; their fixed
 * trees stayed on the auditor's box — only the fix logs came back; the
 * frozen-git originals were not shipped, so defect trees are re-created
 * from the report's verbatim evidence on copies):
 *   R1 no-route (P-A): a bench project with its route entry removed — the
 *      "kit sem casa" shape (7 originals shipped without app/ entirely).
 *      The gate must fail checks 3 (build: no pages) AND 7 (composition).
 *   R2 phantom manifest (P-B): the report's verbatim phantom
 *      lucide-react@^0.450.0 (a series that never existed) written into
 *      package.json. The gate must fail check 2 (npm ci).
 * GREEN — two genuinely gate-clean trees (R3 deterministic substitute for
 * the unavailable auditor-fixed trees):
 *   G1 escola-de-musica-compasso — the jewel, whose ORIGINAL is already
 *      build-green (the auditor's only logged defect for it: the E4
 *      symlink); stripped to the F2 deliverable shape (harness artifacts
 *      removed — the corrected pipeline's output shape). All 7 must pass.
 *   G2 cafeteria-grao-fino — the original's build dies on the used-undeclared
 *      clsx/cva/radix-slot trio (exactly P-B; the auditor's §4 fix list
 *      documents those deps as added). The copy completes the documented
 *      manifest fix + lockfile; all 7 must pass.
 * EDQUOT/R5: the builds run INSIDE the gate on small generated projects
 * (explicitly authorized by the FIX-1 brief); the repo's own build is
 * untouched.
 *
 * Hermetic (R11): gate runs on /tmp copies; bench originals read-only;
 * OLYMPUS env never touched.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const GATE = join(ROOT, 'scripts', 'project-exit-gate.mjs');
const BENCH = join(process.env.HOME, 'olympus-bench');
const WORK = join(tmpdir(), 'olympus-fix1-gate');

let fails = 0;
let checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${String(detail).slice(0, 300)}`}`);
  if (!ok) fails++;
}

// Copy a bench project WITHOUT node_modules/.next and WITHOUT harness
// artifacts (the F2 deliverable shape: .opencode / opencode.json /
// transcript.jsonl never inside a deliverable). npm ci reinstalls.
function copyProject(src, name) {
  const dst = join(WORK, name);
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true, filter: (p) => {
    const parts = p.split('/');
    return !parts.includes('node_modules') && !parts.includes('.next') && !parts.includes('.git')
      && !parts.includes('.opencode') && !parts.includes('opencode.json') && !parts.includes('transcript.jsonl');
  } });
  return dst;
}

const runGate = (dir, label, extraArgs = []) => {
  const r = spawnSync(process.execPath, [GATE, dir, '--label', label, '--json', ...extraArgs],
    { encoding: 'utf-8', timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });
  let report = null;
  try { report = JSON.parse((r.stdout || '').trim()); } catch { /* non-JSON */ }
  return { status: r.status, report, raw: r.stdout || '', err: r.stderr || '' };
};

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const FIXTURES = [
  { src: join(BENCH, 'madruga-1', 'projects', 'cafeteria-grao-fino'), name: 'cafeteria' },
  { src: join(BENCH, 'madruga-2', 'projects', 'escola-de-musica-compasso'), name: 'escola' },
];
for (const f of FIXTURES) {
  if (!existsSync(f.src)) {
    check(`fixture source present: ${f.name}`, false, `missing ${f.src}`);
  }
}

if (existsSync(FIXTURES[0].src) && existsSync(FIXTURES[1].src)) {
  // ─── RED 1: the no-route original shape (P-A) ────────────────────────────
  {
    const dir = copyProject(FIXTURES[0].src, 'red-no-route');
    const pagePath = ['src/app/page.tsx', 'app/page.tsx'].map(p => join(dir, p)).find(p => existsSync(p));
    if (!pagePath) { check('RED1 setup: fixed cafeteria has a route entry to remove', false); }
    else {
      rmSync(pagePath);
      const g = runGate(dir, 'red-no-route');
      const byId = Object.fromEntries((g.report?.checks || []).map(c => [c.id, c]));
      check('RED1 gate verdict FAIL on the no-route shape', g.status === 1 && g.report?.verdict === 'FAIL', `${g.status} ${g.report?.verdict}`);
      check('RED1 check 7 (composition) FIRES — app/page.tsx missing is caught', byId['7']?.status === 'fail', JSON.stringify(byId['7']).slice(0, 200));
      check('RED1 check 3 (build) also fails (no pages to build — the original bench symptom)', byId['3']?.status === 'fail', JSON.stringify(byId['3']).slice(0, 150));
      console.log('      RED1 verbatim (checks 3+7):');
      console.log(`        [3] ${String(byId['3']?.detail).split('\n')[0]}`);
      console.log(`        [7] ${String(byId['7']?.detail).replace(/\n/g, ' ').slice(0, 160)}`);
    }
  }

  // ─── RED 2: the phantom manifest original shape (P-B) ─────────────────────
  {
    const dir = copyProject(FIXTURES[0].src, 'red-phantom-manifest');
    const pkgPath = join(dir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    // The report's verbatim phantom: lucide-react ^0.450.0 (never existed).
    if (pkg.dependencies?.['lucide-react']) pkg.dependencies['lucide-react'] = '^0.450.0';
    else pkg.dependencies = { ...(pkg.dependencies || {}), 'lucide-react': '^0.450.0' };
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    const g = runGate(dir, 'red-phantom-manifest');
    const byId = Object.fromEntries((g.report?.checks || []).map(c => [c.id, c]));
    check('RED2 gate verdict FAIL on the phantom-manifest shape', g.status === 1 && g.report?.verdict === 'FAIL', `${g.status} ${g.report?.verdict}`);
    check('RED2 check 2 (npm ci) FIRES — the phantom version dies deterministically', byId['2']?.status === 'fail', JSON.stringify(byId['2']).slice(0, 200));
    console.log('      RED2 verbatim (check 2 head):');
    console.log(`        ${String(byId['2']?.detail).split('\n').slice(0, 2).join('\n        ').slice(0, 300)}`);
  }

  // ─── GREEN 1: escola — the original jewel, F2 deliverable shape ──────────
  {
    const dir = copyProject(FIXTURES[1].src, 'green-escola');
    const g = runGate(dir, 'green-escola');
    const bad = (g.report?.checks || []).filter(c => c.status !== 'pass');
    check('GREEN escola: ALL 7 checks pass (gate exit 0, verdict PASS)',
      g.status === 0 && g.report?.verdict === 'PASS' && bad.length === 0,
      `exit=${g.status} verdict=${g.report?.verdict} bad=${JSON.stringify(bad.map(b => b.id + ':' + b.status + ':' + String(b.detail).slice(0, 140)))}`);
    if (g.status === 0) {
      console.log('      GREEN escola verbatim:');
      for (const c of g.report.checks) console.log(`        [${c.status === 'pass' ? 'PASS' : c.status}] ${c.id}. ${c.name} — ${String(c.detail).split('\n')[0].slice(0, 110)}`);
    }
  }

  // ─── GREEN 2: cafeteria — the documented fixes completed ──────────────────
  {
    const dir = copyProject(FIXTURES[0].src, 'green-cafeteria');
    // Complete the auditor's documented §4 fixes ON THE COPY (the ORIGINAL
    // stays as-is; its residuals are deliberate register evidence):
    //  (a) "deps faltantes adicionadas (clsx, cva, radix-slot)" —
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
    pkg.dependencies = { ...(pkg.dependencies || {}), clsx: '^2.1.1', 'class-variance-authority': '^0.7.1', '@radix-ui/react-slot': '^1.1.1' };
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    //  (b) "chaves de ternário" — the P-F literal: <metodo.icone === … ? ( → {
    const pcard = join(dir, 'components', 'sections', 'PreparoCard.tsx');
    let src = readFileSync(pcard, 'utf-8');
    src = src.replace("<metodo.icone === 'Coffee' ? (", "{metodo.icone === 'Coffee' ? (");
    writeFileSync(pcard, src);
    //  (c) "tipos DOM corretos" — the readonly-options type error.
    const select = join(dir, 'components', 'ui', 'Select.tsx');
    src = readFileSync(select, 'utf-8');
    src = src.replace('options: { value: string; label: string }[];', 'options: readonly { value: string; label: string }[];');
    writeFileSync(select, src);
    const gi = spawnSync('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund'], { cwd: dir, encoding: 'utf-8', timeout: 300_000 });
    if (gi.status !== 0) check('GREEN cafeteria setup: lockfile regenerated for the completed manifest', false, (gi.stderr || '').slice(0, 200));
    const g = runGate(dir, 'green-cafeteria');
    const bad = (g.report?.checks || []).filter(c => c.status !== 'pass');
    check('GREEN cafeteria (documented fixes completed): ALL 7 checks pass (gate exit 0, verdict PASS)',
      g.status === 0 && g.report?.verdict === 'PASS' && bad.length === 0,
      `exit=${g.status} verdict=${g.report?.verdict} bad=${JSON.stringify(bad.map(b => b.id + ':' + b.status + ':' + String(b.detail).slice(0, 140)))}`);
    if (g.status === 0) {
      console.log('      GREEN cafeteria verbatim:');
      for (const c of g.report.checks) console.log(`        [${c.status === 'pass' ? 'PASS' : c.status}] ${c.id}. ${c.name} — ${String(c.detail).split('\n')[0].slice(0, 110)}`);
    }
  }

  // ─── Residual evidence on the ORIGINAL trees (register fuel, R7) ───────────
  {
    // The ORIGINAL cafeteria carries the used-undeclared trio: the gate
    // catches what the auditor's stale-tree smoke test masked (their install
    // was `npm install --no-package-lock` over existing node_modules).
    const orig = copyProject(FIXTURES[0].src, 'residual-cafeteria');
    const g = runGate(orig, 'residual-cafeteria', ['--skip-build']);
    const c6 = (g.report?.checks || []).find(c => c.id === '6');
    const c2 = (g.report?.checks || []).find(c => c.id === '2');
    check('RESIDUAL (evidence): the ORIGINAL cafeteria fails check 6 — used-undeclared clsx/cva/radix-slot caught',
      c6?.status === 'fail' && /clsx/.test(c6?.detail || ''), JSON.stringify(c6).slice(0, 200));
  }

  // ─── Gate hygiene: no lingering listeners after the runs ──────────────────
  const r = spawnSync('ss', ['-tlnp'], { encoding: 'utf-8' });
  const lingering = (r.stdout || '').split('\n').filter(l => /:21\d{3}\s|:24\d{3}\s/.test(l));
  check('gate hygiene: zero lingering dev listeners in the ephemeral range', lingering.length === 0, lingering.join(' | '));
}

if (fails > 0) { console.error(`\n${fails}/${checked} gate fixture assertion(s) FAILED`); process.exit(1); }
console.log(`\nAll ${checked} project-exit-gate assertions passed`);
