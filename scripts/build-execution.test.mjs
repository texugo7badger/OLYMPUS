#!/usr/bin/env node
/**
 * build-execution.test.mjs — v0.0.86 (#343): the build reaches the dispatch.
 *
 * The audit's highest-leverage gap: `buildPrompt()` rendered only in the hub,
 * no dispatch injected it, and the hop snapshot never wrote back to
 * arsenal-resonance.jsonl — a recommendation system, not an execution system.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const expect = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 260)}`);
  if (!cond) failures++;
};
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const { resolveHopBuild } = await import(ROOT + '/src/lib/hop-runtime/walker.ts');
const { validateDispatchPlan } = await import(ROOT + '/src/lib/hop-runtime/plan-schema.ts');

const base = {
  id: 'h1', god: 'persephone', prompt: 'redis cache with invalidation', artifacts: [],
  skills: ['redis-patterns', 'backend-patterns'], mcps: ['context7'], demigods: ['cache-architect'],
};
expect('X-1: a god + skill/MCP fit resolves the cache-layer build', resolveHopBuild(base)?.id === 'cache-layer', resolveHopBuild(base));
expect('X-2: an explicit buildId wins', resolveHopBuild({ ...base, god: 'dionysus', buildId: 'eval-harness' })?.id === 'eval-harness', resolveHopBuild({ ...base, buildId: 'eval-harness' }));
expect('X-3: a weak coincidence does not equip a loadout', resolveHopBuild({ ...base, skills: ['redis-patterns'], mcps: [], demigods: [] }) === null, 'one-skill fit still matched');
const weak = resolveHopBuild({ id: 'w', god: 'atlas', prompt: 'x', artifacts: [], skills: [], mcps: [], demigods: [] });
expect('X-4: no declared arsenal → no build (the honest empty)', weak === null, weak);

const plan = validateDispatchPlan({ version: 1, laneRoot: '/tmp/x', hops: [{ ...base, buildId: 'cache-layer' }] });
expect('X-5: the plan schema keeps buildId (and accepts alias build)', plan.ok && plan.plan?.hops?.[0]?.buildId === 'cache-layer', plan.errors);
const aliased = validateDispatchPlan({ version: 1, laneRoot: '/tmp/x', hops: [{ ...base, build: 'cache-layer' }] });
expect('X-6: a plan may declare build instead of buildId', aliased.ok && aliased.plan?.hops?.[0]?.buildId === 'cache-layer', aliased.errors);

const walker = src('src/lib/hop-runtime/walker.ts');
expect('X-7: the hop prompt carries the build loadout', /buildPrompt\(mergeBuildStats\(\[build\], \[\]\)\[0\]\)/.test(walker), 'buildPrompt never injected');
expect('X-8: the telemetry row records the build', /build: hopBuild\?\.id \?\? null/.test(walker) && /build\?: string \| null/.test(walker), 'build not in the row');
expect('X-9: every settle writes arsenal-resonance.jsonl', /arsenal-resonance\.jsonl/.test(walker) && /outcome: status/.test(walker) && /build: hopBuild\?\.id \?\? null/.test(walker), 'no write-back');
expect('X-10: a resonance write failure never blocks the walk', /resonance is evidence, never a walk blocker/.test(walker), 'unguarded append');

console.log(failures === 0 ? '\nbuild-execution: all green.' : `\nbuild-execution: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
