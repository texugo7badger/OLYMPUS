#!/usr/bin/env node
/**
 * project-brief.test.mjs — v0.0.41 (R41-01).
 *
 * The profile card must know what the project is DOING: the plan's progress,
 * the parked hop and its cause, the next parts, the docs, the walk's memory
 * and the brain scope. These fixtures pin the join without a live vault.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const mod = await import(OLYMPUS + '/src/lib/project-brief.ts');

function lane({ plan = true, state = null, docs = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-brief-'));
  if (plan) {
    fs.writeFileSync(path.join(dir, 'dispatch-plan.json'), JSON.stringify({
      version: 1, laneRoot: dir, hops: [
        { id: 'a', god: 'athena', prompt: 'a', artifacts: ['a.tsx'] },
        { id: 'b', god: 'hephaestus', prompt: 'b', artifacts: ['b.ts'] },
        { id: 'c', god: 'athena', prompt: 'c', artifacts: ['c.tsx'] },
      ],
    }));
  }
  if (state) fs.writeFileSync(path.join(dir, '.olympus-hop-state.json'), JSON.stringify(state));
  if (docs) {
    fs.writeFileSync(path.join(dir, 'README.md'), '# AIME — Anime Discovery Game\n\nA game.\n');
    fs.writeFileSync(path.join(dir, 'project.md'), '# Project memory\n');
  }
  return dir;
}

const parkedDir = lane({
  state: {
    completed: ['a'], parked: { hopId: 'b', reason: 'verify-failed', error: 'missing b.ts' },
    quarantined: ['b'], inFlight: [], campaignId: 'cmp_test', updatedAt: '2026-11-02T10:00:00.000Z',
  },
});
const parked = mod.buildProjectBrief(parkedDir);
expect('B1: the brief counts completed/total from the plan + state',
  parked.total === 3 && parked.completed === 1, JSON.stringify(parked));
expect('B2: the parked hop and its cause are named',
  parked.status === 'parked' && parked.parkedHop?.hopId === 'b' && /missing b/.test(parked.parkedHop?.error || ''),
  JSON.stringify(parked.parkedHop));
expect('B3: next lists only pending hops (parked is not "next")',
  parked.next.length === 1 && parked.next[0].id === 'c', JSON.stringify(parked.next));
expect('B4: the brief carries the campaign id + updatedAt',
  parked.campaignId === 'cmp_test' && parked.updatedAt === '2026-11-02T10:00:00.000Z', JSON.stringify(parked));
expect('B5: docs carry the README title and the memory files',
  parked.docs.some((d) => d.name === 'README.md' && /AIME/.test(d.title)) && parked.memory.includes('project.md'),
  JSON.stringify({ docs: parked.docs, memory: parked.memory }));
expect('B6: scope carries three measured counts',
  parked.scope.instincts >= 0 && parked.scope.knowledge >= 0 && parked.scope.skills > 0,
  JSON.stringify(parked.scope));

const runningDir = lane({ state: { completed: ['a'], inFlight: [{ hopId: 'b', god: 'hephaestus' }], campaignId: 'cmp_run' } });
const running = mod.buildProjectBrief(runningDir);
expect('B7: inFlight wins the status (running, not idle)',
  running.status === 'running' && running.completed === 1, JSON.stringify(running));

const doneDir = lane({ state: { completed: ['a', 'b', 'c'], parked: null, inFlight: [] } });
const done = mod.buildProjectBrief(doneDir);
expect('B8: a fully completed plan is done, not parked',
  done.status === 'done' && done.completed === 3 && done.parkedHop === null, JSON.stringify(done));

const empty = mod.buildProjectBrief(undefined);
expect('B9: a missing lane is an honest empty brief',
  empty.status === 'idle' && empty.total === 0 && empty.docs.length === 0, JSON.stringify(empty));

const route = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/projects/profile/route.ts', 'utf-8');
expect('B10: the profile route returns the brief',
  /buildProjectBrief\(/.test(route) && /brief:/.test(route), 'the route does not expose the brief');
const card = fs.readFileSync(OLYMPUS + '/src/components/olympus/project-profile-card.tsx', 'utf-8');
expect('B11: the card renders status, next, parked cause and scope',
  /profile\.brief\.status/.test(card) && /profile\.brief\.next/.test(card)
    && /parkedHop\.reason/.test(card) && /scope\.instincts/.test(card),
  'the card does not render the brief');
const i18n = fs.readFileSync(OLYMPUS + '/src/lib/i18n.ts', 'utf-8');
expect('B12: the brief labels are localized (en + pt-BR)',
  (i18n.match(/'projects\.brief'/g) || []).length >= 2 && /briefing do projeto/.test(i18n),
  'the brief labels are English-only');

console.log(failures === 0 ? '\nproject-brief: all green.' : `\nproject-brief: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
