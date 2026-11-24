#!/usr/bin/env node
/**
 * generation-boundary.test.mjs — v0.0.98-17: gen 47 must start by itself.
 *
 * THE SPECIMEN (2026-11-24): the walk settled on generation 46 with generation
 * 47 staged. Nothing applied the next generation, so the night froze. This
 * suite proves the boundary apply runs before the plan is read, with no live
 * lock, and that the new generation actually walks.
 *
 * Run: npx tsx scripts/generation-boundary.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-gen-home-'));
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-gen-vault-'));
process.env.OLYMPUS_HOME = HOME;
process.env.OLYMPUS_VAULT = VAULT;
process.on('exit', () => {
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* gone */ }
  try { fs.rmSync(VAULT, { recursive: true, force: true }); } catch { /* gone */ }
});

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
}

async function main() {
  const lane = path.join(VAULT, '02_Projects', 'gen-fixture');
  fs.mkdirSync(lane, { recursive: true });
  const plan1 = {
    version: 1, laneRoot: lane, generation: 46, createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    hops: [{ id: 'hop-a', god: 'hephaestus', prompt: 'a', artifacts: ['a.txt'], verify: { review: 'deterministic', checks: ['file-exists:a.txt'] } }],
  };
  const plan2 = {
    version: 1, laneRoot: lane, generation: 47, parentGeneration: 46, createdAt: new Date().toISOString(),
    hops: [{ id: 'hop-b', god: 'hephaestus', prompt: 'b', artifacts: ['b.txt'], verify: { review: 'deterministic', checks: ['file-exists:b.txt'] } }],
  };
  fs.writeFileSync(path.join(lane, 'dispatch-plan.json'), JSON.stringify(plan1));
  fs.writeFileSync(path.join(lane, '.olympus-plan-frozen.json'), JSON.stringify(plan1));
  fs.writeFileSync(path.join(lane, 'dispatch-plan.next.json'), JSON.stringify(plan2));
  fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({
    version: 1, completed: ['hop-a'], parked: null, campaignId: 'cmp_gen', quarantined: [], inFlight: [], generation: 46, parks: {}, updatedAt: new Date().toISOString(),
  }));
  const events = [];
  const dispatched = [];
  const dispatcher = async (hop) => {
    dispatched.push(hop.id);
    fs.writeFileSync(path.join(lane, hop.artifacts[0]), 'x');
    return { ok: true, exitCode: 0, output: '', tokensIn: 1, tokensOut: 1, retriesAbsorbed: 0, exhausted: false };
  };
  const post = await import(OLYMPUS + '/src/lib/hop-runtime/post-run.ts');
  const result = await post.maybeWalkThePlan({
    slug: 'gen-fixture', laneRoot: lane, dispatcher, unattended: true, expectPlan: true,
    send: (ev) => events.push(ev),
  });
  const state = JSON.parse(fs.readFileSync(path.join(lane, '.olympus-hop-state.json'), 'utf-8'));
  expect('the boundary log names the generation', events.some((e) => /Generation 46 → 47 applied at the walk boundary/.test(String(e?.msg ?? ''))), JSON.stringify(events.filter((e) => e?.type === 'log')));
  expect('the next generation is consumed', !fs.existsSync(path.join(lane, 'dispatch-plan.next.json')));
  expect('the walk dispatched the new hop', dispatched.includes('hop-b') && result.walked === true, JSON.stringify({ dispatched, result: { walked: result.walked, completed: result.completed, parked: result.parked } }));
  expect('the state is generation 47', state.generation === 47, JSON.stringify(state));
  expect('the new hop completed', state.completed.includes('hop-b') && !state.parked, JSON.stringify(state));

  const postSrc = fs.readFileSync(path.join(OLYMPUS, 'src/lib/hop-runtime/post-run.ts'), 'utf-8');
  expect('the boundary apply runs before the plan read', /GENERATION BOUNDARY IS AUTOMATIC/.test(postSrc) && /applyNextPlan\(opts\.laneRoot\)/.test(postSrc));
  console.log('');
  if (failures > 0) {
    console.log(`generation-boundary: ${failures} FAIL`);
    process.exit(1);
  }
  console.log('generation-boundary: all checks PASS');
}
await main();
