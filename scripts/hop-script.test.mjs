#!/usr/bin/env node
/**
 * hop-script.test.mjs — v0.0.31 (R31-08).
 *
 * Deterministic script steps: zero LLM tokens, the exit code is the gate.
 * Ingestion/seed/build/lint must never burn a 25-minute god turn again.
 *
 * Run: npx tsx scripts/hop-script.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { validateDispatchPlan } from '../src/lib/hop-runtime/plan-schema.ts';
import { walkPlan } from '../src/lib/hop-runtime/walker.ts';

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

// ── Schema ──────────────────────────────────────────────────────────────────
const good = validateDispatchPlan({
  version: 1,
  laneRoot: '/tmp/lane',
  hops: [{ id: 's1', kind: 'script', command: 'node -e "1"', artifacts: [] }],
});
ok('a script hop needs no god or prompt (defaults apply)', () => {
  assert.equal(good.ok, true, JSON.stringify(good));
  if (good.ok) {
    assert.equal(good.plan.hops[0].kind, 'script');
    assert.equal(good.plan.hops[0].god, 'system');
    assert.match(good.plan.hops[0].prompt, /deterministic script/);
  }
});
const noCommand = validateDispatchPlan({
  version: 1, laneRoot: '/tmp/lane',
  hops: [{ id: 's1', kind: 'script', artifacts: [] }],
});
ok('a script hop without a command is rejected', () => {
  assert.equal(noCommand.ok, false);
  if (!noCommand.ok) assert.ok(noCommand.errors.some((e) => /command/.test(e)));
});
const badTimeout = validateDispatchPlan({
  version: 1, laneRoot: '/tmp/lane',
  hops: [{ id: 's1', kind: 'script', command: 'true', timeoutMs: 999, artifacts: [] }],
});
ok('a script timeout outside 1s..30min is rejected', () => {
  assert.equal(badTimeout.ok, false);
  if (!badTimeout.ok) assert.ok(badTimeout.errors.some((e) => /timeoutMs/.test(e)));
});
const llmNoGod = validateDispatchPlan({
  version: 1, laneRoot: '/tmp/lane',
  hops: [{ id: 'l1', prompt: 'do it', artifacts: [] }],
});
ok('an LLM hop still requires a god and a prompt', () => assert.equal(llmNoGod.ok, false));

// ── Walk: a green script ────────────────────────────────────────────────────
const lane = mkdtempSync(join(tmpdir(), 'olympus-script-lane-'));
const state = mkdtempSync(join(tmpdir(), 'olympus-script-state-'));
const plan = {
  version: 1,
  laneRoot: lane,
  hops: [
    {
      id: 's-green',
      kind: 'script',
      command: `node -e "require('fs').writeFileSync('script-out.txt','ok'); console.log('script-green')"`,
      artifacts: ['script-out.txt'],
      verify: { checks: ['file-exists:script-out.txt'] },
    },
  ],
};
let dispatcherCalls = 0;
const walk = await walkPlan({
  plan,
  stateDir: state,
  dispatcher: async () => { dispatcherCalls++; throw new Error('the LLM dispatcher must not run a script hop'); },
});
ok('a green script completes without the LLM dispatcher', () => {
  assert.equal(dispatcherCalls, 0);
  assert.ok(walk.completed.includes('s-green'), JSON.stringify(walk));
  assert.ok(existsSync(join(lane, 'script-out.txt')));
});
ok('the script telemetry carries 0 tokens and the output tail', () => {
  const rows = readFileSync(join(state, '.olympus-hop-telemetry.jsonl'), 'utf-8').trim().split('\n').map(JSON.parse);
  const row = rows.find((r) => r.hop === 's-green');
  assert.ok(row, JSON.stringify(rows));
  assert.equal(row.status, 'completed');
  assert.equal(row.tokensIn, 0);
  assert.equal(row.tokensOut, 0);
  assert.ok(String(row.outputTail).includes('script-green'), JSON.stringify(row));
});

// ── Walk: a red script parks, never rescues ─────────────────────────────────
const lane2 = mkdtempSync(join(tmpdir(), 'olympus-script-lane2-'));
const state2 = mkdtempSync(join(tmpdir(), 'olympus-script-state2-'));
const plan2 = {
  version: 1,
  laneRoot: lane2,
  hops: [
    {
      id: 's-red',
      kind: 'script',
      command: 'node -e "console.error(\'boom\'); process.exit(3)"',
      artifacts: [],
    },
  ],
};
const walk2 = await walkPlan({ plan: plan2, stateDir: state2 });
ok('a failing script parks with script-failed (no artifact rescue)', () => {
  assert.equal(walk2.parked?.hopId, 's-red', JSON.stringify(walk2));
  assert.equal(walk2.parked?.reason, 'script-failed');
  assert.match(String(walk2.parked?.error), /exit 3/);
});
ok('the failing script writes a parked-script-failed telemetry row', () => {
  const rows = readFileSync(join(state2, '.olympus-hop-telemetry.jsonl'), 'utf-8').trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].status, 'parked-script-failed');
});

console.log(`\nhop-script: ${passed} passed`);

process.exit(process.exitCode ?? 0);
