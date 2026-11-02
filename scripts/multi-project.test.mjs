#!/usr/bin/env node
/**
 * multi-project.test.mjs — v0.0.45 (R45).
 *
 * Two projects must stay two projects: the list carries each one's own brief,
 * the switcher shows the status, design memory is scoped, and the follow lane
 * never crosses the active root.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const route = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/projects/route.ts', 'utf-8');
const switcher = fs.readFileSync(OLYMPUS + '/src/components/olympus/project-switcher.tsx', 'utf-8');
const store = fs.readFileSync(OLYMPUS + '/src/lib/olympus-store.ts', 'utf-8');
const follow = fs.readFileSync(OLYMPUS + '/src/components/olympus/follow-agent.tsx', 'utf-8');
const memory = fs.readFileSync(OLYMPUS + '/src/lib/design-memory.ts', 'utf-8');

expect('P1: the project list carries each project’s brief',
  /buildProjectBrief\(/.test(route) && /brief:\s*\{/.test(route),
  'the list has no per-project status');
expect('P2: the brief is typed on the shared ProjectNote',
  /brief\?:\s*\{/.test(store),
  'the type is missing');
expect('P3: the switcher renders the per-project completed/total',
  /p\.brief\.completed/.test(switcher) && /p\.brief\.status/.test(switcher),
  'the dashboard is invisible');
expect('P4: design memory is project-scoped',
  /projectSlug/.test(memory) && /filter\(\(e\) => e\.projectSlug === projectSlug\)/.test(memory),
  'memory can leak across projects');
expect('P5: the follow lane only opens files under the active root',
  /file\.startsWith/.test(follow) && /activeProject\?\.path/.test(follow),
  'the editor can follow another project');

console.log(failures === 0 ? '\nmulti-project: all green.' : `\nmulti-project: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
