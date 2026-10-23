#!/usr/bin/env node
/**
 * editor-bridge.test.mjs — #199 EDITORS-2: re-verify every editor bridge.
 * Run: npx tsx scripts/editor-bridge.test.mjs   (exit 0 = pass)
 *
 * What is VERIFIED here (not narrated):
 *   1. The real Terminal Bridge module boots on 127.0.0.1:3740, writes a
 *      0o600 token, answers hello/ping/list, and rejects a missing token
 *      with HTTP 401.
 *   2. The editor status route probes that live port and reports it.
 *   3. Detection resolves all four catalog editors (present → path,
 *      absent → honest null) and the preferred/auto resolution rules.
 *   4. The VSCode-family extension has everything `vsce package` needs
 *      (icon PNG, LICENSE, compiled entry point contract, bridge port).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');
const requireFromRepo = createRequire(path.join(OLYMPUS, 'package.json'));
const { WebSocket } = requireFromRepo('ws');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
}
function once(ws, type, ms = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), ms);
    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.type === type) { clearTimeout(t); resolve(m); }
    });
    ws.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

async function main() {
  // HOME must be isolated BEFORE the modules bind their token/config paths.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-editors-home-'));
  process.env.HOME = home;
  process.env.OLYMPUS_ROOT = OLYMPUS;
  process.env.OLYMPUS_VAULT = path.join(home, 'OLYMPUS-VAULT');
  fs.mkdirSync(process.env.OLYMPUS_VAULT, { recursive: true });

  const imp = (rel) => import(pathToFileURL(path.join(OLYMPUS, rel)).href + `?t=${Date.now()}-${Math.random()}`);
  const bridge = await imp('electron/terminal-bridge.ts');
  const editor = await imp('src/lib/editor-bridge.ts');

  // A running OLYMPUS already owns :3740 — a named skip, never a false red.
  const portBusy = await new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port: 3740 });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(500);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });

  if (portBusy) {
    console.log('SKIP  #199: live-bridge checks — port 3740 already owned by a running OLYMPUS');
  } else {
    await verifyLiveBridge();
  }

  async function verifyLiveBridge() {
  bridge.registerTerminalBridge();
  const tokenFile = path.join(home, '.olympus', 'terminal-bridge-token');
  // The server binds asynchronously — poll for the token file.
  for (let i = 0; i < 40 && !fs.existsSync(tokenFile); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const token = fs.readFileSync(tokenFile, 'utf-8').trim();
  const mode = fs.statSync(tokenFile).mode & 0o777;
  expect('#199: the Terminal Bridge writes a 0o600 token (32 random bytes)',
    mode === 0o600 && token.length >= 40,
    `mode ${mode.toString(8)} len ${token.length}`);

  let connected = null;
  let lastErr = null;
  for (let i = 0; i < 30 && !connected; i++) {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:3740/?token=${encodeURIComponent(token)}`);
      await once(ws, 'hello');
      connected = ws;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  expect('#199: the bridge accepts the token and says hello',
    !!connected,
    lastErr?.message || 'no connection');

  if (connected) {
    connected.send(JSON.stringify({ type: 'ping' }));
    const pong = await once(connected, 'pong');
    expect('#199: ping → pong (the protocol is live)',
      pong.type === 'pong' && typeof pong.ts === 'number',
      JSON.stringify(pong));
    connected.send(JSON.stringify({ type: 'list' }));
    const sessions = await once(connected, 'sessions');
    expect('#199: list → sessions (the PTY surface answers)',
      sessions.type === 'sessions' && Array.isArray(sessions.sessions),
      JSON.stringify(sessions));
    connected.close();
  }

  const rejected = await new Promise((resolve) => {
    const bad = new WebSocket('ws://127.0.0.1:3740/?token=wrong-token');
    const t = setTimeout(() => resolve('timeout'), 4000);
    bad.on('unexpected-response', (_req, res) => { clearTimeout(t); resolve(`http ${res.statusCode}`); });
    bad.on('open', () => { clearTimeout(t); resolve('OPENED'); });
    bad.on('error', (e) => { clearTimeout(t); resolve(`error ${e.message}`); });
  });
  expect('#199: a wrong/missing token is rejected with 401',
    rejected === 'http 401',
    rejected);

  const status = bridge.getBridgeStatus();
  expect('#199: the bridge reports running on 127.0.0.1:3740',
    status.running === true && status.port === 3740 && status.host === '127.0.0.1' && status.hasToken === true,
    JSON.stringify(status));

  // The status route probes the LIVE port.
  const statusRoute = await imp('src/app/api/olympus/editor/status/route.ts');
  const statusRes = await statusRoute.GET();
  const statusBody = await statusRes.json();
  expect('#199: the editor status route sees the live bridge',
    statusRes.status === 200
    && statusBody.bridge?.listening === true
    && statusBody.bridge?.port === 3740
    && /terminal-bridge-token$/.test(statusBody.bridge?.tokenFile || ''),
    JSON.stringify(statusBody.bridge));

  // The CLI lane — the same token, the same bridge, a real client. Spawned
  // ASYNC: the bridge lives in this process, so a sync child would deadlock it.
  const cli = await new Promise((resolve) => {
    const child = spawn('node', [path.join(OLYMPUS, 'scripts/olympus-terminal.js'), '--status'], {
      env: { ...process.env, HOME: home },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: String(e) }));
  });
  expect('#199: `olympus terminal --status` connects to the live bridge',
    cli.code === 0 && /running/i.test(cli.stdout) && /3740/.test(cli.stdout),
    cli.stderr || cli.stdout);

  bridge.shutdownTerminalBridge();
  }

  // ── Editor detection + resolution ────────────────────────────────────────
  const detected = editor.detectAllEditors();
  expect('#199: the catalog detects all four editors (path or honest null)',
    detected.length === 4
    && detected.every((d) => ['zed', 'vscode', 'vscodium', 'cursor'].includes(d.id))
    && detected.every((d) => d.binPath === null || (typeof d.binPath === 'string' && d.binPath.length > 0)),
    JSON.stringify(detected.map((d) => [d.id, d.binPath])));

  const fake = (id, binPath) => ({
    id, displayName: id, binPath, source: binPath ? 'PATH' : null,
    homepage: '', tagline: '',
  });
  const resolvedAuto = editor.resolveEditor({ preferred: 'auto' }, [fake('vscode', '/usr/bin/code'), fake('zed', null)]);
  expect('#199: auto resolves the first detected editor in catalog order',
    resolvedAuto?.entry.id === 'vscode' && resolvedAuto?.binPath === '/usr/bin/code',
    JSON.stringify(resolvedAuto));
  const resolvedPreferred = editor.resolveEditor({ preferred: 'cursor' }, [fake('vscode', '/usr/bin/code'), fake('cursor', '/opt/cursor/cursor')]);
  expect('#199: an explicit preference wins when detected',
    resolvedPreferred?.entry.id === 'cursor' && resolvedPreferred?.binPath === '/opt/cursor/cursor',
    JSON.stringify(resolvedPreferred));
  const resolvedNone = editor.resolveEditor({ preferred: 'cursor' }, [fake('vscode', '/usr/bin/code'), fake('cursor', null)]);
  expect('#199: a missing preferred editor falls back (never a dead launch)',
    resolvedNone?.entry.id === 'vscode',
    JSON.stringify(resolvedNone));
  const resolvedNothing = editor.resolveEditor({ preferred: 'auto' }, [fake('zed', null), fake('vscode', null)]);
  expect('#199: no editor at all is an honest null',
    resolvedNothing === null,
    JSON.stringify(resolvedNothing));

  // ── The VSCode-family extension (package-ready) ──────────────────────────
  const extDir = path.join(OLYMPUS, 'extensions/vscode-olympus');
  const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf-8'));
  expect('#199: the extension targets VSCode-family hosts and the :3740 bridge',
    pkg.name === 'olympus-bridge'
    && typeof pkg.engines?.vscode === 'string'
    && pkg.main === './out/extension.js'
    && pkg.scripts?.package?.includes('vsce package'),
    JSON.stringify({ name: pkg.name, engines: pkg.engines, main: pkg.main }));
  const extSrc = fs.readFileSync(path.join(extDir, 'src/extension.ts'), 'utf-8');
  expect('#199: the extension speaks the token-gated bridge protocol',
    /const BRIDGE_PORT = 3740/.test(extSrc)
    && /terminal-bridge-token/.test(extSrc)
    && /\?token=/.test(extSrc),
    'the extension is pointed elsewhere');
  const iconPath = path.join(extDir, 'media/icon.png');
  const icon = fs.existsSync(iconPath) ? fs.readFileSync(iconPath) : null;
  expect('#199: vsce packaging inputs exist (icon PNG + LICENSE)',
    !!icon && icon[0] === 0x89 && icon[1] === 0x50
    && fs.existsSync(path.join(extDir, 'LICENSE')),
    'vsce package would refuse the extension');
  const compiled = path.join(extDir, 'out/extension.js');
  if (fs.existsSync(compiled)) {
    expect('#199: the extension compiles to its declared entry point',
      fs.statSync(compiled).size > 1000,
      'the compiled entry point is empty');
  } else {
    console.log('SKIP  #199: compiled entry point — out/ absent (run `npm run compile` in extensions/vscode-olympus)');
  }

  fs.rmSync(home, { recursive: true, force: true });
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
