#!/usr/bin/env node
/**
 * campaign-smoke.test.mjs — v0.0.88: one campaign, one park, zero human.
 *
 * The acceptance the user asked for: 10 hops, a tool-budget park on h4, Atlas
 * recovery (budget 24 + narrow directive), and a resumed walk that finishes
 * 10/10 without the user touching the plan. The fixture dispatcher reads the
 * override at dispatch, so the test proves the recovery reaches the lane.
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
const lane = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-smoke-'));
const { walkPlan } = await import(ROOT + '/src/lib/hop-runtime/walker.ts');
const { patrolLane } = await import(ROOT + '/src/lib/atlas-patrol.ts');
const { decideRecovery, applyRecovery } = await import(ROOT + '/src/lib/hop-runtime/recovery.ts');
const { readHopOverride } = await import(ROOT + '/src/lib/hop-runtime/hop-overrides.ts');
const { buildCampaignHealth } = await import(ROOT + '/src/lib/campaign-health.ts');

const plan = {
  version: 1, laneRoot: lane,
  hops: Array.from({ length: 10 }, (_, i) => ({
    id: `h${i}`, god: ['apollo', 'athena', 'hephaestus', 'hermes'][i % 4],
    prompt: `build h${i}`, artifacts: [`h${i}.md`],
    verify: { review: 'deterministic', checks: [`file-exists:h${i}.md`] },
  })),
};
fs.writeFileSync(path.join(lane, 'dispatch-plan.json'), JSON.stringify(plan));
let h4Attempts = 0;
let sawBudget = null;
const dispatcher = async (hop) => {
  if (hop.id === 'h4') {
    h4Attempts++;
    if (h4Attempts === 1) {
      return { ok: false, exitCode: null, output: '', tokensIn: null, tokensOut: null, retriesAbsorbed: 0, exhausted: false, error: 'hop-tool-budget-exceeded (OLYMPUS_HOP_TOOL_BUDGET 20): exploration is not progress', errorClass: 'tool-budget' };
    }
    sawBudget = readHopOverride(lane, 'h4')?.toolBudget ?? null;
  }
  fs.writeFileSync(path.join(lane, hop.artifacts[0]), `# ${hop.id}\n`);
  return { ok: true, exitCode: 0, output: 'ok', tokensIn: 20, tokensOut: 40, retriesAbsorbed: 0, exhausted: false };
};

const first = await walkPlan({ plan, dispatcher, stateDir: lane });
expect('S-1: the first walk parks h4 and completes the independent hops', first.parked?.hopId === 'h4' && first.completed.includes('h0') && !first.completed.includes('h4'), first.parked);
const finding = patrolLane(lane).parked[0];
expect('S-2: Atlas classifies the park as tool-budget', finding?.failureClass === 'tool-budget' && finding?.verdict === 'replan', finding);
const decision = decideRecovery(lane, finding);
expect('S-3: the recovery is retry with budget 24 + a narrow directive', decision.action === 'retry' && decision.override?.toolBudget === 24 && /batch/i.test(decision.override?.promptAppend ?? ''), decision);
applyRecovery(lane, finding, decision);
expect('S-4: the override reaches the hop without a plan rewrite', readHopOverride(lane, 'h4')?.toolBudget === 24, readHopOverride(lane, 'h4'));

const second = await walkPlan({ plan, dispatcher, stateDir: lane, resume: true, keepQuarantine: true, retryParkedHop: true });
expect('S-5: the resumed walk finishes 10/10 with no park', second.completed.length === 10 && !second.parked, { completed: second.completed, parked: second.parked });
expect('S-6: the retried h4 actually saw the 24-budget override', h4Attempts === 2 && sawBudget === 24, { h4Attempts, sawBudget });
const health = buildCampaignHealth(lane);
expect('S-7: the campaign health ends DONE on the same generation', health.verdict === 'DONE' && health.completed === 10 && health.total === 10, health);

fs.rmSync(lane, { recursive: true, force: true });
console.log(failures === 0 ? '\ncampaign-smoke: all green.' : `\ncampaign-smoke: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
