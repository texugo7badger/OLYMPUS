#!/usr/bin/env node
/**
 * hibernation-preserve.test.mjs — v0.0.60.
 *
 * The night contract must not cost work. This drill uses a disposable lane:
 * h1 is already complete, h2 was in flight when the window closed, and the
 * hibernation marker + 1h plan are on disk. The resume must keep h1's bytes
 * untouched, finish h2/h3, clear inFlight and leave a clean state.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LANE = '/tmp/opencode/hib-preserve';
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-hib-'));
process.env.OLYMPUS_HOME = HOME;
let failures = 0;
const expect = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
};

fs.rmSync(LANE, { recursive: true, force: true });
fs.mkdirSync(path.join(LANE, 'artifacts'), { recursive: true });
const hop = (id, after) => ({
  id, kind: 'script', god: 'hephaestus',
  command: `mkdir -p artifacts && printf '%s\\n' '${id} ok' > artifacts/${id}.txt`,
  artifacts: [`artifacts/${id}.txt`],
  ...(after ? { after: [after] } : {}),
  verify: { review: 'deterministic', checks: [`file-exists:artifacts/${id}.txt`, `file-contains:artifacts/${id}.txt::${id} ok`] },
  timeoutMs: 30000,
});
fs.writeFileSync(path.join(LANE, 'dispatch-plan.json'), JSON.stringify({
  version: 1,
  laneRoot: LANE,
  hops: [hop('h1'), hop('h2', 'h1'), hop('h3', 'h2')],
}, null, 2) + '\n');
// h1 was completed before the window closed; its bytes are the evidence.
fs.writeFileSync(path.join(LANE, 'artifacts', 'h1.txt'), 'h1 ok\n');
const before = fs.readFileSync(path.join(LANE, 'artifacts', 'h1.txt'), 'utf-8');
// h2 was in flight when the window closed.
fs.writeFileSync(path.join(LANE, '.olympus-hop-state.json'), JSON.stringify({
  version: 1,
  completed: ['h1'],
  parked: null,
  campaignId: 'cmp-hib-drill',
  quarantined: [],
  inFlight: [{ hopId: 'h2', startedAt: new Date().toISOString(), god: 'hephaestus', artifacts: ['artifacts/h2.txt'], status: 'running', lastHeartbeatAt: new Date().toISOString() }],
  updatedAt: new Date().toISOString(),
}, null, 2) + '\n');
// The night contract.
fs.writeFileSync(path.join(HOME, 'hibernation.json'), JSON.stringify({ active: true, at: new Date().toISOString() }, null, 2) + '\n');
fs.writeFileSync(path.join(HOME, 'hibernation-plan.json'), JSON.stringify({
  active: true, hours: 1, until: new Date(Date.now() + 3600_000).toISOString(), autoResume: true, createdAt: new Date().toISOString(),
}, null, 2) + '\n');

const { maybeWalkThePlan } = await import('../src/lib/hop-runtime/post-run.ts');
const result = await maybeWalkThePlan({
  slug: 'hib-preserve', laneRoot: LANE, unattended: true, expectPlan: false, publishActivity: false,
  send: () => {},
});

const state = JSON.parse(fs.readFileSync(path.join(LANE, '.olympus-hop-state.json'), 'utf-8'));
const after = fs.readFileSync(path.join(LANE, 'artifacts', 'h1.txt'), 'utf-8');
const rows = fs.readFileSync(path.join(LANE, '.olympus-hop-telemetry.jsonl'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

expect('HIB-1: the resume walks all three hops', result.walked === true && state.completed.length === 3, JSON.stringify(result).slice(0, 200));
expect('HIB-2: the pre-hibernation artifact is byte-identical', after === before, `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
expect('HIB-3: the in-flight record is cleared, nothing parked', state.inFlight.length === 0 && state.parked == null, JSON.stringify(state).slice(0, 200));
expect('HIB-4: the resumed hops each have a completed telemetry row', rows.filter((r) => r.status === 'completed').length === 2, `${rows.length} rows`);
expect('HIB-5: the hibernating plan did not invent tokens', rows.every((r) => !r.tokensIn && !r.tokensOut), 'script hops must be 0-token');

fs.rmSync(HOME, { recursive: true, force: true });
fs.rmSync(LANE, { recursive: true, force: true });
console.log(failures === 0 ? '\nhibernation-preserve: all green.' : `\nhibernation-preserve: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
