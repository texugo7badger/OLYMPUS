#!/usr/bin/env node
/**
 * hop-failure-class.test.mjs — v0.0.86: a park must name its cause.
 *
 * The AIME ledger: 87 parked rows, 75 of them `parked-dispatch-failed` with an
 * EMPTY error and no errorClass. The user could not tell a warm-transport
 * ECONNREFUSED from a tool-budget kill or `Agent not found`. This suite pins
 * the classification, the telemetry cause, the traced script error, the
 * mid-hop lane-health failover, the config-respawn deferral and the honest
 * partial-plan stall.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const expect = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
};
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

const walker = src('src/lib/hop-runtime/walker.ts');
const warm = src('src/lib/hop-runtime/warm-server.ts');
const postRun = src('src/lib/hop-runtime/post-run.ts');
const { classifyDispatchFailure } = await import(ROOT + '/src/lib/hop-runtime/walker.ts');

const cases = [
  ['ECONNREFUSED 127.0.0.1:4096', 'transport'],
  ['Agent not found: "hephaestus-hop"', 'agent-missing'],
  ['Model not found: opencode-go/nope', 'model-missing'],
  ['hop-tool-budget-exceeded after 12 calls', 'tool-budget'],
  ['provider.quota: monthly limit reached', 'provider'],
  ['APIError 402 payment required', 'provider'],
  ['ceiling-kill (OLYMPUS_HOP_TIMEOUT_MS 1500000ms): the stream hung', 'timeout'],
  ['script exit 1 — set -euo pipefail', 'script'],
  ['something odd happened', 'unknown'],
];
for (const [text, expected] of cases) {
  const got = classifyDispatchFailure({ error: text });
  expect(`F-1: '${text.slice(0, 42)}' → ${expected}`, got === expected, got);
}
expect('F-2: an explicit provider class wins', classifyDispatchFailure({ error: 'whatever', errorClass: 'provider.no-route' }) === 'provider', 'class ignored');

expect('F-3: the telemetry row carries the error, the class and the failed check', /error: String\(r\.error \?\? ''\)\.slice\(0, 2_000\)/.test(walker) && /errorClass: r\.errorClass \?\? classifyDispatchFailure\(r\)/.test(walker) && /failedCheck: extra\.failedCheck/.test(walker), 'grey row');
expect('F-4: the park reason names the class (never bare dispatch-failed)', /parkHop\(next, `dispatch-failed:\$\{failureClass\}`/.test(walker) && /parkHop\(next, 'script-failed', result\.error\)/.test(walker), 'bare bucket');
expect('F-5: a failing script is traced and names its first command', /set -x\\n\$\{command\}/.test(walker) && /script exit \$\{code\} — \$\{firstLine\}/.test(walker) && /script-timeout \(\$\{timeoutMs\}ms\) — \$\{firstLine\}/.test(walker), 'silent exit 1');
expect('F-6: a lane marked dead is refused before any retry (and at attempt 0)', /if \(!isLaneAvailable\(lane\)\)/.test(walker) && /failing over instead of dispatching on it/.test(walker), 'no lane health check');
expect('F-7: a config change waits for the hop boundary', /cached\.activeTurns \?\? 0\) > 0/.test(warm) && /deferring the respawn to the hop boundary/.test(warm), 'respawn kills an in-flight hop');
expect('F-8: a partial plan is never called walked', /blocked-dependencies/.test(walker) && /walk-stopped-early/.test(walker) && /pendingAtEnd\.length > 0 && !parkedHop/.test(walker), 'silent partial success');
expect('F-9: a fixed plan clears the stale quarantine', /plan changed after the last park/.test(walker) && /quarantined\.clear\(\)/.test(walker), 'fixed hop stays quarantined');
expect('F-10: the summary still distinguishes parked from walked', /Plan parked at hop/.test(postRun) && /The plan is walked/.test(postRun), 'summary lost its branches');

const laneHealth = await import(ROOT + '/src/lib/lane-health.ts');
const laneSrc = src('src/lib/lane-health.ts');
expect('F-11: a ceiling-kill maps to the timeout lane status', laneHealth.statusFromErrorClass('timeout') === 'timeout' && laneHealth.isLaneDeadClass('provider.timeout') === true, laneSrc.slice(0, 0));
expect('F-12: the dispatcher quarantines a timed-out lane and tries one alternative', /timeoutFailovers < 1/.test(walker) && /markLaneDead\(lane, 'timeout', 10 \* 60_000/.test(walker) && /trying the next lane/.test(walker), 'a timed-out lane absorbs the whole chain');

const postSrc = src('src/lib/hop-runtime/post-run.ts');
expect('F-13: only a hop_parked event formats a park (no undefined parks)', /else if \(ev\.type === 'hop_parked'\)/.test(postSrc) && /campaign_end \/ hop_verify \/ future event types are NOT parks/.test(postSrc), 'unknown events still print undefined parks');
expect('F-14: a lane is health-checked before the FIRST attempt too', /if \(!isLaneAvailable\(lane\)\)/.test(walker), 'attempt 0 can launch on a dead lane');

console.log(failures === 0 ? '\nhop-failure-class: all green.' : `\nhop-failure-class: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
