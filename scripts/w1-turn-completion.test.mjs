#!/usr/bin/env node
/**
 * w1-turn-completion.test.mjs — the W1 turn-truth regression suite
 * (#172 #173 #174 #175 #176 #178).
 *
 * A local v2 stub plays the opencode serve (adopted through the REAL
 * pidfile path). No provider, no network, no real vault writes.
 *
 * Scenarios:
 *   S1 #172  multi-wave turn: wave 1 (tool only) completes early, wave 2
 *            carries the text later — the run must wait for TRUE idle.
 *   S2 #174  a cut wave (reasoning only, finish=aborted) → code 1 with the
 *            named cause, never a silent "no output".
 *   S3 #174  text lives in an EARLIER wave → it lands, code 0.
 *   S4 #173  transport break mid-turn → watch-resume resolves through the
 *            v2 {data:[...]} envelope (newest-first).
 *   S5 #175  cleanupServer() mid-run → named abort within seconds.
 *   S6 #176  strategy switch mid-turn → deferred kill, turn completes.
 *   S7 #178  project naming ignores the [Uploaded files: …] manifest.
 *   S8 #175  the serve rotates its password mid-run → 401 re-resolve and
 *            the run continues (never polls blind).
 *
 * Run: npx tsx scripts/w1-turn-completion.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIDFILE = path.join(os.homedir(), '.olympus', 'opencode-server.pid');
const PASSWORD = 'w1-' + Math.random().toString(36).slice(2, 14);
const ROTATED = 'w1-rot-' + Math.random().toString(36).slice(2, 14);

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 200)}`);
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── The v2 stub ─────────────────────────────────────────────────────────────
const stub = { mode: 'multi-wave', password: PASSWORD, promptCount: 0, turnStart: 0 };

const basic = (p) => `Basic ${Buffer.from('opencode:' + p).toString('base64')}`;
const authed = (req) => req.headers.authorization === basic(stub.password);
const elapsed = () => (stub.turnStart ? Date.now() - stub.turnStart : 0);

function assistant(id, { created, completed, finish, content, cost, tokens }) {
  return {
    id,
    role: 'assistant',
    sessionID: 's',
    time: { created, ...(completed ? { completed } : {}) },
    ...(finish ? { finish } : {}),
    content,
    ...(cost != null ? { cost } : {}),
    ...(tokens ? { tokens } : {}),
  };
}
const oldWave = () => assistant('old', {
  created: stub.turnStart - 60_000,
  completed: stub.turnStart - 59_000,
  finish: 'stop',
  content: [{ type: 'text', text: 'OLD TURN' }],
});

function messagesFor() {
  const t = stub.turnStart;
  switch (stub.mode) {
    case 'multi-wave': {
      const wave1 = assistant('w1', {
        created: t + 1_500, completed: t + 2_300, finish: 'tool',
        content: [{ type: 'tool', state: { status: 'completed' } }],
      });
      if (elapsed() < 1_500) return [oldWave()];
      if (elapsed() < 2_400) return [wave1, oldWave()];
      const wave2Live = assistant('w2', {
        created: t + 2_400,
        content: [{ type: 'tool', state: { status: 'running' } }],
      });
      if (elapsed() < 4_000) return [wave2Live, wave1, oldWave()];
      const wave2Done = assistant('w2', {
        created: t + 2_400, completed: t + 4_000, finish: 'stop',
        content: [{ type: 'text', text: 'final answer' }],
      });
      return [wave2Done, wave1, oldWave()];
    }
    case 'cut':
      return [assistant('cut', {
        created: t + 100, completed: t + 400, finish: 'aborted',
        content: [{ type: 'reasoning', text: 'Vou…' }],
      })];
    case 'text-earlier': {
      const early = assistant('early', {
        created: t + 100, completed: t + 300, finish: 'tool',
        content: [{ type: 'text', text: 'early answer' }],
      });
      const last = assistant('last', {
        created: t + 500, completed: t + 700, finish: 'stop',
        content: [{ type: 'reasoning', text: 'faça o planejame…' }],
      });
      return [last, early];
    }
    case 'drop-first':
    case 'password-rotate': {
      const doneAt = stub.mode === 'drop-first' ? 3_000 : 3_000;
      const text = stub.mode === 'drop-first' ? 'resumed answer' : 'rotated answer';
      if (elapsed() < doneAt) {
        return [assistant('live', {
          created: t + 100,
          content: [{ type: 'tool', state: { status: 'running' } }],
        })];
      }
      return [assistant('done', {
        created: t + 100, completed: t + doneAt, finish: 'stop',
        content: [{ type: 'text', text }],
      })];
    }
    case 'hang-turn':
      return [assistant('hang', {
        created: t + 100,
        content: [{ type: 'tool', state: { status: 'running' } }],
      })];
    case 'delayed-text':
      if (elapsed() < 2_000) {
        return [assistant('live2', {
          created: t + 100,
          content: [{ type: 'tool', state: { status: 'running' } }],
        })];
      }
      return [assistant('done2', {
        created: t + 100, completed: t + 2_000, finish: 'stop',
        content: [{ type: 'text', text: 'deferred answer' }],
      })];
    default:
      return [];
  }
}

function rotateIfDue() {
  if (stub.mode !== 'password-rotate' || !stub.turnStart) return;
  if (stub.password === PASSWORD && elapsed() >= 2_000) {
    stub.password = ROTATED;
    writePidfile(ROTATED);
  }
}

const server = http.createServer((req, res) => {
  rotateIfDue();
  const url = req.url || '';
  if (process.env.W1_DEBUG) console.log(`[stub] ${req.method} ${url} auth=${req.headers.authorization ? 'yes' : 'no'}`);
  if (url.startsWith('/api/info')) {
    if (!authed(req)) { res.writeHead(401); return res.end('{}'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ version: '2.0.0-stub' }));
  }
  if (url.startsWith('/api/config')) {
    if (!authed(req)) { res.writeHead(401); return res.end('{}'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{}');
  }
  if (url.startsWith('/config')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{}');
  }
  if (url.startsWith('/api/event')) {
    if (!authed(req)) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const keep = setInterval(() => { try { res.write(': keepalive\n\n'); } catch {} }, 1000);
    res.on('close', () => clearInterval(keep));
    return;
  }
  if (req.method === 'POST' && /\/api\/session\/[^/]+\/interrupt$/.test(url)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{}');
  }
  if (req.method === 'POST' && /\/api\/session\/[^/]+\/prompt$/.test(url)) {
    if (!authed(req)) { res.writeHead(401); return res.end(); }
    stub.promptCount++;
    if (!stub.turnStart) stub.turnStart = Date.now();
    if (stub.mode === 'drop-first' && stub.promptCount === 1) {
      // #173: the transport breaks while the turn KEEPS running.
      req.socket.destroy();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method === 'GET' && /\/api\/session\/[^/]+\/message$/.test(url)) {
    if (!authed(req)) { res.writeHead(401); return res.end('{}'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ data: messagesFor(), cursor: null }));
  }
  res.writeHead(404);
  res.end('{}');
});

// ─── Pidfile lifecycle ───────────────────────────────────────────────────────
const savedPidfile = fs.existsSync(PIDFILE) ? fs.readFileSync(PIDFILE, 'utf-8') : null;
function writePidfile(password) {
  fs.mkdirSync(path.dirname(PIDFILE), { recursive: true });
  fs.writeFileSync(PIDFILE, JSON.stringify({ pid: process.pid, port: server.address().port, password }, null, 2));
}

function resetStub(mode, password = PASSWORD) {
  stub.mode = mode;
  stub.password = password;
  stub.promptCount = 0;
  stub.turnStart = 0;
  writePidfile(password);
}

function transcriptOf(events) {
  return events.map((e) => e.type + ':' + (e.msg || e.part?.text || '')).join('\n');
}

async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));

  const session = await import(OLYMPUS + '/src/lib/opencode-session.ts');
  const { runWarmMessage, cleanupServer, invalidateServer, killWarmServerForStrategy } = session;
  const { deriveProjectName, classifyFirstPrompt, stripUploadBlock } = await import(OLYMPUS + '/src/lib/project-intent.ts');

  process.env.OLYMPUS_RETRY_BACKOFF_MS = '10, 10';
  process.env.OLYMPUS_RETRY_JITTER = '0';

  const run = async (sessionId, events, extra = {}) => {
    invalidateServer();
    return runWarmMessage({ sessionId, text: 'fixture prompt', agent: 'apollo', onEvent: (e) => events.push(e), maxRuntimeMs: 60_000, ...extra });
  };

  // ── S1 (#172): multi-wave — the early tool wave is NOT the end ──────────
  resetStub('multi-wave');
  {
    const events = [];
    const started = Date.now();
    const result = await run('w1-s1', events);
    const text = transcriptOf(events);
    const took = Date.now() - started;
    expect('S1: multi-wave turn completes (code 0)', result.code === 0, JSON.stringify(result));
    expect('S1: the final answer lands', text.includes('final answer'), text.slice(-300));
    expect('S1: the prior turn is never mistaken for this one', !text.includes('OLD TURN'), text.slice(0, 300));
    expect('S1: the run waited past the early tool wave (>= 4s)', took >= 4_000, `took=${took}ms`);
  }

  // ── S2 (#174): cut wave — named cause, code 1 ───────────────────────────
  resetStub('cut');
  {
    const events = [];
    const result = await run('w1-s2', events);
    expect('S2: cut turn fails (code 1)', result.code === 1, JSON.stringify(result));
    expect('S2: the cause is NAMED (finish=aborted)', /turn cut server-side mid-reasoning \(finish=aborted\)/.test(String(result.error)), result.error);
    expect('S2: never the bare "no output" shape', !/^no output$/i.test(String(result.error)), result.error);
  }

  // ── S3 (#174): text in an earlier wave still lands ──────────────────────
  resetStub('text-earlier');
  {
    const events = [];
    const result = await run('w1-s3', events);
    const text = transcriptOf(events);
    expect('S3: text-bearing earlier wave completes (code 0)', result.code === 0, JSON.stringify(result));
    expect('S3: the earlier text lands', text.includes('early answer'), text.slice(-300));
  }

  // ── S4 (#173): watch-resume through the {data:[...]} envelope ───────────
  resetStub('drop-first');
  {
    const events = [];
    const result = await run('w1-s4', events);
    const text = transcriptOf(events);
    expect('S4: watch-resume resolves (code 0)', result.code === 0, JSON.stringify(result));
    expect('S4: resumed turn text lands', text.includes('resumed answer'), text.slice(-300));
    expect('S4: the resume is NAMED in the terminal', text.includes('resuming the watch'), text.slice(0, 600));
  }

  // ── S5 (#175): cleanupServer mid-run → named abort ──────────────────────
  resetStub('hang-turn');
  {
    const events = [];
    const started = Date.now();
    const pending = run('w1-s5', events);
    await sleep(1_500);
    cleanupServer();
    const result = await pending;
    const took = Date.now() - started;
    expect('S5: reset aborts the live run', result.code === -1, JSON.stringify(result));
    expect('S5: the abort is NAMED', String(result.error).startsWith('aborted: warm server reset'), result.error);
    expect('S5: the run ends within seconds (not the 60s bound)', took < 10_000, `took=${took}ms`);
    resetStub('multi-wave'); // cleanupServer removed the pidfile
  }

  // ── S6 (#176): strategy switch mid-turn defers the kill ─────────────────
  resetStub('delayed-text');
  {
    const events = [];
    const pending = run('w1-s6', events);
    await sleep(1_200);
    const kill = killWarmServerForStrategy();
    expect('S6: the switch is DEFERRED while a turn streams', kill.deferred === true, JSON.stringify(kill));
    const result = await pending;
    const text = transcriptOf(events);
    expect('S6: the live turn completes untouched (code 0)', result.code === 0, JSON.stringify(result));
    expect('S6: the deferred answer lands', text.includes('deferred answer'), text.slice(-300));
    expect('S6: the terminal names the deferred kill', text.includes('Warm server killed after the turn ended'), text.slice(-400));
    resetStub('multi-wave');
  }

  // ── S7 (#178): the upload manifest never names the project ──────────────
  {
    const upload = 'AIME\n\n[Uploaded files:\n  - AIME.md → extracted to 02_Projects/aime (vault-relative). Files:\n      AIME.md]';
    expect('S7: stripUploadBlock removes the manifest', stripUploadBlock(upload) === 'AIME', JSON.stringify(stripUploadBlock(upload)));
    expect('S7: deriveProjectName returns AIME', deriveProjectName(upload) === 'AIME', deriveProjectName(upload));
    const intent = classifyFirstPrompt(upload, []);
    expect('S7: intake classifies AIME as new', intent.kind === 'new', JSON.stringify(intent));
    expect('S7: the project name is AIME (no manifest words)', intent.kind === 'new' && intent.projectName === 'AIME', JSON.stringify(intent));
    const legacy = deriveProjectName('Build AURORA FOCUS — a focus-session tracker');
    expect('S7: existing naming fixture still green', /AURORA/i.test(legacy) && !/upload/i.test(legacy), legacy);
  }

  // ── S8 (#175): password rotation → 401 re-resolve, run continues ────────
  resetStub('password-rotate');
  {
    const events = [];
    const result = await run('w1-s8', events);
    const text = transcriptOf(events);
    expect('S8: the run survives the password rotation (code 0)', result.code === 0, JSON.stringify(result));
    expect('S8: the post-rotation answer lands', text.includes('rotated answer'), text.slice(-300));
    expect('S8: the password really rotated', stub.password === ROTATED, stub.password);
  }

  server.closeAllConnections?.();
  server.close();
  if (savedPidfile !== null) fs.writeFileSync(PIDFILE, savedPidfile, 'utf-8');
  else { try { fs.unlinkSync(PIDFILE); } catch {} }

  console.log('');
  if (failures > 0) {
    console.log(`w1-turn-completion: ${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('w1-turn-completion: all green.');
  // The stub SSE keepalive can outlive server.close() when a socket never
  // fired 'close' — the suite is done; exit explicitly instead of hanging.
  process.exit(0);
}

main().catch((err) => {
  console.error('w1-turn-completion crashed:', err);
  try { server.close(); } catch {}
  if (savedPidfile !== null) { try { fs.writeFileSync(PIDFILE, savedPidfile, 'utf-8'); } catch {} }
  else { try { fs.unlinkSync(PIDFILE); } catch {} }
  process.exit(1);
});
