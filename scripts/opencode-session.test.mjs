#!/usr/bin/env node
/**
 * opencode-session.test.mjs — #61 deterministic retry fixture (BATCH 13).
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
import path from 'node:path';
import os from 'node:os';

const OLYMPUS = '/home/texugo/Projects/olympus';
const PIDFILE = path.join(os.homedir(), '.olympus', 'opencode-server.pid');
const PASSWORD = 'test-' + Math.random().toString(36).slice(2, 18);

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 160)}`);
  if (!cond) failures++;
}

// ─── Stub server ──────────────────────────────────────────────────────────────
const stub = { mode: 'recover', postCount: 0, concurrent: 0, maxConcurrent: 0, eventStreams: 0 };

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
