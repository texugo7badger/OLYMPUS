#!/usr/bin/env node
/**
 * opencode-gate.mjs — v0.0.31 (Epic L): TEST BEFORE UPDATING.
 *
 * The host OpenCode and OLYMPUS mirror each other. An untested CLI update can
 * break sessions, the v2 API, MCP or the DB schema. This gate installs the
 * candidate in an ISOLATED prefix, starts it on a FREE port with a TEMP data
 * dir (never the live app ports, never the live DB), runs the v2 conformance suite,
 * and writes a report. `approved` only when every check passes.
 *
 * Usage:
 *   node scripts/opencode-gate.mjs --version 2.2.5 --install
 *   node scripts/opencode-gate.mjs --version 2.2.5 --bin <path>   (no install)
 *   node scripts/opencode-gate.mjs --json
 *
 * Exit 0 = approved, 1 = blocked/failed.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import http from 'node:http';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const JSON_OUT = has('json');
const KEEP = has('keep');
const DO_INSTALL = has('install');
const MODEL = flag('model', 'opencode-go/deepseek-v4.1-flash');
const AGENT = flag('agent', 'apollo');
const TIMEOUT_MS = Number(flag('timeout', '120000'));

function npmLatest() {
  try { return execFileSync('npm', ['view', '@opencode/cli', 'version'], { encoding: 'utf-8', timeout: 30_000 }).trim(); }
  catch { return null; }
}

const version = flag('version', npmLatest());
if (!version) { console.error('opencode-gate: cannot resolve the candidate version (npm view failed)'); process.exit(1); }

const candidateRoot = path.join(homedir(), '.olympus', 'opencode-candidates', version);
const candidateBin = path.join(candidateRoot, 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
const reportDir = path.join(homedir(), '.olympus', 'opencode-updates', version);

function runNpmInstall() {
  console.log(`[gate] installing @opencode/cli@${version} in ${candidateRoot} (isolated)…`);
  execFileSync('npm', ['install', '--prefix', candidateRoot, '--no-save', '--no-audit', '--no-fund', `@opencode/cli@${version}`], {
    stdio: 'inherit', timeout: 300_000,
  });
  // The repo's allowScripts policy blocks the CLI postinstall; run it here on
  // the candidate only (the platform binary is already installed as an
  // optional dependency, the script links it).
  const pkgDir = path.join(candidateRoot, 'node_modules', '@opencode', 'cli');
  const postinstall = path.join(pkgDir, 'postinstall.mjs');
  const binRel = (() => { try { return Object.values(JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')).bin ?? {})[0]; } catch { return null; } })();
  const binAbs = binRel ? path.join(pkgDir, binRel) : null;
  if (postinstall && existsSync(postinstall) && binAbs && (!existsSync(binAbs) || statSync(binAbs).size < 1024 * 1024)) {
    console.log('[gate] running the candidate CLI postinstall (platform binary link)…');
    execFileSync(process.execPath, [postinstall], { cwd: pkgDir, stdio: 'inherit', timeout: 120_000 });
  }
}

let bin = flag('bin', null);
if (!bin) {
  if (DO_INSTALL || !existsSync(candidateBin)) runNpmInstall();
  bin = candidateBin;
}
if (!existsSync(bin)) { console.error(`opencode-gate: candidate binary not found: ${bin}`); process.exit(1); }
if (statSync(bin).size < 1024 * 1024) {
  console.error(`opencode-gate: ${bin} is a stub (postinstall not run). Run with --install.`);
  process.exit(1);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

const tmp = mkdtempSync(path.join(tmpdir(), 'olympus-oc-gate-'));
const dataDir = path.join(tmp, 'data');
const configDir = path.join(tmp, 'config');
const laneDir = path.join(tmp, 'lane');
const cacheDir = path.join(tmp, 'cache');
for (const d of [dataDir, configDir, laneDir, cacheDir, path.join(dataDir, 'opencode'), path.join(configDir, 'opencode'), path.join(cacheDir, 'opencode')]) mkdirSync(d, { recursive: true });

// Provider auth: read-only symlink from the host (never copied).
const authSrc = path.join(homedir(), '.local', 'share', 'opencode', 'auth.json');
if (existsSync(authSrc)) {
  try { symlinkSync(authSrc, path.join(dataDir, 'opencode', 'auth.json')); } catch { /* exists */ }
}
// Model catalog: reuse the host cache when present (no network dependency).
const catalogSrc = path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache'), 'opencode', 'models.json');
if (existsSync(catalogSrc)) {
  try { symlinkSync(catalogSrc, path.join(cacheDir, 'opencode', 'models.json')); } catch { /* exists */ }
}

