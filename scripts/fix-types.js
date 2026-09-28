#!/usr/bin/env node
/**
 * OLYMPUS — fix-types.js — TypeScript + CSS type maintenance script.
 *
 * Goal: keep OLYMPUS's TypeScript toolchain "clean" across fresh clones,
 * dependency upgrades, and Next.js version bumps. Specifically addresses the
 * categories of stale/outdated type diagnostics that accumulate over time:
 *
 *   1. next-env.d.ts drift — Next.js generates this file on `next dev`/`next
 *      build`. After a Next upgrade or a fresh clone (no `.next/`), the file
 *      can reference modules that don't yet exist (`.next/dev/types/routes.d.ts`)
 *      and the CSS module type references (`next/image-types/global`, which
 *      carries `declare module '*.css'`) go stale. We rewrite canonical content
 *      for the installed Next version.
 *
 *   2. csstype / @types presence — `@types/react`'s `CSSProperties` pulls
 *      `csstype` transitively; a broken install can drop it, breaking every
 *      component that uses inline styles. We verify presence + suggest the fix.
 *
 *   3. Build type-checks — runs `tsc --noEmit` for BOTH tsconfigs (Next.js +
 *      Electron) and reports the error count for each. This is the real
 *      "is the build healthy?" signal that `npm run build` relies on.
 *
 * Usage:
 *   node scripts/fix-types.js              # regenerate next-env + verify
 *   node scripts/fix-types.js --build     # also run `next build` to fully
 *                                         # regenerate .next/types (heavier)
 *   node scripts/fix-types.js --check     # verify-only, don't touch next-env.d.ts
 *
 * Exits:
 *   0 — all type-checks passed
 *   1 — one or more type-checks failed (see report)
 *   2 — could not run (Node/npm/tsconfig missing)
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const CHECK_ONLY = process.argv.includes('--check');
const DO_BUILD = process.argv.includes('--build');

const c = process.stdout.isTTY ? {
  reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', gray: '\x1b[90m',
} : { reset: '', bold: '', green: '', red: '', yellow: '', gray: '' };
function ok(msg) { console.log(`${c.green}✓${c.reset} ${msg}`); }
function warn(msg) { console.log(`${c.yellow}!${c.reset} ${msg}`); }
function bad(msg) { console.log(`${c.red}✗${c.reset} ${msg}`); }
function head(msg) { console.log(`\n${c.bold}${msg}${c.reset}`); }

// ─── Detect installed Next.js version ────────────────────────────────────────
function nextVersion() {
  const pkgPath = join(ROOT, 'node_modules', 'next', 'package.json');
  if (!existsSync(pkgPath)) return null;
  try { return JSON.parse(readFileSync(pkgPath, 'utf-8')).version || null; } catch { return null; }
}

// Canonical next-env.d.ts content (Next 15+). The `next dev`/`build` regenerates
// this verbatim, so rewriting it is idempotent + safe — it's marked "do not edit".
function canonicalNextEnv() {
  return [
    '/// <reference types="next" />',
    '/// <reference types="next/image-types/global" />',
    'import "./.next/dev/types/routes.d.ts";',
    '',
    '// NOTE: This file should not be edited',
    '// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.',
    '',
  ].join('\n');
}

// ─── Step 1: next-env.d.ts ───────────────────────────────────────────────────
head('Step 1 — next-env.d.ts (CSS module + routes types)');
const nextEnvPath = join(ROOT, 'next-env.d.ts');
const nextVer = nextVersion();
if (!nextVer) {
  warn('Next.js not installed (node_modules/next missing). Run "npm install" first.');
} else if (CHECK_ONLY) {
  if (!existsSync(nextEnvPath)) bad(`missing ${nextEnvPath}`);
  else ok(`${nextEnvPath} present (Next ${nextVer}) — no writes (--check).`);
} else {
  const canonical = canonicalNextEnv();
  let wrote = false;
  if (!existsSync(nextEnvPath)) {
    writeFileSync(nextEnvPath, canonical, 'utf-8');
    wrote = true;
    ok(`created ${nextEnvPath} (Next ${nextVer}).`);
  } else {
    const cur = readFileSync(nextEnvPath, 'utf-8');
    if (cur.replace(/\r\n/g, '\n') !== canonical) {
      writeFileSync(nextEnvPath, canonical, 'utf-8');
      wrote = true;
      ok(`refreshed ${nextEnvPath} (Next ${nextVer}) — was stale.`);
    } else {
      ok(`${nextEnvPath} already canonical for Next ${nextVer}.`);
    }
  }
  // The `.next/dev/types/routes.d.ts` import resolves to nothing until `next dev`
  // or `next build` runs. That's expected + self-heals on first launch; flag it.
  const routesTypes = join(ROOT, '.next', 'dev', 'types', 'routes.d.ts');
  if (!existsSync(routesTypes)) {
    warn('.next/dev/types/routes.d.ts not present — generated on first `next dev`/`next build` (CSS + route types).');
    if (DO_BUILD) {
      warn('(--build requested) running `next build` to regenerate types...');
    } else {
      warn('  Run `npm run dev` (or: node scripts/fix-types.js --build) to generate it.');
    }
  } else {
    ok('.next/dev/types/routes.d.ts present (types generated).');
  }
}

// ─── Step 1b (optional): next build to fully regenerate types ────────────────
if (DO_BUILD && nextVer) {
  head('Step 1b — next build (regenerate .next/types)');
  warn('Running `next build` (slow — full production build)...');
  const r = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
    cwd: ROOT, stdio: 'inherit',
  });
  if (r.status === 0) ok('next build complete — .next/types regenerated.');
  else bad(`next build failed (exit ${r.status}).`);
}

// ─── Step 2: csstype presence (powers CSSProperties) ────────────────────────
head('Step 2 — csstype (CSSProperties backbone)');
const csstypePkg = join(ROOT, 'node_modules', 'csstype', 'package.json');
if (existsSync(csstypePkg)) {
  ok('csstype present (CSSProperties available for inline styles).');
} else {
  warn('csstype not at top-level node_modules (usually pulled transitively by @types/react).');
  warn('  If you see "Cannot find name CSSProperties", run:  npm install --save-dev @types/react');
}

// ─── Step 3: tsc --noEmit for both tsconfigs ─────────────────────────────────
head('Step 3 — TypeScript type-checks (build-blocking)');
function runTsc(label, tsconfig) {
  const tscBin = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!existsSync(tscBin)) { bad(`typescript not installed (${label}); run "npm install".`); return 2; }
  if (!existsSync(tsconfig)) { bad(`tsconfig not found: ${tsconfig}`); return 2; }
  const r = spawnSync(process.execPath, [tscBin, '--noEmit', '-p', tsconfig], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = (r.stdout?.toString() || '') + (r.stderr?.toString() || '');
  const lines = out.split('\n').filter(Boolean);
  if (r.status === 0 && lines.length === 0) { ok(`${label}: clean (0 errors).`); return 0; }
  bad(`${label}: ${lines.length} issue(s) (exit ${r.status}). Sample:`);
  for (const l of lines.slice(0, 15)) console.log(`  ${c.gray}${l}${c.reset}`);
  if (lines.length > 15) console.log(`  ${c.gray}... +${lines.length - 15} more${c.reset}`);
  return 1;
}
const nextResult = runTsc('Next.js (tsconfig.json)', join(ROOT, 'tsconfig.json'));
const electronResult = runTsc('Electron (electron/tsconfig.json)', join(ROOT, 'electron', 'tsconfig.json'));

// ─── Step 4: skill index doc count vs SKILL.md count ─────────────────────────
head('Step 4 — skill index consistency');
try {
  const { execSync } = await import('node:child_process');
  const skillMdCount = parseInt(execSync(`find ${join(ROOT, '.opencode', 'skills')} -name SKILL.md | wc -l`, { encoding: 'utf-8' }).trim(), 10);
  ok(`SKILL.md files on disk: ${skillMdCount}`);
  const vocabPath = join(process.env.OLYMPUS_VAULT_DIR || (await import('node:os')).homedir() + '/OLYMPUS-VAULT', '03_Index', 'skill-vocab.json');
  if (existsSync(vocabPath)) {
    const v = JSON.parse(readFileSync(vocabPath, 'utf-8'));
    ok(`skill-vec.db vocab numDocs: ${v.numDocs} (includes a few reference sub-files; >= SKILL.md count is expected).`);
  } else {
    warn('skill-vocab.json missing — run: npm run skill-index');
  }
} catch (err) {
  warn(`skill consistency check skipped (${err.message}).`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
head('Summary');
const failed = (nextResult !== 0 ? 1 : 0) + (electronResult !== 0 ? 1 : 0);
if (failed === 0) {
  ok('All type-checks passed. OLYMPUS TypeScript toolchain is clean.');
  process.exit(0);
} else {
  bad(`${failed} type-check(s) failed. Fix the errors above, then re-run: ${c.bold}node scripts/fix-types.js${c.reset}`);
  process.exit(1);
}