#!/usr/bin/env node
/**
 * opencode-session.test.mjs — #61 deterministic retry fixture (BATCH 13)
 * + #107 the retry crescendo (FLUENCY-1): class-aware, env-overridable
 *   patience — resolveRetryPlan (default crescendo + OLYMPUS_RETRY_BACKOFF_MS
 *   override + OLYMPUS_RETRY_RATE_LIMIT_MS + OLYMPUS_RETRY_JITTER), the finer
 *   classifyRetry classes (429 = the key-limit path, NOT the crescendo), the
 *   patience ledger on the exhaustion card, the retry count following the env
 *   list. Existing scenarios ride the env override so the battery never
 *   sleeps the (minutes-by-design) default crescendo.
 * Run: npx tsx scripts/opencode-session.test.mjs   (exit 0 = pass)
 *
 * Zero live dependencies: a local stub server plays the opencode serve
 * (adopted through the REAL #57-fixed pidfile adoption path), and error
 * injection is a mutable mode flag on the stub — no real provider, no real
 * vault writes. The stub counts concurrent POSTs to prove NO provider
 * parallelism (spec: retries are strictly sequential).
 *
 * Scenario 1 (recover): POST /session/<id>/message → 503, 503, then 200
 *   with a text part. Assert: run completes (code 0, no human input);
 *   transcript contains 'retry 1/2: upstream 503' and 'retry 2/2: upstream
 *   503'; max concurrent POSTs === 1 (no parallel second connection).
 * Scenario 2 (exhaust): POST always 503. Assert: after 2 retries the
 *   exhaustion guidance fires ('RETRY EXHAUSTED after 2 retries',
 *   no-auto-switch line, alternatives line naming present keys).
 *
 * Real-state hygiene: the opencode-server pidfile is saved and restored
 * verbatim; the benchmark accumulator may append a metrics row on exit
 * (same file the 12d campaign wrote — disclosed in the FACTS-LEDGER).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import http from 'node:http';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// #70 (GAP-1-S1): derive the repo root from this file's own location — the
// checkpoint.test.mjs pattern — so the suite runs on any box. The old
// hardcode ('/home/texugo/Projects/olympus') made it ERR_MODULE_NOT_FOUND
// everywhere else.
const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIDFILE = path.join(os.homedir(), '.olympus', 'opencode-server.pid');
const PASSWORD = 'test-' + Math.random().toString(36).slice(2, 18);

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 160)}`);
  if (!cond) failures++;
}

// ─── Stub server ──────────────────────────────────────────────────────────────
const stub = { mode: 'recover', postCount: 0, concurrent: 0, maxConcurrent: 0, eventStreams: 0, abortsReceived: 0, hangCount: 0, hungStreams: 0 };

const server = http.createServer((req, res) => {
  const auth = req.headers.authorization || '';
  const authed = auth === `Basic ${Buffer.from('opencode:' + PASSWORD).toString('base64')}`;
  const url = req.url || '';

  if (url.startsWith('/config')) {
    if (!authed) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ models: {} }));
  }
  if (url.startsWith('/event')) {
    if (!authed) { res.writeHead(401); return res.end(); }
    stub.eventStreams++;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    // Hold open; the attempt aborts the pump at completion.
    const keep = setInterval(() => { try { res.write(': keepalive\n\n'); } catch {} }, 1000);
    res.on('close', () => clearInterval(keep));
    return;
  }
  if (req.method === 'POST' && /\/session\/[^/]+\/abort$/.test(url)) {
    if (!authed) { res.writeHead(401); return res.end(); }
    stub.abortsReceived++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{}');
  }
  if (req.method === 'POST' && /\/session\/[^/]+\/message$/.test(url)) {
    if (!authed) { res.writeHead(401); return res.end(); }
    stub.concurrent++; stub.maxConcurrent = Math.max(stub.maxConcurrent, stub.concurrent);
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      stub.postCount++;
      if (stub.mode === 'always-503' || (stub.mode === 'recover' && stub.postCount <= 2)) {
        stub.concurrent--;
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ data: { message: 'provider_overloaded (stub)' } }));
      }
      // #107: the 429 key-limit class — a fixed cap-aware lane, distinct
      // from the pool-contention crescendo.
      if (stub.mode === 'always-429') {
        stub.concurrent--;
        res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ data: { message: 'rate limit exceeded (stub)' } }));
      }
      // #98: the UAT starvation class — HTTP 200, the message-level error the
      // DB recorded verbatim on 2026-10-07 (UnknownError, NO statusCode,
      // finish absent, zero parts — the exact shape the UAT night left in
      // opencode.db). Pre-cure this response class collapsed to the generic
      // string and the run died raw.
      if (stub.mode === 'overload-part-then-recover' && stub.postCount <= 1) {
        stub.concurrent--;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          info: { id: 'msg_ovl', sessionID: 'sess', role: 'assistant',
            error: { name: 'UnknownError', data: { message: '"Service temporarily overloaded"' } } },
          parts: [],
        }));
      }
      if (stub.mode === 'overload-part-always') {
        stub.concurrent--;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          info: { id: 'msg_ovl', sessionID: 'sess', role: 'assistant',
            error: { name: 'UnknownError', data: { message: '"Service temporarily overloaded"' } } },
          parts: [],
        }));
      }
      if (stub.mode === 'hang-then-recover' && stub.postCount <= stub.hangCount) {
        // #62 stall scenario: never respond — the watchdog must fire.
        stub.hungStreams = (stub.hungStreams || 0) + 1;
        res.on('close', () => { stub.concurrent--; });
        return; // hang
      }
      stub.concurrent--;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        info: { id: 'msg_test', sessionID: 'sess', role: 'assistant', finish: 'stop' },
        parts: [{ id: 'prt1', type: 'text', text: 'stub-reply-after-retries' }],
      }));
    });
    return;
  }
  res.writeHead(404); res.end('{}');
});

// ─── Pidfile save + stub adoption ──────────────────────────────────────────────
const savedPidfile = fs.existsSync(PIDFILE) ? fs.readFileSync(PIDFILE, 'utf-8') : null;

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  fs.mkdirSync(path.dirname(PIDFILE), { recursive: true });
  fs.writeFileSync(PIDFILE, JSON.stringify({ pid: process.pid, port, password: PASSWORD }, null, 2));

  const { runWarmMessage } = await import(OLYMPUS + '/src/lib/opencode-session.ts');

  // #107: the fixture injects its own patience — the default crescendo is
  // minutes BY DESIGN (it costs $0 on free, only time); the suite rides the
  // env override + jitter 0 so the battery stays deterministic and fast.
  process.env.OLYMPUS_RETRY_BACKOFF_MS = '10, 10';
  process.env.OLYMPUS_RETRY_JITTER = '0';

  const transcript = [];
  const onEvent = (ev) => transcript.push(ev);
  const sessionId = 'test-61-' + Date.now();

  // ── Scenario 1: recover after two 503s ──
  stub.mode = 'recover';
  const r1 = await runWarmMessage({
    sessionId, text: 'fixture prompt', agent: 'apollo', onEvent, maxRuntimeMs: 60_000,
  });
  const t1 = transcript.map(e => e.type + ':' + (e.msg || e.part?.text || '')).join('\n');
  expect('S1: run completes without human input', r1.code === 0, JSON.stringify(r1));
  expect('S1: both retry attempts in transcript', t1.includes('retry 1/2: upstream 503') && t1.includes('retry 2/2: upstream 503'), t1);
  expect('S1: stub reply delivered', t1.includes('stub-reply-after-retries'), t1);
  expect('S1: NO parallel second connection (max concurrent POST = 1)', stub.maxConcurrent === 1, 'max=' + stub.maxConcurrent);
  expect('S1: exactly 3 POSTs (1 initial + 2 retries)', stub.postCount === 3, 'count=' + stub.postCount);

  // ── Scenario 2: exhaustion → loud guidance ──
  transcript.length = 0;
  stub.mode = 'always-503';
  const r2 = await runWarmMessage({
    sessionId, text: 'fixture prompt 2', agent: 'apollo', onEvent, maxRuntimeMs: 60_000,
  });
  const t2 = transcript.map(e => e.type + ':' + (e.msg || '')).join('\n');
  expect('S2: run fails (non-zero)', r2.code !== 0, JSON.stringify(r2).slice(0, 120));
  expect('S2: exhaustion line', t2.includes('RETRY EXHAUSTED after 2 retries'), t2.slice(0, 400));
  expect('S2: no silent downgrade (explicit wording)', /no strategy was auto-switched/i.test(t2), t2.slice(0, 400));
  expect('S2: alternatives line present (#56-style)', /Alternatives whose key IS present|No alternative free strategy has a key present/.test(t2), t2.slice(0, 400));
  expect('S2: guidance names the explicit switch command', t2.includes('apply-strategy'), t2.slice(0, 400));
  expect('S2: still no parallelism', stub.maxConcurrent === 1, 'max=' + stub.maxConcurrent);

  // ── Scenario 3 (#62): stall → auto-continue nudge → recovery ──
  // Injected-short watchdog windows via the env tunables (never wall-clock
  // sleeps on production budgets): warn 1s, stall 3s. The first POST hangs
  // (no response) — the watchdog must fire the nudge, abort with
  // stream_idle_timeout, and the #61 retry layer re-posts (the automated
  // "Continue!"); the second POST succeeds.
  process.env.OLYMPUS_SILENCE_WARN_MS = '1000';
  process.env.OLYMPUS_SILENCE_STALL_MS = '3000';
  stub.mode = 'hang-then-recover';
  stub.hangCount = 1;
  stub.postCount = 0; // per-scenario reset — the counter is cumulative across S1/S2
  transcript.length = 0;
  const r3 = await runWarmMessage({
    sessionId, text: 'fixture prompt 3', agent: 'apollo', onEvent, maxRuntimeMs: 60_000,
    complexity: 'simple',
  });
  const t3 = transcript.map(e => e.type + ':' + (e.msg || e.part?.text || '')).join('\n');
  expect('S3: stalled run AUTO-RESUMES (completes after the nudge)', r3.code === 0, JSON.stringify(r3).slice(0, 140));
  expect('S3: auto-continue nudge fired EXACTLY once', (t3.match(/auto-continue nudge \(#62\)/g) || []).length === 1, t3.slice(0, 400));
  expect('S3: nudge precedes the retry line (nudge-then-retry ordering)', t3.indexOf('auto-continue nudge') < t3.indexOf('retry 1/2'), t3.slice(0, 400));
  expect('S3: retry line carries stream_idle_timeout', /retry 1\/2: [^\n]*stream_idle_timeout/.test(t3), t3.slice(0, 400));
  expect('S3: stub reply delivered after auto-resume', t3.includes('stub-reply-after-retries'), t3.slice(-200));
  expect('S3: still sequential (max concurrent POST = 1)', stub.maxConcurrent === 1, 'max=' + stub.maxConcurrent);
  delete process.env.OLYMPUS_SILENCE_WARN_MS;
  delete process.env.OLYMPUS_SILENCE_STALL_MS;

  // ── Unit layer (#62): watchdogDecision decision table + class scale ──
  const { watchdogDecision, complexityScale } = await import(OLYMPUS + '/src/lib/opencode-session.ts');
  const W = { warnMs: 60_000, stallMs: 150_000, permissionPending: false };
  expect('U: quiet below warn', watchdogDecision({ ...W, silentForMs: 30_000 }) === 'quiet', 'want quiet');
  expect('U: warn at warnMs', watchdogDecision({ ...W, silentForMs: 70_000 }) === 'warn', 'want warn');
  expect('U: nudge-abort at stallMs (no permission)', watchdogDecision({ ...W, silentForMs: 150_000 }) === 'nudge-abort', 'want nudge-abort');
  expect('U: permission-pending OVERRIDES the nudge at stallMs', watchdogDecision({ ...W, silentForMs: 300_000, permissionPending: true }) === 'permission-pending', 'want permission-pending');
  expect('U: complexityScale: architectural → 3', complexityScale('architectural') === 3, 'want 3');
  expect('U: complexityScale: complex → 3', complexityScale('complex') === 3, 'want 3');
  expect('U: complexityScale: simple → 1', complexityScale('simple') === 1, 'want 1');
  expect('U: complexityScale: absent → 1', complexityScale(null) === 1, 'want 1');

  // ── Scenario 4 (#60): client gone mid-run (attended, short grace) ──
  // The POST hangs; the CLIENT's signal aborts at +1s; the grace window
  // (env-tuned to 1.5s) elapses; the stub then receives /session/<id>/abort;
  // the result carries the run_abandoned payload (session_id + last_event_ts
  // + grace_ms). No zombie: the stub abort endpoint answered, and the
  // attempt returned.
  process.env.OLYMPUS_ABORT_GRACE_MS = '1500';
  stub.mode = 'hang-then-recover';
  stub.hangCount = 99; // hang every POST in this scenario
  stub.postCount = 0;
  transcript.length = 0;
  const clientSignal4 = new AbortController();
  setTimeout(() => clientSignal4.abort(), 1000);
  const tAbort0 = Date.now();
  const r4 = await runWarmMessage({
    sessionId, text: 'fixture prompt 4 (attended)', agent: 'apollo', onEvent,
    signal: clientSignal4.signal, maxRuntimeMs: 60_000, complexity: 'simple',
  });
  expect('S4: client-gone run returns (no zombie watcher)', r4.code === -1 && r4.error === 'aborted', JSON.stringify(r4).slice(0, 120));
  expect('S4: server-side /abort POST received after grace', stub.abortsReceived >= 1, 'aborts=' + stub.abortsReceived);
  expect('S4: run_abandoned payload present', !!r4.abandoned && r4.abandoned.session_id === sessionId && r4.abandoned.grace_ms === 1500, JSON.stringify(r4.abandoned));
  expect('S4: payload carries last_event_ts (ISO)', typeof r4.abandoned?.last_event_ts === 'string' && !Number.isNaN(Date.parse(r4.abandoned.last_event_ts)), r4.abandoned?.last_event_ts);
  expect('S4: grace elapsed before the abort (>=1.5s wall)', Date.now() - tAbort0 >= 1500, 'too fast');
  delete process.env.OLYMPUS_ABORT_GRACE_MS;

  // ── Scenario 5 (#60): unattended_mode → abort-on-client-gone IMMEDIATE ──
  const abortsBefore = stub.abortsReceived;
  stub.postCount = 0;
  transcript.length = 0;
  const clientSignal5 = new AbortController();
  setTimeout(() => clientSignal5.abort(), 800);
  const r5 = await runWarmMessage({
    sessionId,
    text: '[OLYMPUS UNATTENDED MODE]\nThis run is unattended.\nfixture prompt 5',
    agent: 'apollo', onEvent, signal: clientSignal5.signal, maxRuntimeMs: 60_000,
  });
  expect('S5: unattended client-gone → grace 0 (immediate abort)', r5.abandoned?.grace_ms === 0, JSON.stringify(r5.abandoned));
  expect('S5: server /abort received (unattended immediate)', stub.abortsReceived > abortsBefore, `aborts=${stub.abortsReceived} (was ${abortsBefore})`);

  // ── Scenario 6 (#98): the UAT starvation class — an in-stream provider
  // overload with NO statusCode (the 2026-10-07 UAT death, DB shape verbatim)
  // must reach classifyRetry as REAL text → provider-class retry with
  // backoff → recovery (A) or the loud exhaustion guidance carrying the real
  // message (B). Pre-cure both died raw: the attempt return collapsed every
  // in-run error to 'OpenCode reported an error during the run' →
  // classifyRetry null → no retry line, no guidance, bare exit -1 (the
  // user's "Continue!" hit the same wall instantly).
  stub.mode = 'overload-part-then-recover';
  stub.postCount = 0;
  transcript.length = 0;
  const r6 = await runWarmMessage({ sessionId, text: 'fixture prompt 6', agent: 'apollo', onEvent, maxRuntimeMs: 60_000 });
  const t6 = transcript.map(e => e.type + ':' + (e.msg || e.part?.text || '')).join('\n');
  expect('S6: in-stream overload (no statusCode) RECOVERS via the provider retry', r6.code === 0, JSON.stringify(r6).slice(0, 140));
  expect('S6: the retry line fires with the REAL provider text (starvation cured)', /retry 1\/2:[^\n]*Service temporarily overloaded/.test(t6), t6.slice(0, 400));
  expect('S6: the retry line names the PROVIDER class (not "Transport failure")', /retry 1\/2: Provider error/.test(t6), t6.slice(0, 400));
  expect('S6: the UI error line carries the verbatim provider message', t6.includes('OpenCode error: "Service temporarily overloaded"'), t6.slice(0, 400));
  expect('S6: still sequential (max concurrent POST = 1)', stub.maxConcurrent === 1, 'max=' + stub.maxConcurrent);

  stub.mode = 'overload-part-always';
  stub.postCount = 0;
  transcript.length = 0;
  const r6b = await runWarmMessage({ sessionId, text: 'fixture prompt 6b', agent: 'apollo', onEvent, maxRuntimeMs: 60_000 });
  const t6b = transcript.map(e => e.type + ':' + (e.msg || '')).join('\n');
  expect('S6B: permanent in-stream overload fails (non-zero)', r6b.code !== 0, JSON.stringify(r6b).slice(0, 120));
  expect('S6B: exhaustion guidance fires on the in-stream overload path', t6b.includes('RETRY EXHAUSTED after 2 retries'), t6b.slice(0, 500));
  expect('S6B: guidance names the REAL error text (not the generic string)', /failed with:[^\n]*Service temporarily overloaded/.test(t6b), t6b.slice(0, 500));
  expect('S6B: no silent downgrade (explicit wording)', /no strategy was auto-switched/i.test(t6b), t6b.slice(0, 500));
  expect('S6B: alternatives line present (#56-style)', /Alternatives whose key IS present|No alternative free strategy has a key present/.test(t6b), t6b.slice(0, 500));
  expect('S6B: exactly 3 POSTs before the loud death', stub.postCount === 3, 'count=' + stub.postCount);

  // ── #107 unit layer: resolveRetryPlan + applyRetryJitter + the finer
  // classifyRetry classes. RED at writing: none of the three exist
  // (classifyRetry is module-private with the coarse 2-class shape).
  const {
    resolveRetryPlan, applyRetryJitter, classifyRetry: classifyRetry107,
    retryExhaustionGuidance: guidance107,
  } = await import(OLYMPUS + '/src/lib/opencode-session.ts');
  const crescendoReady = typeof resolveRetryPlan === 'function'
    && typeof applyRetryJitter === 'function'
    && typeof classifyRetry107 === 'function';
  if (!crescendoReady) {
    expect('U2: resolveRetryPlan exported (the crescendo resolver)', typeof resolveRetryPlan === 'function', 'missing — the 20s hard-coded WARM_RETRY_PLAN still rules (opencode-session.ts:1295)');
    expect('U2: applyRetryJitter exported (the 0-30% spread)', typeof applyRetryJitter === 'function', 'missing');
    expect('U2: classifyRetry exported for the fixture', typeof classifyRetry107 === 'function', 'module-private — the finer classes unassertable');
    expect('S9: the 429 key-limit path + the patience ledger (blocked on the resolver)', false, 'blocked: the #107 surface is absent');
  } else {
  const planDefault = resolveRetryPlan({});
  expect('U2: default plan = the crescendo [5s,30s,120s,300s] (#107)', JSON.stringify(planDefault.backoffMs) === JSON.stringify([5000, 30000, 120000, 300000]), JSON.stringify(planDefault));
  expect('U2: default attempts = list length + 1 (5 — ~7.5 min patience, $0 on free)', planDefault.maxAttempts === 5, 'maxAttempts=' + planDefault.maxAttempts);
  const planEnv = resolveRetryPlan({ OLYMPUS_RETRY_BACKOFF_MS: '10, 10' });
  expect('U2: env override parsed (comma list, spaces tolerated)', JSON.stringify(planEnv.backoffMs) === JSON.stringify([10, 10]) && planEnv.maxAttempts === 3, JSON.stringify(planEnv));
  const planJunk = resolveRetryPlan({ OLYMPUS_RETRY_BACKOFF_MS: 'abc' });
  expect('U2: junk env falls back to the default crescendo', JSON.stringify(planJunk.backoffMs) === JSON.stringify([5000, 30000, 120000, 300000]), JSON.stringify(planJunk));
  const planPartial = resolveRetryPlan({ OLYMPUS_RETRY_BACKOFF_MS: '10,abc,20' });
  expect('U2: junk entries dropped, honest entries kept', JSON.stringify(planPartial.backoffMs) === JSON.stringify([10, 20]), JSON.stringify(planPartial));
  const rlPlan = resolveRetryPlan({ OLYMPUS_RETRY_RATE_LIMIT_MS: '42' });
  expect('U2: the 429 lane has its own env-tunable fixed backoff (cap-aware)', rlPlan.rateLimitBackoffMs === 42, JSON.stringify(rlPlan));
  const jitPlan = resolveRetryPlan({ OLYMPUS_RETRY_JITTER: '0' });
  expect('U2: jitter is env-tunable (0 = deterministic, the fixture shape)', jitPlan.jitterFraction === 0, JSON.stringify(jitPlan));
  expect('U2: jitter(1000, 0) = 1000 (floor)', applyRetryJitter(1000, 0, 0.30) === 1000, String(applyRetryJitter(1000, 0, 0.30)));
  expect('U2: jitter(1000, 1) = 1300 (ceiling +30%)', applyRetryJitter(1000, 1, 0.30) === 1300, String(applyRetryJitter(1000, 1, 0.30)));
  expect('U2: jitter(1000, .5) = 1150 (mid)', applyRetryJitter(1000, 0.5, 0.30) === 1150, String(applyRetryJitter(1000, 0.5, 0.30)));
  expect('U2: jitter(1000, 1, 0) = 1000 (off)', applyRetryJitter(1000, 1, 0) === 1000, String(applyRetryJitter(1000, 1, 0)));
  expect('U2: classify 429 -> provider-rate-limit (the key-limit path, NOT the crescendo)', classifyRetry107({ code: -1, error: 'upstream 429', statusCode: 429 }) === 'provider-rate-limit', 'kind?');
  expect('U2: classify 503 -> provider-overload (the crescendo class)', classifyRetry107({ code: -1, error: 'upstream 503', statusCode: 503 }) === 'provider-overload', 'kind?');
  expect('U2: classify in-stream "Service temporarily overloaded" (no status) -> provider-overload', classifyRetry107({ code: -1, error: 'OpenCode error: "Service temporarily overloaded"', statusCode: undefined }) === 'provider-overload', 'kind?');
  expect('U2: classify stream_idle_timeout -> provider-overload', classifyRetry107({ code: -1, error: 'stream_idle_timeout', statusCode: undefined }) === 'provider-overload', 'kind?');
  expect('U2: classify 401 -> NEVER (the auth class untouched)', classifyRetry107({ code: -1, error: 'upstream 401', statusCode: 401 }) === null, 'kind?');
  expect('U2: classify transport text -> transport', classifyRetry107({ code: -1, error: 'fetch failed ECONNREFUSED', statusCode: undefined }) === 'transport', 'kind?');

  // ── Scenario 9 (#107): the 429 key-limit path through the REAL loop —
  // fixed cap-aware backoff (never the crescendo element), the exhaustion
  // count follows the ENV list, the patience ledger fires on the card.
  process.env.OLYMPUS_RETRY_BACKOFF_MS = '5, 5, 5';
  process.env.OLYMPUS_RETRY_RATE_LIMIT_MS = '10';
  stub.mode = 'always-429';
  stub.postCount = 0;
  transcript.length = 0;
  const r9 = await runWarmMessage({ sessionId, text: 'fixture prompt 9', agent: 'apollo', onEvent, maxRuntimeMs: 60_000 });
  const t9 = transcript.map(e => e.type + ':' + (e.msg || '')).join('\n');
  expect('S9: 429 run exhausts (non-zero)', r9.code !== 0, JSON.stringify(r9).slice(0, 120));
  expect('S9: the exhaustion retry count follows the ENV list (3 entries -> 3 retries)', t9.includes('RETRY EXHAUSTED after 3 retries'), t9.slice(0, 500));
  expect('S9: the patience ledger names the total wait + the class census', t9.includes('Patience ledger: waited 30ms across 3 retries (upstream 429 x3)'), t9.slice(0, 600));
  expect('S9: the ledger total PROVES the fixed lane (3x10ms=30ms; the crescendo would read 15ms)', t9.includes('waited 30ms') && !t9.includes('waited 15ms'), t9.slice(0, 600));
  expect('S9: the rate-limit retry line names the class', /retry 3\/3: [^\n]*upstream 429/.test(t9), t9.slice(0, 600));
  expect('S9: exactly 4 POSTs (1 initial + 3 retries — the env list is the truth)', stub.postCount === 4, 'count=' + stub.postCount);
  delete process.env.OLYMPUS_RETRY_BACKOFF_MS;
  delete process.env.OLYMPUS_RETRY_RATE_LIMIT_MS;
  process.env.OLYMPUS_RETRY_BACKOFF_MS = '10, 10'; // restore the fixture patience for the remaining scenarios

  // ── Scenario 10 (SMOKE-1 rider R2): the exhaustion card's arithmetic must
  // SELF-RECONCILE — the headline count, the ledger count, and the printed
  // plan all describe the SAME run. The auditor's specimen (the FLUENCY-1
  // live card, s2/live-card-proof.txt): "RETRY EXHAUSTED after 4 retries …
  // waited 65000ms across 2 retries … the plan was [5000, 30000, 120000,
  // 300000]" — 4 ≠ 2, and 65000 (5s+60s) is no prefix of the printed plan.
  // The card must print the plan the loop USED, and the counts must agree
  // ON the card. Fixture auth tree, never the real vault.
  expect('S10/R2: retryExhaustionGuidance exported (the card composer)', typeof guidance107 === 'function', 'missing');
  if (typeof guidance107 === 'function') {
    const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-r2-auth-'));
    // Reproduce the specimen exactly: the card composed with NO env patience
    // in process.env (today's code re-resolves the DEFAULT plan) against the
    // env-shaped run's ledger. The cured signature takes the plan the loop
    // USED as a parameter, so env state stops mattering.
    delete process.env.OLYMPUS_RETRY_BACKOFF_MS;
    delete process.env.OLYMPUS_RETRY_RATE_LIMIT_MS;
    fs.writeFileSync(path.join(authDir, 'auth.json'), JSON.stringify({ nvidia: 'fixture-key', 'opencode-go': { key: 'fixture' } }));
    // The specimen inputs: an env-shaped plan (5000,60000) + its 2-retry ledger.
    const specimenPlan = resolveRetryPlan({ OLYMPUS_RETRY_BACKOFF_MS: '5000,60000' });
    const specimenLedger = { waitedMs: 65000, labels: ['upstream 503', 'upstream 503'] };
    const card = guidance107('fetch failed', 503, specimenLedger, [authDir], specimenPlan);
    const head = card.match(/RETRY EXHAUSTED after (\d+) retries/);
    const ledg = card.match(/across (\d+) retries/);
    const planLine = card.match(/the plan was \[([0-9,\s]+)\]/);
    expect('S10/R2: the plan PRINTED is the plan USED (the env override, not a fresh default re-resolution)',
      !!planLine && planLine[1].replace(/\s+/g, '') === '5000,60000', card.split('\n').slice(0, 2).join(' | '));
    expect('S10/R2: the headline count === the ledger count (2 === 2; the specimen was 4 ≠ 2)',
      !!head && !!ledg && head[1] === ledg[1] && head[1] === '2', `headline=${head?.[1]} ledger=${ledg?.[1]}`);
    expect('S10/R2: the ledger total (65000ms) is echoed — the numbers explain themselves ON the card',
      /waited 65000ms across 2 retries \(upstream 503 x2\)/.test(card), card.split('\n')[1] || '');
    // A 429-class ledger under a mixed run: the fixed lane must be NAMED on
    // the card, or the total (3 x the fixed lane) can never be reconciled
    // against the printed crescendo list.
    const card429 = guidance107('upstream 429', 429,
      { waitedMs: 30000, labels: ['upstream 429', 'upstream 429', 'upstream 429'] },
      [authDir], resolveRetryPlan({ OLYMPUS_RETRY_BACKOFF_MS: '5,5,5', OLYMPUS_RETRY_RATE_LIMIT_MS: '10000' }));
    expect('S10/R2: a 429-class ledger names the fixed key-limit lane ON the card (10000ms fixed per retry)',
      /429[^\n]*key-limit lane[^\n]*10000\s*ms/i.test(card429) || /key-limit lane[^\n]*10000\s*ms/i.test(card429),
      card429.split('\n').slice(0, 3).join(' | '));
    fs.rmSync(authDir, { recursive: true, force: true });
    process.env.OLYMPUS_RETRY_BACKOFF_MS = '10, 10'; // restore the fixture patience for the remaining scenarios
  }
  } // crescendoReady

  // ── Route-side telemetry emission: content assertion (the feed write
  // lives in streamWarm — not directly callable; its contract is pinned) ──
  const routeSrc = readFileSync(OLYMPUS + '/src/app/api/olympus/action/route.ts', 'utf-8');
  expect('route: run_abandoned telemetry emitted on result.abandoned', /action: 'run_abandoned'/.test(routeSrc) && /result\.abandoned\.session_id/.test(routeSrc), 'route emission missing');

  // ── Terminal-side failure card (#98): the bare "Task failed (exit code
  // -1)" line must carry the last error + the preserved-session hint —
  // content-pinned like the route check above (the .tsx render path is
  // Electron-gated, not fixture-gated).
  const termSrc = readFileSync(OLYMPUS + '/src/components/olympus/interactive-terminal.tsx', 'utf-8');
  expect('terminal: failure branch tracks the last error (runLastError)', /runLastError/.test(termSrc), 'the last-error ref is missing — the failure card is bare');
  expect('terminal: failure card names the last error + the preserved session', /last error: \$\{runLastError\.current\}/.test(termSrc) && /warm session and its context are preserved/.test(termSrc), 'the failure branch renders a bare exit code');

  // ── Scenario 7 (#99): the workspace lane — interactive projects must
  // land OUTSIDE the repo. The 2026-10-07 UAT created exemplo-landingpage/
  // INSIDE the working tree because the serve inherited findOlympusRoot()
  // as cwd. The cure: resolveWorkspaceLane() (OLYMPUS_WORKSPACE env → the
  // default ~/.local/share/olympus/workspace), bootstrapped with the
  // UAT-kit lane shape (.opencode symlink + config copies — the
  // SPAWN-INVOCATION.sh pattern), threaded as the serve spawn cwd — plus
  // the #95 seam (OLYMPUS_ROOT_SESSION in the spawn env).
  const spawnMod = await import(OLYMPUS + '/src/lib/opencode-spawn.ts');
  expect('S7: resolveWorkspaceLane is exported (#99)', typeof spawnMod.resolveWorkspaceLane === 'function', 'the workspace lane resolver is missing — interactive sessions default to the repo cwd');
  if (typeof spawnMod.resolveWorkspaceLane === 'function') {
    const wsTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-ws-'));
    process.env.OLYMPUS_WORKSPACE = wsTmp;
    const lane = spawnMod.resolveWorkspaceLane();
    expect('S7: OLYMPUS_WORKSPACE override used verbatim', lane.dir === wsTmp, JSON.stringify(lane));
    expect('S7: lane bootstrapped with the kit shape (.opencode symlink)', fs.existsSync(path.join(lane.dir, '.opencode')), 'the .opencode link is missing');
    expect('S7: lane carries the opencode.json copy', fs.existsSync(path.join(lane.dir, 'opencode.json')), 'the config copy is missing');
    expect('S7: lane carries the opencode.demigods.json copy', fs.existsSync(path.join(lane.dir, 'opencode.demigods.json')), 'the demigods copy is missing');
    const lane2 = spawnMod.resolveWorkspaceLane();
    expect('S7: second resolve is NOT fresh (the ask/notice fires once)', lane2.fresh === false, JSON.stringify(lane2));
    // The never-the-repo guard: OLYMPUS_WORKSPACE pointed INSIDE the repo
    // falls back to the default lane — never silently the repo.
    process.env.OLYMPUS_WORKSPACE = path.join(OLYMPUS, 'inside-repo-test');
    const lane3 = spawnMod.resolveWorkspaceLane();
    expect('S7: a workspace pointing INSIDE the repo falls back to the default',
      lane3.dir !== OLYMPUS && !lane3.dir.startsWith(OLYMPUS + path.sep), JSON.stringify(lane3));
    delete process.env.OLYMPUS_WORKSPACE;
  }
  const sessSrc = readFileSync(OLYMPUS + '/src/lib/opencode-session.ts', 'utf-8');
  expect('S7: the serve spawn threads the workspace lane as cwd', /cwd: lane\.dir/.test(sessSrc) && /resolveWorkspaceLane/.test(sessSrc), 'the spawn still inherits the repo root');
  expect('S7: the spawn env carries OLYMPUS_ROOT_SESSION (#95 seam)', /OLYMPUS_ROOT_SESSION/.test(sessSrc), 'the #95 seam is not threaded');
  expect('S7: the first-run workspace notice exists (the ask seam)', /Workspace lane/.test(sessSrc), 'no visible ask/notice for the lane');

  // #107: fixture env hygiene — never leak the injected patience.
  delete process.env.OLYMPUS_RETRY_BACKOFF_MS;
  delete process.env.OLYMPUS_RETRY_JITTER;

  server.close();
}

main().then(() => {
  if (savedPidfile !== null) fs.writeFileSync(PIDFILE, savedPidfile);
  else fs.rmSync(PIDFILE, { force: true });
  if (failures > 0) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log('\nAll #61 retry-fixture assertions passed');
  process.exit(0);
}).catch(e => {
  if (savedPidfile !== null) fs.writeFileSync(PIDFILE, savedPidfile);
  else fs.rmSync(PIDFILE, { force: true });
  console.error('FIXTURE CRASH:', e);
  process.exit(1);
});
