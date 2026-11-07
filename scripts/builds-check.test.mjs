#!/usr/bin/env node
/**
 * builds-check.test.mjs — v0.0.86 (H2): the Build Hub reference gate.
 *
 * A clean registry must pass; a fixture with one dead skill, one dead MCP and
 * one cross-god demigod must fail with a named finding for each. The gate is
 * only worth shipping if it actually fails on the defect class that produced
 * it (`cache-layer` + `craft-prototype`).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const expect = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 300)}`);
  if (!cond) failures++;
};
const run = (args) => spawnSync('npx', ['tsx', 'scripts/builds-check.mjs', ...args], {
  cwd: ROOT, encoding: 'utf-8', timeout: 120_000,
});

const clean = run(['--json']);
let cleanJson = null;
try { cleanJson = JSON.parse(clean.stdout); } catch { /* reported below */ }
expect('B-1: the curated registry resolves every reference', clean.status === 0 && cleanJson?.ok === true, clean.stdout.slice(-500) + clean.stderr.slice(-300));
expect('B-2: the shelf is curated (68), not the 200-entry matrix', cleanJson?.builds === 68 && cleanJson?.failures?.length === 0, cleanJson);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-builds-'));
const fixture = path.join(tmp, 'bad-builds.json');
fs.writeFileSync(fixture, JSON.stringify([
  {
    id: 'bad-cross-god', name: 'Bad cross god', god: 'prometheus', signature: 'cache',
    demigods: ['cache-architect'], skills: ['redis-patterns'], mcps: ['context7'], verify: ['scan:0-high'], tier: 'cold', source: 'seed',
  },
  {
    id: 'bad-refs', name: 'Bad refs', god: 'athena', signature: 'nothing',
    demigods: ['no-such-demigod'], skills: ['no-such-skill'], mcps: ['no-such-mcp'], verify: ['scan:0-high'], tier: 'cold', source: 'seed',
  },
]));
const bad = run(['--json', '--builds', fixture]);
let badJson = null;
try { badJson = JSON.parse(bad.stdout); } catch { /* reported below */ }
const kinds = new Set((badJson?.failures || []).map((f) => f.kind));
expect('B-3: a cross-god demigod fails the gate with its owner named', bad.status === 1 && (badJson?.failures || []).some((f) => f.build === 'bad-cross-god' && f.kind === 'demigod' && /persephone/.test(f.detail)), bad.stdout.slice(-400));
expect('B-4: a dead skill, MCP and demigod are each named', bad.status === 1 && kinds.has('skill') && kinds.has('mcp') && kinds.has('demigod'), [...kinds]);
expect('B-6: a guidance-only build fails the executable-gate rule', bad.status === 1 && (badJson?.failures || []).some((f) => f.kind === 'verify'), bad.stdout.slice(-300));
expect('B-5: the gate is wired into npm as builds:check', /"builds:check"\s*:\s*"[^"]*builds-check/.test(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')), 'missing npm script');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? '\nbuilds-check: all green.' : `\nbuilds-check: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
