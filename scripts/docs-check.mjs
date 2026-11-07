#!/usr/bin/env node
/**
 * docs-check.mjs — v0.0.72: the documentation gate.
 *
 * The v3 analysis found the first real drift: TOKEN-ECONOMY still sold a 97%
 * reduction the gate had refuted, ROADMAP said v0.0.26, CHANGELOG v0.0.30,
 * STABILITY v0.0.59 — while the app was v0.0.71. Docs that contradict the code
 * are a defect, so they are now a gate.
 *
 * Checks (all must pass):
 *   D-1  VERSION == package.json version
 *   D-2  the status bar's fallback version == VERSION
 *   D-3  README's Latest section names the current version
 *   D-4  CHANGELOG has a `## [v<version>]` entry
 *   D-5  ROADMAP names the current version in its first 40 lines
 *   D-6  STABILITY names the current version
 *   D-7  no refuted claim survives in TOKEN-ECONOMY ("97% input reduction",
 *        "70–97%", "97% on 70%")
 *   D-8  no doc calls an older version "the current release"
 *
 * Usage: node scripts/docs-check.mjs [--json]
 * Exit: 0 = coherent; 1 = drift (each failure printed with the file).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARGS = process.argv.slice(2);
const rootArg = ARGS.indexOf('--root');
const ROOT = rootArg >= 0 && ARGS[rootArg + 1]
  ? path.resolve(ARGS[rootArg + 1])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); } catch { return null; }
};

const failures = [];
const checks = [];
function check(id, name, cond, detail) {
  checks.push({ id, name, ok: Boolean(cond), detail: cond ? null : detail });
  if (!cond) failures.push(`${id} ${name} — ${detail}`);
}

const version = (read('VERSION') || '').trim();
const pkg = JSON.parse(read('package.json') || '{}');
const readme = read('README.md') || '';
const changelog = read('CHANGELOG.md') || '';
const roadmap = read('ROADMAP.md') || '';
const stability = read('STABILITY.md') || '';
const tokenEconomy = read('TOKEN-ECONOMY.md') || '';
const statusBar = read('src/components/olympus/status-bar.tsx') || '';

check('D-1', 'VERSION matches package.json', version && pkg.version === version, `VERSION=${version} package.json=${pkg.version}`);

const statusFallback = statusBar.match(/\|\|\s*'(\d+\.\d+\.\d+)'/)?.[1] ?? null;
check('D-2', 'the status bar fallback matches VERSION', statusFallback === version, `status-bar=${statusFallback} VERSION=${version}`);

const latestStart = readme.indexOf('## Latest');
const latestBlock = latestStart >= 0 ? readme.slice(latestStart, latestStart + 1800) : '';
check('D-3', 'README Latest names the current version', latestBlock.includes(`v${version}`), `README Latest does not mention v${version}`);

check('D-4', 'CHANGELOG has the current entry', changelog.includes(`## [v${version}]`), `no "## [v${version}]" heading`);

check('D-5', 'ROADMAP names the current version up front', roadmap.slice(0, 4000).includes(`v${version}`), `first 40 lines do not mention v${version}`);

check('D-6', 'STABILITY names the current version', stability.slice(0, 4000).includes(`v${version}`), `header does not mention v${version}`);

const banned = [
  /97%\s*(input\s*)?reduction/i,
  /70[–-]97%/,
  /97%\s*on\s*70%/i,
];
const hits = banned.filter((re) => re.test(tokenEconomy)).map((re) => re.source);
check('D-7', 'TOKEN-ECONOMY keeps no refuted claim', hits.length === 0, `refuted claim(s) present: ${hits.join(', ')}`);

const staleCurrent = [...readme.matchAll(/v(\d+)\.(\d+)\.(\d+)[^.\n]{0,40}is the current release/gi)]
  .map((m) => m[0])
  .filter((line) => !line.includes(`v${version}`));
check('D-8', 'no doc calls an older version the current release', staleCurrent.length === 0, staleCurrent.join(' | '));

// v0.0.88 — the two pages the v5 audit found outside the gate. V1-READINESS
// must name the current version; README Testing must carry the stable
// battery's numbers (derived from public/stable.json, never hand-written).
const v1Readiness = read('V1-READINESS.md') || '';
check('D-9', 'V1-READINESS names the current version', v1Readiness.slice(0, 2000).includes(`v${version}`), `V1-READINESS header is not v${version}`);
let stableManifest = {};
try { stableManifest = JSON.parse(read('public/stable.json') || '{}'); } catch { stableManifest = {}; }
const st = stableManifest.tests || {};
if (st.suites) {
  const expected = `${st.pass} PASS / ${st.fail} FAIL / ${st.skip} declared skip`;
  check('D-10', 'README Testing carries the stable battery numbers', readme.includes(expected) && readme.includes(`${st.suites} suites`), `README Testing is missing "${expected} ... ${st.suites} suites"`);
} else {
  check('D-10', 'README Testing carries the stable battery numbers', false, 'public/stable.json has no tests block');
}

if (ARGS.includes('--json')) {
  console.log(JSON.stringify({ version, checks, failures }, null, 2));
} else {
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id} ${c.name}${c.ok ? '' : ' — ' + c.detail}`);
  console.log(`\ndocs-check: ${failures.length === 0 ? 'PASS' : failures.length + ' FAIL'} (v${version})`);
}

process.exit(failures.length === 0 ? 0 : 1);
