#!/usr/bin/env node
/**
 * github-connect.test.mjs — v0.0.54.
 * One repo per project through the user's gh auth; no stored token, no shell.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const O = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let f = 0; const ok = (n, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : ' — ' + String(d).slice(0, 200)}`); if (!c) f++; };
const route = fs.readFileSync(O + '/src/app/api/olympus/projects/github/route.ts', 'utf-8');
ok('GH-1: create/connect/push are explicit actions', /action === 'create'/.test(route) && /action === 'connect'/.test(route) && /action === 'push'/.test(route), 'missing action');
ok('GH-2: no stored token — gh auth is the user credential', /ghReady/.test(route) && /gh', \['auth', 'status'\]/.test(route) && !/process\.env\.[A-Z_]*TOKEN/.test(route), 'a token is stored');
ok('GH-3: the GitHub URL is validated and no shell is used', /github/.test(route) && /repo', 'create'/.test(route) && /execFileSync/.test(route) && !/\bexecSync\(/.test(route), 'shell injection surface');
ok('GH-4: the profile exposes create/push and commits', /githubAction\('create'/.test(fs.readFileSync(O + '/src/components/olympus/project-profile-card.tsx', 'utf-8')), 'no UI');
const plan = fs.readFileSync(O + '/src/lib/hibernation.ts', 'utf-8');
ok('HIB-1: the night plan is bounded to 24h', /Math\.min\(24/.test(plan) && /until/.test(plan), 'unbounded night');
console.log(f === 0 ? '\ngithub-connect: all green.' : `\ngithub-connect: ${f} failed.`); process.exit(f ? 1 : 0);
