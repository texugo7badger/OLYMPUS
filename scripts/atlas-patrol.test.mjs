#!/usr/bin/env node
/**
 * atlas-patrol.test.mjs — v0.0.87: Atlas names every park and the next action.
 *
 * The specimen: a 20-minute timeout park on an auth lane produced a red chip
 * and nothing else. The patrol must classify it, pick the next healthy lane,
 * check the artifacts and write the finding to the shared feed — deterministically.
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
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
};
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

const lane = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-patrol-'));
const previousHome = process.env.OLYMPUS_HOME;
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-patrol-home-'));
process.env.OLYMPUS_HOME = home;

const plan = {
  version: 1, laneRoot: lane,
  hops: [
    { id: 'h-timeout', god: 'athena', prompt: 'build the day field', artifacts: ['evidence/day/field.md'], verify: { checks: ['file-exists:evidence/day/field.md'] } },
    { id: 'h-budget', god: 'hermes', prompt: 'write the docs', artifacts: ['evidence/docs.md'], verify: { checks: [] } },
    { id: 'h-verify', god: 'athena', prompt: 'ship the page', artifacts: ['src/page.tsx'], verify: { checks: [] } },
    { id: 'h-stuck', god: 'athena', prompt: 'run forever', artifacts: ['evidence/stuck.md'], verify: { checks: [] } },
  ],
};
fs.writeFileSync(path.join(lane, 'dispatch-plan.json'), JSON.stringify(plan));
const now = Date.now();
fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({
  version: 1, completed: [], campaignId: 'cmp_test',
  parked: { hopId: 'h-timeout', reason: 'dispatch-failed:timeout', errorClass: 'timeout', error: 'ceiling-kill with no provider error', ts: new Date(now).toISOString() },
  inFlight: [{ hopId: 'h-stuck', god: 'athena', startedAt: new Date(now - 40 * 60_000).toISOString(), artifacts: ['evidence/stuck.md'] }],
  updatedAt: new Date(now).toISOString(),
}));
fs.writeFileSync(path.join(lane, '.olympus-hop-telemetry.jsonl'), [
  JSON.stringify({ ts: new Date(now - 20 * 60_000).toISOString(), hop: 'h-timeout', god: 'athena', lane: 'opencode-go/qwen3.8-flash', status: 'parked-dispatch-failed', errorClass: 'timeout', durationMs: 1_200_000, tokensIn: null, tokensOut: null }),
].join('\n') + '\n');
// lane health: qwen3.8 dead, deepseek-free healthy
fs.mkdirSync(home, { recursive: true });
// This fixture pins the FREE roster; the GO-only roster is covered in
// lane-failover A6. Without the strategy file the default is go-balanced and
// the expected free next-lane would (correctly) change.
fs.writeFileSync(path.join(home, 'llm-providers.json'), JSON.stringify({ strategy: 'free-openrouter' }));
fs.writeFileSync(path.join(home, 'lane-health.json'), JSON.stringify({
  version: 1,
  lanes: {
    'opencode-go/qwen3.8-flash': { status: 'timeout', at: now, error: 'no provider error', retryUntil: now + 30 * 60_000 },
    'opencode/deepseek-v4.1-flash-free': { status: 'alive', at: now },
  },
  updatedAt: new Date(now).toISOString(),
}));

const { patrolLane, patrolFinding } = await import(ROOT + '/src/lib/atlas-patrol.ts');
const report = patrolLane(lane, now);
const timeout = report.parked.find((f) => f.hopId === 'h-timeout');
expect('A-1: the timeout park is found and classified', timeout?.failureClass === 'timeout' && timeout?.verdict === 'retry', timeout);
expect('A-2: the patrol names the next healthy lane', timeout?.nextLane === 'opencode/deepseek-v4.1-flash-free', timeout);
expect('A-3: the missing artifact is in the evidence', timeout?.artifactsMissing.includes('evidence/day/field.md'), timeout?.artifactsMissing);
expect('A-4: a running hop older than 30 min is stuck', report.stuck.some((f) => f.hopId === 'h-stuck'), report.stuck.map((f) => f.hopId));
expect('A-5: the summary is one readable Apollo line', /Atlas patrol:/.test(report.summary) && /h-timeout/.test(report.summary), report.summary);

const budget = patrolFinding(lane, plan.hops[1], { hopId: 'h-budget', reason: 'dispatch-failed:tool-budget', errorClass: 'tool-budget', error: 'hop-tool-budget-exceeded', status: 'parked' }, { now });
expect('A-6: tool budget becomes a replan, not a blind retry', budget.verdict === 'replan' && /narrower|exact files/i.test(budget.recommendation), budget);
const verify = patrolFinding(lane, plan.hops[2], { hopId: 'h-verify', reason: 'verify-failed', error: 'missing marker', status: 'parked' }, { now });
expect('A-7: verify failure becomes a replan around the failing check', verify.verdict === 'replan' && /verify/i.test(verify.recommendation), verify);

const walker = src('src/lib/hop-runtime/walker.ts');
const sheet = src('src/lib/tasks-sheet.ts');
const api = fs.existsSync(path.join(ROOT, 'src/app/api/olympus/atlas/patrol/route.ts'));
expect('A-8: the walker patrols every park', /recordPatrol\(laneRoot/.test(walker) && /patrolFinding\(laneRoot, hop/.test(walker), 'the park still only emits a toast');
expect('A-9: the tasks sheet carries the patrol to the Parthenon', /patrolLane\(lane\)/.test(sheet) && /atlasPatrol/.test(sheet), 'the panel cannot see Atlas');
expect('A-11: lane health honors OLYMPUS_HOME (dev and stable do not share dead lanes)', /process\.env\.OLYMPUS_HOME/.test(src('src/lib/lane-health.ts')), 'lane health still reads the global home');
expect('A-10: Atlas/ Apollo can be asked for the deep analysis', api && /askAtlas/.test(src('src/app/api/olympus/atlas/patrol/route.ts')) && /askApollo/.test(src('src/app/api/olympus/atlas/patrol/route.ts')), 'no model escalation path');

fs.rmSync(lane, { recursive: true, force: true });
fs.rmSync(home, { recursive: true, force: true });
if (previousHome === undefined) delete process.env.OLYMPUS_HOME; else process.env.OLYMPUS_HOME = previousHome;
console.log(failures === 0 ? '\natlas-patrol: all green.' : `\natlas-patrol: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
