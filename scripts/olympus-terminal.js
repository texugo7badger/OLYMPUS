#!/usr/bin/env node
/**
 * olympus terminal — connect to the running OLYMPUS Terminal Bridge and stream
 * a live PTY in the current shell.
 *
 *
 * This is the universal client for users who want to interact with OLYMPUS's
 * live terminal from any shell — including Zed's built-in terminal, a tmux
 * pane, an SSH session, etc. It connects to the Terminal Bridge WebSocket
 * (ws://127.0.0.1:3740) using the per-install token from
 * ~/.olympus/terminal-bridge-token, lists active PTY sessions, and lets the
 * user pick one to attach to (or spawn a new one).
 *
 * Usage:
 *   olympus terminal                  # Interactive: list + pick or spawn
 *   olympus terminal --attach <id>    # Attach to a specific PTY by id
 *   olympus terminal --spawn          # Spawn a new shell PTY and attach
 *   olympus terminal --cwd <path>     # Spawn with a specific working directory
 *   olympus terminal --list           # Just list active sessions + exit
 *   olympus terminal --status         # Show bridge status (no attach)
 *
 * Requirements:
 *   - OLYMPUS must be running (the Electron app spawns the bridge).
 *   - The token file ~/.olympus/terminal-bridge-token must exist.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const TOKEN_FILE = join(homedir(), '.olympus', 'terminal-bridge-token');
const BRIDGE_URL_BASE = 'ws://127.0.0.1:3740';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const has = (name) => args.includes(`--${name}`);

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  gold: '\x1b[38;2;212;165;116m',
  green: '\x1b[38;2;123;174;142m',
  gray: '\x1b[38;2;139;139;139m',
  red: '\x1b[38;2;196;117;106m',
  cyan: '\x1b[38;2;107;174;181m',
};

function die(msg, code = 1) {
  console.error(`${c.red}olympus terminal:${c.reset} ${msg}`);
  process.exit(code);
}

function readToken() {
  if (!existsSync(TOKEN_FILE)) {
    die(`OLYMPUS Terminal Bridge token not found at ${TOKEN_FILE}.\n` +
        `Make sure OLYMPUS is running — the Electron app generates the token at startup.\n` +
        `If OLYMPUS is running and you still see this, check the file permissions on ~/.olympus/.`);
  }
  try {
    return readFileSync(TOKEN_FILE, 'utf-8').trim();
  } catch (err) {
    die(`Failed to read token file: ${err.message}`);
  }
}

function connect(token) {
  const url = `${BRIDGE_URL_BASE}/?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);
  return ws;
}

function sendMsg(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

async function listSessions(ws) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('list timeout')), 5000);
    const handler = (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'sessions' && msg.sessions) {
          clearTimeout(timeout);
          ws.off('message', handler);
          resolve(msg.sessions);
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          ws.off('message', handler);
          reject(new Error(msg.error || 'unknown error'));
        }
      } catch {}
    };
    ws.on('message', handler);
    sendMsg(ws, { type: 'list' });
  });
}

async function spawnSession(ws, cwd) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('spawn timeout')), 5000);
    const handler = (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'spawned' && msg.id) {
          clearTimeout(timeout);
          ws.off('message', handler);
          resolve({ id: msg.id, info: msg.info, history: msg.history || '' });
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          ws.off('message', handler);
          reject(new Error(msg.error || 'spawn failed'));
        }
      } catch {}
    };
    ws.on('message', handler);
    sendMsg(ws, { type: 'spawn', kind: 'shell', cwd });
  });
}

async function attachSession(ws, id) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('attach timeout')), 5000);
    const handler = (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'attached' && msg.id === id) {
          clearTimeout(timeout);
          ws.off('message', handler);
          resolve({ history: msg.history || '' });
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          ws.off('message', handler);
          reject(new Error(msg.error || 'attach failed'));
        }
      } catch {}
    };
    ws.on('message', handler);
    sendMsg(ws, { type: 'attach', id });
  });
}

function formatSession(s, idx) {
  const age = Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 1000);
  const ageStr = age < 60 ? `${age}s` : age < 3600 ? `${Math.floor(age / 60)}m` : `${Math.floor(age / 3600)}h`;
  const flag = s.isFallback ? ' [fallback]' : '';
  return `${c.gold}[${idx}]${c.reset} ${c.bold}${s.label}${c.reset} ${c.dim}(${s.kind})${c.reset} ${c.gray}age=${ageStr} cwd=${s.cwd}${flag}`;
}

async function pickSessionInteractively(sessions) {
  if (sessions.length === 0) {
    console.log(`${c.gray}No active PTY sessions. Spawning a new one${c.reset}`);
    return null;
  }
  console.log(`${c.bold}Active OLYMPUS PTY sessions:${c.reset}`);
  sessions.forEach((s, i) => console.log(formatSession(s, i)));
  console.log(`${c.gold}[n]${c.reset} ${c.dim}Spawn a new shell PTY${c.reset}`);
  console.log(`${c.gold}[q]${c.reset} ${c.dim}Quit${c.reset}`);
  process.stdout.write(`${c.gold}Choice: ${c.reset}`);

  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    rl.question('', (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === 'q' || a === '') {
        resolve(undefined);
        process.exit(0);
      }
      if (a === 'n') {
        resolve(null);
        return;
      }
      const idx = parseInt(a, 10);
      if (!isNaN(idx) && idx >= 0 && idx < sessions.length) {
        resolve(sessions[idx].id);
      } else {
        console.error(`${c.red}Invalid choice.${c.reset}`);
        process.exit(1);
      }
    });
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const token = readToken();
  const ws = connect(token);

  // Wait for hello.
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('connect timeout — is OLYMPUS running?')), 5000);
    ws.once('message', (raw) => {
      clearTimeout(timeout);
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'hello') resolve();
      } catch {}
    });
    ws.once('error', (err) => {
      clearTimeout(timeout);
      die(`Failed to connect to OLYMPUS Terminal Bridge at ${BRIDGE_URL_BASE}: ${err.message}\n` +
          `Is OLYMPUS running? Start it with: ${c.bold}olympus dev${c.reset}`);
    });
  });

  // --status: print bridge status + exit.
  if (has('status')) {
    console.log(`${c.green}OLYMPUS Terminal Bridge is running.${c.reset}`);
    console.log(`  ${c.dim}URL:${c.reset}   ${BRIDGE_URL_BASE}`);
    console.log(`  ${c.dim}Token:${c.reset} ${TOKEN_FILE}`);
    const sessions = await listSessions(ws);
    console.log(`  ${c.dim}Active PTY sessions:${c.reset} ${sessions.length}`);
    sessions.forEach((s, i) => console.log(`    ${formatSession(s, i)}`));
    ws.close();
    process.exit(0);
  }

  // --list: print sessions + exit.
  if (has('list')) {
    const sessions = await listSessions(ws);
    console.log(`${c.bold}Active OLYMPUS PTY sessions (${sessions.length}):${c.reset}`);
    if (sessions.length === 0) {
      console.log(`  ${c.gray}(none — spawn one with: olympus terminal --spawn)${c.reset}`);
    } else {
      sessions.forEach((s, i) => console.log(formatSession(s, i)));
    }
    ws.close();
    process.exit(0);
  }

  // Pick which PTY to attach to.
  let ptyId;
  if (has('attach')) {
    ptyId = flag('attach');
    if (!ptyId) die('--attach requires a PTY id argument');
  } else if (has('spawn')) {
    ptyId = null; // explicit spawn
  } else {
    const sessions = await listSessions(ws);
    ptyId = await pickSessionInteractively(sessions);
    if (ptyId === undefined) { ws.close(); process.exit(0); }
  }

  // Spawn or attach.
  let history;
  if (!ptyId) {
    const cwd = flag('cwd') || process.cwd();
    console.log(`${c.dim}Spawning new shell PTY at ${cwd}${c.reset}`);
    const result = await spawnSession(ws, cwd);
    ptyId = result.id;
    history = result.history;
    console.log(`${c.green}Spawned PTY ${ptyId}${c.reset}`);
  } else {
    console.log(`${c.dim}Attaching to PTY ${ptyId}${c.reset}`);
    const result = await attachSession(ws, ptyId);
    history = result.history;
  }

  // Enter raw mode + forward stdin/stdout.
  const stdin = process.stdin;
  const stdout = process.stdout;
  const isTTY = stdin.isTTY;

  if (isTTY) {
    stdin.setRawMode(true);
  }
  stdin.resume();
  stdin.setEncoding('utf-8');

  // Write any history first (so the user sees the existing terminal state).
  if (history) stdout.write(history);

  // Forward stdin → bridge (as JSON 'input' messages).
  stdin.on('data', (data) => {
    sendMsg(ws, { type: 'input', id: ptyId, data });
  });

  // Forward bridge output → stdout. Also handle exit + resize.
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'output' && msg.id === ptyId && msg.data) {
        stdout.write(msg.data);
      } else if (msg.type === 'exit' && msg.id === ptyId) {
        console.log(`\n${c.gray}[PTY exited: code=${msg.exitCode}${msg.signal ? ` signal=${msg.signal}` : ''}]${c.reset}`);
        if (isTTY) stdin.setRawMode(false);
        ws.close();
        process.exit(msg.exitCode ?? 0);
      } else if (msg.type === 'error') {
        console.error(`\n${c.red}Bridge error: ${msg.error}${c.reset}`);
      }
    } catch {}
  });

  // Forward terminal resize → bridge.
  if (isTTY && process.stdout.on) {
    const onResize = () => {
      const cols = stdout.columns || 80;
      const rows = stdout.rows || 24;
      sendMsg(ws, { type: 'resize', id: ptyId, cols, rows });
    };
    onResize(); // send initial size
    process.stdout.on('resize', onResize);
  }

  // Ctrl+C → send SIGINT to PTY (0x03).
  // In raw mode Ctrl+C is captured as \x03 — we forward it as input.
  // Ctrl+D → close.
  process.on('SIGINT', () => {
    sendMsg(ws, { type: 'input', id: ptyId, data: '\x03' });
  });

  ws.on('close', () => {
    if (isTTY) stdin.setRawMode(false);
    console.log(`\n${c.gray}[disconnected from OLYMPUS Terminal Bridge]${c.reset}`);
    process.exit(0);
  });

  ws.on('error', (err) => {
    console.error(`\n${c.red}Bridge socket error: ${err.message}${c.reset}`);
    if (isTTY) stdin.setRawMode(false);
    process.exit(1);
  });
}

main().catch((err) => {
  die(err.message || 'unknown error');
});