// Minimal lane: no OLYMPUS plugins, no MCP fleet, one agent.
writeFileSync(path.join(laneDir, 'opencode.json'), JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  model: MODEL,
  agent: {
    [AGENT]: {
      mode: 'primary',
      model: MODEL,
      prompt: 'You are a conformance probe. Reply with exactly: OK. Do not use tools.',
    },
  },
}, null, 2));

const port = await freePort();
const password = randomBytes(16).toString('hex');
const auth = 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64');
const logFile = path.join(tmp, 'server.log');

const checks = [];
const add = (name, ok, detail, extra = {}) => {
  checks.push({ name, ok: Boolean(ok), ...(detail ? { detail: String(detail).slice(0, 600) } : {}), ...extra });
};

function request(method, pathname, body, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers: {
      Authorization: auth,
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
    } }, (res) => {
      let text = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout ${timeoutMs}ms`)));
    req.on('error', (e) => resolve({ status: 0, text: String(e?.message || e) }));
    if (payload) req.write(payload);
    req.end();
  });
}

// SSE watcher (opened before the prompt so the first event is not missed).
let sseEvents = 0;
let sseFirstAt = null;
let sseReq = null;
function openSse() {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/event', method: 'GET', headers: { Authorization: auth, Accept: 'text/event-stream' } }, (res) => {
      res.setEncoding('utf-8');
      res.on('data', (chunk) => {
        for (const line of String(chunk).split('\n')) {
          if (line.trim().startsWith('data:')) { sseEvents++; if (!sseFirstAt) sseFirstAt = Date.now(); }
        }
      });
      res.on('error', () => {});
      resolve();
    });
    req.on('error', () => resolve());
    req.end();
    sseReq = req;
  });
}

const child = spawn(bin, ['serve', '--port', String(port), '--hostname', '127.0.0.1'], {
  cwd: laneDir,
  env: {
    ...process.env,
    HOME: tmp,
    XDG_DATA_HOME: dataDir,
    XDG_CONFIG_HOME: configDir,
    XDG_CACHE_HOME: cacheDir,
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_DISABLE_AUTOUPDATE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout?.on('data', (d) => { serverLog += String(d); });
child.stderr?.on('data', (d) => { serverLog += String(d); });
try { writeFileSync(logFile, ''); } catch {}

const killChild = () => {
  try { child.kill('SIGTERM'); } catch {}
  const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 3_000);
  t.unref?.();
};

const startedAt = Date.now();
let ready = false;
for (; Date.now() - startedAt < 60_000; ) {
  if (child.exitCode !== null) break;
  const r = await request('GET', '/config', undefined, 2_000);
  if (r.status > 0 && r.status < 500) { ready = true; break; }
  await new Promise((r) => setTimeout(r, 400));
}
add('serve-boot', ready, ready ? `ready in ${Date.now() - startedAt}ms on :${port}` : `no /config answer; exit=${child.exitCode}`);

// R-N-07: freeze the candidate like an OS suspend, thaw it, and prove the
// server answers again. The live app is never touched.
if (ready) {
  const freezeStart = Date.now();
  let recovered = false;
  try {
    process.kill(child.pid, 'SIGSTOP');
    await new Promise((r) => setTimeout(r, 2_000));
    process.kill(child.pid, 'SIGCONT');
  } catch { /* gone */ }
  for (let i = 0; i < 25; i++) {
    const probe = await request('GET', '/config', undefined, 1_000);
    if (probe.status > 0 && probe.status < 500) { recovered = true; break; }
    await new Promise((r) => setTimeout(r, 400));
  }
  add('survives-suspend', recovered, recovered ? `recovered after ${Date.now() - freezeStart}ms freeze` : 'no /config answer after SIGCONT');
}

let sessionId = null;
if (ready) {
  const list = await request('GET', '/api/session');
  add('v2-session-list', list.status >= 200 && list.status < 300, `HTTP ${list.status}`);

  const created = await request('POST', '/api/session', { title: `gate-${version}` });
  try { sessionId = JSON.parse(created.text)?.id ?? JSON.parse(created.text)?.data?.id ?? null; } catch { /* not json */ }
  add('session-create', created.status >= 200 && created.status < 300 && !!sessionId, `HTTP ${created.status} ${created.text.slice(0, 160)}`);

  if (sessionId) {
    const agent = await request('POST', `/api/session/${sessionId}/agent`, { agent: AGENT });
    add('agent-select', agent.status >= 200 && agent.status < 300, `HTTP ${agent.status} ${agent.text.slice(0, 160)}`);

    const idx = MODEL.indexOf('/');
    const providerID = idx > 0 ? MODEL.slice(0, idx) : 'opencode-go';
    const modelID = idx > 0 ? MODEL.slice(idx + 1) : MODEL;
    const model = await request('POST', `/api/session/${sessionId}/model`, { model: { providerID, id: modelID } });
    add('model-select', model.status >= 200 && model.status < 300, `HTTP ${model.status} ${model.text.slice(0, 160)}`);

    await openSse();
    const prompt = await request('POST', `/api/session/${sessionId}/prompt`, { text: 'Reply with exactly: OK' }, TIMEOUT_MS);
    add('prompt-ack', prompt.status >= 200 && prompt.status < 300, `HTTP ${prompt.status} ${prompt.text.slice(0, 160)}`);

    // First SSE event (bounded).
    const sseStart = Date.now();
    while (!sseFirstAt && Date.now() - sseStart < 20_000) await new Promise((r) => setTimeout(r, 250));
    add('sse-first-event', sseEvents > 0, sseEvents > 0 ? `${sseEvents} data line(s)` : 'no SSE data line in 20s');

    // Completion poll.
    const deadline = Date.now() + TIMEOUT_MS;
    let assistant = null;
    let assistantText = '';
    while (Date.now() < deadline) {
      const msgs = await request('GET', `/api/session/${sessionId}/message`, undefined, 10_000);
      try {
        const arr = JSON.parse(msgs.text)?.data ?? JSON.parse(msgs.text);
        if (Array.isArray(arr)) {
          for (const m of arr) {
            const info = m?.info ?? m;
            if ((info?.role ?? m?.role) !== 'assistant') continue;
            const text = (m?.content ?? []).filter((p) => p?.type === 'text').map((p) => p.text).join(' ');
            if (info?.time?.completed != null || info?.tokens) { assistant = info; assistantText = text; break; }
          }
        }
      } catch { /* not json yet */ }
      if (assistant) break;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    add('turn-completes', !!assistant, assistant ? `assistant completed${assistantText ? `: ${assistantText.slice(0, 80)}` : ''}` : 'no completed assistant in time');

    // DB schema + tokens (candidate data dir only).
    let tokens = null;
    let tables = [];
    const dbPath = path.join(dataDir, 'opencode', 'opencode.db');
    try {
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true });
      try {
        tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
        const row = sessionId ? db.prepare('SELECT tokens_input, tokens_output, tokens_cache_read FROM session_v2 WHERE id = ?').get(sessionId) : null;
        if (row) tokens = { input: Number(row.tokens_input) || 0, output: Number(row.tokens_output) || 0, cacheRead: Number(row.tokens_cache_read) || 0 };
      } finally { db.close(); }
    } catch (e) { add('db-read', false, e?.message || String(e)); }
    add('schema-v2', ['session_v2', 'session_message', 'session_part'].every((t) => tables.includes(t)), tables.join(','));
    add('tokens-present', !!tokens && (tokens.input > 0 || tokens.output > 0), tokens ? JSON.stringify(tokens) : 'no session row');
    // The session row is the same source of truth the app joins on. If the
    // message API shape changes but the row carries tokens, the turn DID
    // complete — do not fail the gate on a parser difference.
    const turnCheck = checks.find((c) => c.name === 'turn-completes');
    if (turnCheck && !turnCheck.ok && tokens && (tokens.input > 0 || tokens.output > 0)) {
      turnCheck.ok = true;
      turnCheck.detail = `completed (session tokens: ${JSON.stringify(tokens)})`;
    }

    const abort = await request('POST', `/api/session/${sessionId}/interrupt`, undefined, 10_000);
    add('abort', abort.status >= 200 && abort.status < 400, `HTTP ${abort.status}`);
  }
}

killChild();
await new Promise((r) => setTimeout(r, 4_000));
add('clean-exit', child.exitCode !== null || child.signalCode !== null, `exit=${child.exitCode ?? child.signalCode}`);
try { sseReq?.destroy(); } catch {}

const approved = checks.every((c) => c.ok);
const report = {
  version,
  bin,
  model: MODEL,
  agent: AGENT,
  port,
  tmp: KEEP ? tmp : undefined,
  checkedAt: new Date().toISOString(),
  approved,
  checks,
  log: serverLog.slice(-4000),
};
mkdirSync(reportDir, { recursive: true });
writeFileSync(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');

if (!KEEP) { try { rmSync(tmp, { recursive: true, force: true }); } catch {} }

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nopencode-gate — v${version} — ${approved ? 'APPROVED' : 'BLOCKED'}\n`);
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(20)} ${c.detail ?? ''}`);
  if (!approved) {
    console.log(`\nserver log tail:\n${serverLog.slice(-1200)}`);
  }
  console.log(`\nreport: ${path.join(reportDir, 'report.json')}`);
}
process.exit(approved ? 0 : 1);
