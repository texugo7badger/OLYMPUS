#!/usr/bin/env node
/**
 * first-run.test.mjs — #201: the from-zero run.
 * Run: npx tsx scripts/first-run.test.mjs   (exit 0 = pass)
 *
 * A fresh install has NO token, NO vault state, NO short-circuit log. On the
 * first use two surfaces must come alive:
 *   1. the Terminal Bridge binds on 127.0.0.1:3740 with a fresh token, and
 *   2. the first instinct gate evaluation appends a row to
 *      05_Auto_Learning/shortcircuit-log.jsonl (the Short-Circuit Health
 *      panel's only data source).
 *
 * This suite drives the REAL v2 plugin entry (olympus-router/index.ts): it
 * registers the session context hook, feeds one first user message, and
 * asserts the gate output + the persisted row + the reader round-trip.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromRepo = createRequire(path.join(OLYMPUS, 'package.json'));
const { WebSocket } = requireFromRepo('ws');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
}
function once(ws, type, ms = 5000) {
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
  // ── The fresh install: an empty HOME + an empty vault ────────────────────
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-first-run-'));
  const vault = path.join(home, 'OLYMPUS-VAULT');
  process.env.HOME = home;
  process.env.OLYMPUS_VAULT = vault;
  process.env.OLYMPUS_VAULT_ROOT = vault;
  process.env.OLYMPUS_ROOT = OLYMPUS;
  fs.mkdirSync(vault, { recursive: true });

  const log = path.join(vault, '05_Auto_Learning', 'shortcircuit-log.jsonl');
  expect('#201: a fresh install starts with no short-circuit log',
    !fs.existsSync(log),
    'the fixture is not from zero');

  // ── Surface 1: the Terminal Bridge binds on first boot ───────────────────
  const portBusy = await new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port: 3740 });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(500);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });

  const bridge = await import(pathToFileURL(path.join(OLYMPUS, 'electron/terminal-bridge.ts')).href + `?t=${Date.now()}`);
  if (portBusy) {
    console.log('SKIP  #201: bridge first-boot — port 3740 already owned by a running OLYMPUS');
  } else {
    bridge.registerTerminalBridge();
    const tokenFile = path.join(home, '.olympus', 'terminal-bridge-token');
    for (let i = 0; i < 40 && !fs.existsSync(tokenFile); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const token = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf-8').trim() : '';
    let ws = null;
    for (let i = 0; i < 30 && !ws; i++) {
      try {
        const cand = new WebSocket(`ws://127.0.0.1:3740/?token=${encodeURIComponent(token)}`);
        await once(cand, 'hello');
        ws = cand;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    expect('#201: the first boot writes a token and answers hello',
      token.length >= 40 && !!ws,
      `token len ${token.length}, connected ${!!ws}`);
    ws?.close();
    bridge.shutdownTerminalBridge();
  }

  // ── Surface 2: the first gate evaluation lights up the log ───────────────
  const mod = await import(pathToFileURL(path.join(OLYMPUS, '.opencode/src/olympus-router/index.ts')).href + `?t=${Date.now()}`);
  const plugin = mod.default;
  expect('#201: the active plugin is the v2 olympus-router entry',
    plugin?.id === 'olympus-router' && typeof plugin.setup === 'function',
    JSON.stringify(Object.keys(mod)));

  const hooks = {};
  const ctx = {
    location: { directory: OLYMPUS },
    session: { hook: async (n, fn) => { hooks[`session:${n}`] = fn; } },
    permission: { hook: async (n, fn) => { hooks[`permission:${n}`] = fn; } },
    tool: { hook: async (n, fn) => { hooks[`tool:${n}`] = fn; } },
  };
  await plugin.setup(ctx);
  expect('#201: the v2 entry wires the session context + permission + tool hooks',
    typeof hooks['session:context'] === 'function'
    && typeof hooks['permission:evaluate'] === 'function'
    && typeof hooks['tool:execute.before'] === 'function',
    JSON.stringify(Object.keys(hooks)));

  const sctx = {
    sessionID: 's-first-run',
    agent: 'apollo',
    model: {},
    system: [],
    options: {},
    messages: [{ role: 'user', parts: [{ type: 'text', text: 'build a hero section for the landing page' }] }],
  };
  await hooks['session:context'](sctx);
  expect('#201: the first gate evaluation emits olympus_instinct_gate',
    typeof sctx.options?.olympus_instinct_gate?.confidence === 'number'
    && typeof sctx.options.olympus_instinct_gate.short_circuit === 'boolean',
    JSON.stringify(sctx.options));

  const exists = fs.existsSync(log);
  const rows = exists
    ? fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  expect('#201: the first evaluation creates 05_Auto_Learning/shortcircuit-log.jsonl',
    exists && rows.length === 1,
    `exists ${exists}, rows ${rows.length}`);
  const row = rows[0];
  expect('#201: the row carries god/ts/confidence/short_circuited',
    row?.god === 'apollo'
    && typeof row.ts === 'string' && !Number.isNaN(Date.parse(row.ts))
    && typeof row.confidence === 'number'
    && typeof row.short_circuited === 'boolean',
    JSON.stringify(row));

  const { getShortCircuitStats } = await import(pathToFileURL(path.join(OLYMPUS, 'src/lib/shortcircuit-telemetry.ts')).href + `?t=${Date.now()}`);
  const stats = getShortCircuitStats();
  expect('#201: the Short-Circuit Health reader aggregates the fresh row',
    stats.total_evaluations === 1
    && stats.per_god?.apollo?.evaluations === 1
    && stats.log_file?.exists === true,
    JSON.stringify({ total: stats.total_evaluations, apollo: stats.per_god?.apollo, file: stats.log_file }));

  fs.rmSync(home, { recursive: true, force: true });
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
