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

// v0.0.91 — the AIME specimen: design-review-pixel was balanced from Athena
// to Persephone because its only artifact is a .json. A design gate is not
// interchangeable work; it must stay with Athena.
const designPlan = { version: 1, laneRoot: '/tmp/lane', hops: [
  { id: 'design-review-a', god: 'athena', prompt: 'a', artifacts: ['design-review.json'], verify: { review: 'deterministic', checks: ['design-score:7'] }, budgetTokens: 4096 },
  { id: 'design-review-b', god: 'athena', prompt: 'b', artifacts: ['design-review.json'], verify: { review: 'deterministic', checks: ['design-score:7'] }, budgetTokens: 4096 },
  { id: 'ui-a', god: 'athena', prompt: 'c', artifacts: ['app/a.tsx'], verify: { review: 'deterministic', checks: ['file-exists:app/a.tsx'] }, budgetTokens: 8192 },
  { id: 'ui-b', god: 'athena', prompt: 'd', artifacts: ['app/b.tsx'], verify: { review: 'deterministic', checks: ['file-exists:app/b.tsx'] }, budgetTokens: 8192 },
  { id: 'ui-c', god: 'athena', prompt: 'e', artifacts: ['app/c.tsx'], verify: { review: 'deterministic', checks: ['file-exists:app/c.tsx'] }, budgetTokens: 8192 },
  { id: 'ui-d', god: 'athena', prompt: 'f', artifacts: ['app/d.tsx'], verify: { review: 'deterministic', checks: ['file-exists:app/d.tsx'] }, budgetTokens: 8192 },
] };
const dr = balancePlan(designPlan);
ok('B-7: design-review/design-gate hops never move away from Athena',
  dr.plan.hops.filter((h) => h.id.startsWith('design-review')).every((h) => h.god === 'athena'),
  JSON.stringify(dr.changes));
console.log(f === 0 ? '\nplan-balance: all green.' : `\nplan-balance: ${f} failed.`); process.exit(f ? 1 : 0);
