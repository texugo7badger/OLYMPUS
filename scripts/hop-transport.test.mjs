#!/usr/bin/env node
/**
 * hop-transport.test.mjs — THE WARM HOP TRANSPORT (#241, v0.0.24).
 *
 *   T1  mode resolution: auto (default), spawn, warm, invalid → auto
 *   T2  dynamic concurrency: AIMD, min 1, max 3
 *   T3  the warm client runs a real HTTP session/prompt/SSE handshake
 *   T4  a warm setup failure falls back to spawn in `auto` mode
 *   T5  the spawn transport still works (the safety net)
 *
 * Run: npx tsx scripts/hop-transport.test.mjs (exit 0)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveHopTransportMode, createHopTransport, SpawnTransport, AutoTransport } from '../src/lib/hop-runtime/transport.ts';
import { nextConcurrency, resolveHopConcurrency, MAX_HOP_CONCURRENCY } from '../src/lib/hop-runtime/walker.ts';
import { runWarmHop, __registerHopServerForTest, __clearHopServersForTest, WarmTransportUnavailable } from '../src/lib/hop-runtime/warm-server.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}

// T1 — mode.
{
  expect('T1 default is auto', resolveHopTransportMode({}) === 'auto');
  expect('T1 spawn honored', resolveHopTransportMode({ OLYMPUS_HOP_TRANSPORT: 'spawn' }) === 'spawn');
  expect('T1 warm honored', resolveHopTransportMode({ OLYMPUS_HOP_TRANSPORT: 'warm' }) === 'warm');
  expect('T1 invalid → auto', resolveHopTransportMode({ OLYMPUS_HOP_TRANSPORT: 'nonsense' }) === 'auto');
  expect('T1 spawn factory', createHopTransport('spawn').mode === 'spawn');
  expect('T1 warm factory is warm-mode', createHopTransport('warm').mode === 'warm');
}

// T2 — concurrency.
{
  expect('T2 default 2', resolveHopConcurrency({}) === 2, String(resolveHopConcurrency({})));
  expect('T2 env override capped', resolveHopConcurrency({ OLYMPUS_HOP_CONCURRENCY: '9' }) === MAX_HOP_CONCURRENCY);
  expect('T2 success +1', nextConcurrency(1, 'ok') === 2);
  expect('T2 success caps', nextConcurrency(MAX_HOP_CONCURRENCY, 'ok') === MAX_HOP_CONCURRENCY);
  expect('T2 overload halves', nextConcurrency(3, 'overload') === 1);
  expect('T2 hang -1', nextConcurrency(2, 'hang') === 1);
  expect('T2 never below 1', nextConcurrency(1, 'hang') === 1 && nextConcurrency(1, 'overload') === 1);
}

// A fake OpenCode v2 server for the warm path.
function fakeServer(opts = { failCreate: false }) {
  const srv = http.createServer((req, res) => {
    const url = req.url || '';
    if (req.method === 'GET' && url === '/config') { res.writeHead(200); res.end('{}'); return; }
    if (req.method === 'GET' && url === '/api/info') { res.writeHead(200); res.end('{}'); return; }
    if (req.method === 'GET' && url === '/api/event') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      res.write(`data: ${JSON.stringify({ type: 'step-start' })}\n\n`);
      req.on('close', () => res.end());
      return;
    }
    if (req.method === 'POST' && url === '/api/session') {
      if (opts.failCreate) { res.writeHead(500); res.end('boom'); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'ses_test' }));
      return;
    }
    if (req.method === 'POST' && url === '/api/session/ses_test/prompt') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: { id: 'msg_user', sessionID: 'ses_test', type: 'user' } }));
      });
      return;
    }
    if (req.method === 'GET' && url === '/api/session/ses_test/message') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        data: [{
          info: { id: 'msg_a', role: 'assistant', sessionID: 'ses_test', time: { created: Date.now(), completed: Date.now() }, tokens: { input: 10, output: 20 } },
          parts: [
            { type: 'text', text: 'warm-ok' },
            { type: 'reasoning', text: 'warm-think' },
            { type: 'step-finish', tokens: { input: 10, output: 20 } },
          ],
        }],
      }));
      return;
    }
    if (req.method === 'POST' && /\/api\/session\/.+\/interrupt$/.test(url)) { res.writeHead(200); res.end('{}'); return; }
    if (req.method === 'POST' && /\/permission\/.+\/reply$/.test(url)) { res.writeHead(200); res.end('{}'); return; }
    res.writeHead(404); res.end('nope');
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({
    srv,
    port: srv.address().port,
  })));
}

// T3 — the warm client.
{
  __clearHopServersForTest();
  const { srv, port } = await fakeServer();
  __registerHopServerForTest(ROOT, { port, password: 'pw', protocol: 'v2' });
  const r = await runWarmHop({
    laneRoot: ROOT,
    agent: 'athena',
    text: 'hello',
    timeoutMs: 10_000,
    firstByteMs: 5_000,
    silenceMs: 5_000,
  });
  expect('T3 warm returns code 0', r.code === 0, JSON.stringify(r).slice(0, 260));
  expect('T3 warm stdout carries the text', r.stdout.includes('warm-ok'), r.stdout.slice(0, 200));
  expect('T3 warm stdout carries the reasoning', r.stdout.includes('warm-think'), r.stdout.slice(0, 200));
  expect('T3 warm stdout carries tokens', /"type":"step-finish"/.test(r.stdout) && /"input":10/.test(r.stdout), r.stdout.slice(0, 300));
  expect('T3 warm returns the session id', r.sessionId === 'ses_test', r.sessionId);
  srv.close();
  __clearHopServersForTest();
}

// T4 — fallback.
{
  __clearHopServersForTest();
  const { srv, port } = await fakeServer({ failCreate: true });
  __registerHopServerForTest(ROOT, { port, password: 'pw', protocol: 'v2' });
  let threw = null;
  try {
    await runWarmHop({ laneRoot: ROOT, agent: 'athena', text: 'x', timeoutMs: 5_000, firstByteMs: 2_000, silenceMs: 2_000 });
  } catch (e) { threw = e; }
  expect('T4 a warm create failure raises WarmTransportUnavailable', threw instanceof WarmTransportUnavailable, String(threw));

  const auto = new AutoTransport();
  const fallback = await auto.run({
    args: ['--version'],
    prompt: 'x',
    agent: 'athena',
    cwd: ROOT,
    timeoutMs: 15_000,
    firstByteMs: 10_000,
    silenceMs: 10_000,
  });
  expect('T4 auto falls back to spawn', fallback.transport === 'spawn', JSON.stringify(fallback).slice(0, 200));
  expect('T4 the fallback process exits 0', fallback.code === 0, `${fallback.code} ${fallback.stderr.slice(-200)}`);
  srv.close();
  __clearHopServersForTest();
}

// T5 — spawn transport.
{
  const spawnT = new SpawnTransport();
  const r = await spawnT.run({
    args: ['--version'],
    prompt: 'x',
    agent: 'athena',
    cwd: ROOT,
    timeoutMs: 15_000,
    firstByteMs: 10_000,
    silenceMs: 10_000,
  });
  expect('T5 spawn returns the version', r.code === 0 && r.stdout.trim().length > 0, JSON.stringify(r).slice(0, 200));
  expect('T5 spawn labels its transport', r.transport === 'spawn');
}

// T6 — the chat's v2 prompt body (2.2.2) must be top-level `{text}`.
{
  const fs = await import('node:fs');
  const session = fs.readFileSync(path.join(ROOT, 'src/lib/opencode-session.ts'), 'utf-8');
  const region = session.slice(session.indexOf("server.protocol === 'v2' ?"), session.indexOf("server.protocol === 'v2' ?") + 1200);
  expect('T6 chat v2 body uses top-level text', /text: `\$\{buildStrategyContextBlock/.test(region), region.slice(0, 200));
  expect('T6 chat v2 body has no prompt wrapper', !/prompt:\s*\{\s*\n?\s*text:/.test(region));
}


console.log(`\nhop-transport: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

