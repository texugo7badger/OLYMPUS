#!/usr/bin/env node
/**
 * plan-balance.test.mjs — v0.0.55.
 * The Athena-16 bottleneck: only unambiguous artifacts move, script hops stay,
 * DAG edges are untouched, and no god keeps >40%.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const O = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let f = 0; const ok = (n, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : ' — ' + String(d).slice(0, 200)}`); if (!c) f++; };
const { balancePlan, planLoad } = await import(O + '/src/lib/hop-runtime/plan-balance.ts');
const plan = { version: 1, laneRoot: '/tmp/lane', hops: [
  { id: 'ui-a', god: 'athena', prompt: 'a', artifacts: ['app/a.tsx'], verify: { review: 'deterministic', checks: ['file-exists:app/a.tsx'] }, budgetTokens: 8192 },
  { id: 'ui-b', god: 'athena', prompt: 'b', artifacts: ['app/b.tsx'], verify: { review: 'deterministic', checks: ['file-exists:app/b.tsx'] }, budgetTokens: 8192, after: ['ui-a'] },
  { id: 'docs', god: 'athena', prompt: 'c', artifacts: ['docs/spec.md'], verify: { review: 'deterministic', checks: ['file-exists:docs/spec.md'] }, budgetTokens: 8192 },
  { id: 'script', god: 'athena', prompt: 'd', kind: 'script', command: 'true', artifacts: [], verify: { review: 'deterministic', checks: [] }, budgetTokens: 8192 },
  { id: 'data', god: 'athena', prompt: 'e', artifacts: ['prisma/schema.prisma'], verify: { review: 'deterministic', checks: ['file-exists:prisma/schema.prisma'] }, budgetTokens: 8192 },
  { id: 'test', god: 'athena', prompt: 'f', artifacts: ['tests/a.test.ts'], verify: { review: 'deterministic', checks: ['file-exists:tests/a.test.ts'] }, budgetTokens: 8192 },
] };
const r = balancePlan(plan);
const after = planLoad(r.plan);
ok('B-1: no god keeps more than 40%', after.every((g) => g.share <= 0.4 + 0.001), JSON.stringify(after));
ok('B-2: only unambiguous hops move', r.changes.length >= 2 && r.changes.every((c) => c.from === 'athena' && ['hephaestus','persephone','dionysus','prometheus'].includes(c.to)), JSON.stringify(r.changes));
ok('B-3: script hops never move', r.plan.hops.find((h) => h.id === 'script')?.god === 'athena', 'script reassigned');
ok('B-4: DAG edges are untouched', JSON.stringify(r.plan.hops[1].after) === JSON.stringify(['ui-a']), 'edge changed');
ok('B-5: the original plan is not mutated', plan.hops.filter((h) => h.god === 'athena').length === 6, 'mutated');
const walker = fs.readFileSync(O + '/src/lib/hop-runtime/walker.ts', 'utf-8');
ok('B-6: the walker applies the balance pass', /balancePlan\(v\.plan\)/.test(walker) && /DAG balance/.test(walker), 'not wired');
console.log(f === 0 ? '\nplan-balance: all green.' : `\nplan-balance: ${f} failed.`); process.exit(f ? 1 : 0);
