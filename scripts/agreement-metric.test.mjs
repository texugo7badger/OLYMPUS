#!/usr/bin/env node
/**
 * agreement-metric.test.mjs — zero-dependency fixture self-test (Batch 12b, issue #54).
 *
 * Runs scripts/agreement-metric.mjs --json against
 * scripts/agreement-metric.fixture.jsonl and asserts the expected summary
 * numbers and pair shapes:
 *
 *   fixture line | role                                | expectation
 *   -------------+-------------------------------------+---------------------------
 *   1  cls_a     | classification (routeTo apollo)     | joined by id
 *   2  planner   | symphony-dispatch, classification_id| pair 1: join "id", match true
 *   3  cls_b     | classification (routeTo artemis)    | joined by ts (dispatch has no id)
 *   4  tdd-guide | dispatch (no id, +30s after cls_b)  | pair 2: join "ts", match false
 *   5  cls_c     | classification (no dispatch after)  | UNJOINED-CLASSIFICATION
 *   6  code-verf | symphony-dispatch (no id, +10min)   | UNJOINED-DISPATCH
 *
 * Expected: classifications=3, dispatches=3, joined_pairs=2 (id:1, ts:1),
 * matches=1, mismatches=1, agreement_rate=0.5, unjoined_classification=1,
 * unjoined_dispatch=1.
 *
 * Demigod→god resolution uses the repo's real prompt dir (planner→apollo,
 * tdd-guide→dionysus, code-verifier→hephaestus — all verified to exist).
 *
 * Usage: node scripts/agreement-metric.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const METRIC = path.join(SCRIPT_DIR, 'agreement-metric.mjs');
const FIXTURE = path.join(SCRIPT_DIR, 'agreement-metric.fixture.jsonl');

const run = spawnSync(process.execPath, [METRIC, FIXTURE, '--json'], {
  encoding: 'utf-8',
});
if (run.status !== 0) {
  console.error(`FAIL: metric exited ${run.status}`);
  if (run.stderr) console.error(run.stderr);
  process.exit(1);
}

const out = JSON.parse(run.stdout);
const s = out.summary;
const p = out.pairs;

let failures = 0;
function expect(name, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`);
  if (!ok) failures++;
}

expect('classifications', s.classifications, 3);
expect('dispatches', s.dispatches, 3);
expect('joined_pairs', s.joined_pairs, 2);
expect('id_joined_pairs', s.id_joined_pairs, 1);
expect('ts_joined_pairs', s.ts_joined_pairs, 1);
expect('matches', s.matches, 1);
expect('mismatches', s.mismatches, 1);
expect('agreement_rate', s.agreement_rate, 0.5);
expect('unjoined_classification', s.unjoined_classification, 1);
expect('unjoined_dispatch', s.unjoined_dispatch, 1);
expect('unjoined_classification_ts', s.unjoined_classification_ts, ['2026-10-03T10:10:00.000Z']);
expect('unjoined_dispatch_ts', s.unjoined_dispatch_ts, ['2026-10-03T10:20:00.000Z']);

expect('pair count', p.length, 2);
if (p.length === 2) {
  expect('pair[0].intent', p[0].intent, 'apollo');
  expect('pair[0].executed', p[0].executed, 'apollo');
  expect('pair[0].match', p[0].match, true);
  expect('pair[0].join', p[0].join, 'id');
  expect('pair[0].classification_id', p[0].classification_id, 'cls_fixture_a');
  expect('pair[0].demigod', p[0].demigod, 'planner');
  expect('pair[1].intent', p[1].intent, 'artemis');
  expect('pair[1].executed', p[1].executed, 'dionysus');
  expect('pair[1].match', p[1].match, false);
  expect('pair[1].join', p[1].join, 'ts');
  expect('pair[1].classification_id', p[1].classification_id, null);
  expect('pair[1].demigod', p[1].demigod, 'tdd-guide');
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll fixture assertions passed');
process.exit(0);
