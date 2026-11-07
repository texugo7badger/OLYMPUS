#!/usr/bin/env node
/**
 * plan-recovery.test.mjs — v0.0.88: generations, staged plans and Atlas recovery.
 *
 * The AIME specimen: plan 79→67→72→75→76→27→35 while the walk held a 21-hop
 * snapshot; completed ids from older generations inflated progress; the
 * overnight resume re-ran the same tool-budget hop three times. This suite
 * pins the generation/freeze/hash contract and the recovery policy.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const expect = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 260)}`);
  if (!cond) failures++;
};
const lane = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-gen-'));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-gen-home-'));
process.env.OLYMPUS_HOME = home;

const { ensurePlanGeneration, diffPlans, hopDefinitionHash, validCompletedForPlan, freezePlan, stagePlanRewriteIfWalking, readNextPlan, applyNextPlan, frozenPlanPath, readFrozenPlan, planPath } = await import(ROOT + '/src/lib/hop-runtime/plan-generation.ts');
const { validateDispatchPlan } = await import(ROOT + '/src/lib/hop-runtime/plan-schema.ts');
const { writeHopOverride, readHopOverride } = await import(ROOT + '/src/lib/hop-runtime/hop-overrides.ts');
const { decideRecovery, applyRecovery, recoveryAttempts } = await import(ROOT + '/src/lib/hop-runtime/recovery.ts');

const base = {
  version: 1, laneRoot: lane,
  generation: 3, createdAt: '2026-11-07T00:00:00.000Z', parentGeneration: 2,
  hops: [
    { id: 'a', god: 'athena', prompt: 'build a', artifacts: ['a.md'], verify: { checks: ['file-exists:a.md'] } },
    { id: 'b', god: 'athena', prompt: 'build b', artifacts: ['b.md'], verify: { checks: ['file-exists:b.md'] } },
    { id: 'c', god: 'hermes', prompt: 'build c', artifacts: ['c.md'], verify: { checks: [] } },
  ],
};
const ensured = ensurePlanGeneration(base);
expect('G-1: a plan carries generation + createdAt + per-hop hashes', ensured.generation === 3 && ensured.createdAt && Object.keys(ensured.hopHashes ?? {}).length === 3, ensured);
const changed = JSON.parse(JSON.stringify(ensured));
changed.hops[1].prompt = 'build b differently';
const diff = diffPlans(ensured, changed);
expect('G-2: a prompt change is a CHANGED hop, not a silent same-id', diff.changed.length === 1 && diff.changed[0] === 'b' && diff.unchanged.length === 2, diff);

const completed = ['a', 'b', 'c'];
const valid = validCompletedForPlan(completed, ensured, ensured.hopHashes);
expect('G-3: matching hashes keep completed ids', valid.valid.length === 3 && valid.invalidated.length === 0, valid);
const stale = { ...ensured.hopHashes, b: 'deadbeef' };
const inval = validCompletedForPlan(completed, ensured, stale);
expect('G-4: a changed definition invalidates the completed id', inval.valid.length === 2 && inval.invalidated.includes('b'), inval);

fs.writeFileSync(planPath(lane), JSON.stringify(ensured));
const frozen = freezePlan(lane, ensured);
expect('G-5: the live snapshot is frozen on disk', frozen.generation === 3 && fs.existsSync(frozenPlanPath(lane)), 'no frozen plan');
const rewritten = JSON.parse(JSON.stringify(ensured));
rewritten.hops.push({ id: 'd', god: 'athena', prompt: 'build d', artifacts: ['d.md'], verify: { checks: [] } });
rewritten.hops[0].prompt = 'build a redesigned';
fs.writeFileSync(planPath(lane), JSON.stringify(rewritten));
const staged = stagePlanRewriteIfWalking(lane);
expect('G-6: a rewrite during a live walk is STAGED, not applied', staged.staged && staged.diff?.added.includes('d') && staged.diff?.changed.includes('a'), staged);
expect('G-7: the live plan is restored byte-for-byte', JSON.stringify(JSON.parse(fs.readFileSync(planPath(lane), 'utf-8'))) === JSON.stringify(ensured), 'the live plan changed');
const next = readNextPlan(lane);
expect('G-8: the staged plan carries generation+1 and parent', next.plan?.generation === 4 && next.plan?.parentGeneration === 3, next.plan);
const applied = applyNextPlan(lane);
const afterApply = JSON.parse(fs.readFileSync(planPath(lane), 'utf-8'));
expect('G-9: apply advances the generation and removes the stage', applied.applied && afterApply.generation === 4 && afterApply.hops.length === 4 && !fs.existsSync(path.join(lane, 'dispatch-plan.next.json')), afterApply);

const validated = validateDispatchPlan({ version: 1, laneRoot: lane, hops: [{ id: 'x', god: 'athena', prompt: 'x', artifacts: [], toolBudget: 30 }] });
expect('G-10: the schema preserves per-hop toolBudget', validated.ok && validated.plan?.hops?.[0]?.toolBudget === 30, validated.ok ? validated.plan?.hops?.[0] : validated.errors);
writeHopOverride(lane, 'b', { toolBudget: 24, promptAppend: 'narrow it' });
expect('G-11: a hop override is readable without touching the plan', readHopOverride(lane, 'b')?.toolBudget === 24 && readHopOverride(lane, 'b')?.promptAppend === 'narrow it', readHopOverride(lane, 'b'));

const finding = (failureClass, reason = 'dispatch-failed') => ({
  ts: new Date().toISOString(), hopId: 'h1', god: 'athena', status: 'parked',
  reason: failureClass === 'provider' ? 'dispatch-failed:provider' : reason,
  errorClass: failureClass, failureClass, lane: 'opencode-go/qwen3.8-flash',
  nextLane: 'opencode/deepseek-v4.1-flash-free', artifactsPresent: [], artifactsMissing: ['x.md'],
  verdict: 'retry', recommendation: 'do the thing', evidence: 'reason=x',
});
const budget = decideRecovery(lane, finding('tool-budget'));
expect('R-1: tool-budget → budget 24 + narrow directive', budget.action === 'retry' && budget.kind === 'retry-budget' && budget.override?.toolBudget === 24 && /batch/i.test(budget.override?.promptAppend ?? ''), budget);
const timeout = decideRecovery(lane, finding('timeout'));
expect('R-2: timeout → lane failover override', timeout.action === 'retry' && timeout.override?.lane === 'opencode/deepseek-v4.1-flash-free', timeout);
const provider = decideRecovery(lane, finding('provider', 'dispatch-failed:provider'));
expect('R-3: provider/auth → STOP and ask the user', provider.action === 'stop' && provider.kind === 'ask-lane', provider);
const verify = decideRecovery(lane, finding('unknown', 'verify-failed'));
expect('R-4: verify-failed → targeted retry', verify.action === 'retry' && verify.kind === 'retry-verify' && /verify/i.test(verify.override?.promptAppend ?? ''), verify);
applyRecovery(lane, finding('tool-budget'), budget);
expect('R-5: the recovery writes the override and the ledger', readHopOverride(lane, 'h1')?.toolBudget === 24 && recoveryAttempts(lane, 'h1') >= 1, recoveryAttempts(lane, 'h1'));
applyRecovery(lane, finding('tool-budget'), decideRecovery(lane, finding('tool-budget')));
const third = decideRecovery(lane, finding('tool-budget'));
expect('R-6: the third attempt stops (max 2 recoveries per hop)', third.action === 'stop' && /needs the user/.test(third.message), third);

const { buildCampaignHealth } = await import(ROOT + '/src/lib/campaign-health.ts');
fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({ version: 1, completed: ['a'], inFlight: [], parked: { hopId: 'b', reason: 'dispatch-failed:tool-budget', errorClass: 'tool-budget', ts: new Date().toISOString() }, updatedAt: new Date().toISOString() }));
const health = buildCampaignHealth(lane);
expect('H-1: a park + Atlas verdict becomes one health line', ['BLOCKED', 'NEEDS-YOU'].includes(health.verdict) && /gen 4/.test(health.line) && health.parked?.hopId === 'b', health);

fs.rmSync(lane, { recursive: true, force: true });
fs.rmSync(home, { recursive: true, force: true });
console.log(failures === 0 ? '\nplan-recovery: all green.' : `\nplan-recovery: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
