#!/usr/bin/env node
/**
 * benchmark-session.test.mjs — v0.0.32: the "new session" contract.
 * Run: npx tsx scripts/benchmark-session.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBenchmarkSession } from '../src/lib/benchmarks.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed += 1; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

const at = Date.parse('2026-11-02T02:30:00.000Z');
const project = { slug: 'aime', name: 'AIME', description: 'The exam app', stacks: ['next', 'prisma'] };

ok('an empty name falls back to <project>-<date>', () => {
  const s = buildBenchmarkSession({ name: '', project, now: at });
  assert.equal(s.label, 'aime-2026-11-02');
  assert.equal(s.startedAt, '2026-11-02T02:30:00.000Z');
});

ok('a user name wins and is trimmed', () => {
  const s = buildBenchmarkSession({ name: '  night-run  ', project, now: at });
  assert.equal(s.label, 'night-run');
});

ok('the project description and stacks ride along', () => {
  const s = buildBenchmarkSession({ name: '', project, now: at });
  assert.equal(s.project?.description, 'The exam app');
  assert.deepEqual(s.project?.stacks, ['next', 'prisma']);
});

ok('no project still produces a valid label', () => {
  const s = buildBenchmarkSession({ name: 'x', project: null, now: at });
  assert.equal(s.label, 'x');
  assert.equal(buildBenchmarkSession({ name: null, project: null, now: at }).label, 'session-2026-11-02');
});

ok('the route, the settings and the cost boundary are wired', () => {
  const route = readFileSync(new URL('../src/app/api/olympus/benchmarks/route.ts', import.meta.url), 'utf-8');
  const settings = readFileSync(new URL('../src/components/olympus/settings-dialog.tsx', import.meta.url), 'utf-8');
  const costs = readFileSync(new URL('../src/app/api/olympus/costs/route.ts', import.meta.url), 'utf-8');
  assert.match(route, /body\.newSession === true/);
  assert.match(route, /appendBenchmarkSession/);
  assert.match(settings, /startNewSession/);
  assert.match(settings, /newSession: true/);
  assert.match(costs, /sessionStartedAt/);
  assert.match(costs, /costSummary\(\{ sinceMs \}\)/);
});

console.log(`\nbenchmark-session: ${passed} passed`);
