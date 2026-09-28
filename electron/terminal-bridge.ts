/**
 * Terminal Bridge (WebSocket :3740)
 *
 * Exposes in-app PTY sessions to external IDE extensions over a token-gated
 * WebSocket, so the user can attach to the same live terminal from inside
 * their editor.
 *
 * Protocol
 * --------
 *   Handshake:
 *     ws://127.0.0.1:3740/?token=<per-install-token>
 *     (token is generated at startup and written to
 *      ~/.olympus/terminal-bridge-token — only readable by the local user)
 *
 *   After handshake, the client sends JSON messages:
 *     { "type": "list" }
 *       → server replies: { "type": "sessions", "sessions": BridgePtyInfo[] }
 *
 *     { "type": "attach", "id": "<pty-id>" }
 *       → server replies: { "type": "attached", "id": "<pty-id>", "history": "<scrollback>" }
 *       → server sends:   { "type": "output", "id": "<pty-id>", "data": "<chunk>" }
 *       → server sends:   { "type": "exit", "id": "<pty-id>", "exitCode": N, "signal"?: N }
 *
 *     { "type": "input", "id": "<pty-id>", "data": "<chunk>" }
 *       → (no reply; the PTY receives the input)
 *
 *     { "type": "resize", "id": "<pty-id>", "cols": N, "rows": N }
 *       → (no reply; the PTY is resized)
 *
 *     { "type": "spawn", "kind": "shell"|"command", "cwd"?: "...", "command"?: "...", "label"?: "...", "cols"?: N, "rows"?: N }
 *       → server replies: { "type": "spawned", "id": "<new-pty-id>", "info": BridgePtyInfo }
 *       → server then sends "output" + "exit" events for the new PTY
 *
 *     { "type": "focus-olympus" }
 *       → server focuses the OLYMPUS BrowserWindow (used by the "Open in
 *          OLYMPUS" button in IDE extensions). Replies: { "type": "focused" }
 *
 *     { "type": "ping" }
 *       → server replies: { "type": "pong" }
 *
 *   The client may also send a binary frame containing raw UTF-8 bytes; the
 *   bridge treats it as input to the currently-attached PTY. This is a
 *   performance optimization for keystroke-level latency (no JSON wrapping).
 *
 * Security
 * --------
 *   - The server binds to 127.0.0.1 ONLY — never exposed to the network.
 *   - The token is 32 bytes of crypto-random data, base64url-encoded.
 *   - The token file (~/.olympus/terminal-bridge-token) is created with
 *     0o600 permissions (owner read/write only).
 *   - Without the token, the WebSocket handshake is rejected with 401.
 *   - The token rotates on every OLYMPUS restart, so stale IDE extensions
 *     must re-read the file (they poll it every 2s).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { app, BrowserWindow } from 'electron';
import { WebSocketServer, type WebSocket } from 'ws';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  listPtySessionsForBridge,
  attachBridgeClient,
  writePtyFromBridge,
  resizePtyFromBridge,
  spawnPtyForBridge,
  type BridgePtyInfo,
} from './native-terminal.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const BRIDGE_PORT = 3740;
const TOKEN_FILE = join(homedir(), '.olympus', 'terminal-bridge-token');
const BRIDGE_LOG = join(homedir(), '.olympus', 'terminal-bridge.log');

// ─── State ────────────────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;
let currentToken: string | null = null;

// Track per-connection state so we can clean up subscriptions on disconnect.
interface ClientState {
  /** PTY ids this client is currently attached to, with their unsub fns. */
  attachments: Map<string, () => void>;
}
const clients = new WeakMap<WebSocket, ClientState>();

function log(msg: string) {
  try {
    mkdirSync(dirname(BRIDGE_LOG), { recursive: true });
    appendFileSync(BRIDGE_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

// ─── Token management ────────────────────────────────────────────────────────

/**
 * Generate a fresh per-install token and write it to ~/.olympus/terminal-bridge-token
 * with 0o600 permissions. Called once at app startup. Returns the new token.
 *
 * The token rotates on every OLYMPUS restart — IDE extensions that cache it
 * must re-read the file when their connection drops (they poll every 2s).
 */
function rotateToken(): string {
  const token = randomBytes(32).toString('base64url');
  try {
    mkdirSync(dirname(TOKEN_FILE), { recursive: true });
    writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
    // Belt-and-suspenders: explicitly chmod in case writeFileSync's mode
    // param was ignored (some platforms honor it, some don't).
    chmodSync(TOKEN_FILE, 0o600);
    log(`Token rotated → ${TOKEN_FILE}`);
  } catch (err: any) {
    log(`rotateToken: failed to write token file: ${err.message}`);
  }
  return token;
}

/**
 * Read the current token from disk. Used by the `olympus terminal` CLI
 * subcommand (and by external tools that want to talk to the bridge).
 * Returns null if the file doesn't exist (e.g. OLYMPUS isn't running).
 */
export function readBridgeToken(): string | null {
  try {
    if (!existsSync(TOKEN_FILE)) return null;
    return readFileSync(TOKEN_FILE, 'utf-8').trim();
  } catch {
    return null;
  }
}

// ─── Message handling ────────────────────────────────────────────────────────

interface BridgeMessage {
  type: 'list' | 'attach' | 'input' | 'resize' | 'spawn' | 'focus-olympus' | 'ping' | 'detach';
  id?: string;
  data?: string;
  cols?: number;
  rows?: number;
  kind?: 'shell' | 'command';
  cwd?: string;
  command?: string;
  label?: string;
}

function sendJSON(ws: WebSocket, obj: any) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch (err: any) {
    log(`sendJSON failed: ${err.message}`);
  }
}

function handleMessage(ws: WebSocket, msg: BridgeMessage) {
  const state = ensureClientState(ws);

  switch (msg.type) {
    case 'ping': {
      sendJSON(ws, { type: 'pong', ts: Date.now() });
      break;
    }

    case 'list': {
      const sessions: BridgePtyInfo[] = listPtySessionsForBridge();
      sendJSON(ws, { type: 'sessions', sessions });
      break;
    }

    case 'attach': {
      const id = msg.id;
      if (!id) {
        sendJSON(ws, { type: 'error', error: 'attach requires id' });
        return;
      }
      // If already attached, just re-send the history.
      if (state.attachments.has(id)) {
        sendJSON(ws, { type: 'attached', id, history: '' });
        return;
      }
      const sub = attachBridgeClient(
        id,
        (data) => sendJSON(ws, { type: 'output', id, data }),
        (info) => {
          sendJSON(ws, { type: 'exit', id, exitCode: info.exitCode, signal: info.signal });
          // Auto-detach on exit.
          const fn = state.attachments.get(id);
          if (fn) {
            fn();
            state.attachments.delete(id);
          }
        },
      );
      if (!sub.ok) {
        sendJSON(ws, { type: 'error', error: `PTY ${id} not found` });
        return;
      }
      state.attachments.set(id, sub.unsubscribe);
      sendJSON(ws, { type: 'attached', id, history: sub.bufferedHistory });
      break;
    }

    case 'detach': {
      const id = msg.id;
      if (!id) return;
      const fn = state.attachments.get(id);
      if (fn) {
        fn();
        state.attachments.delete(id);
      }
      sendJSON(ws, { type: 'detached', id });
      break;
    }

    case 'input': {
      const id = msg.id;
      const data = msg.data;
      if (!id || typeof data !== 'string') return;
      writePtyFromBridge(id, data);
      break;
    }

    case 'resize': {
      const id = msg.id;
      const cols = msg.cols;
      const rows = msg.rows;
      if (!id || typeof cols !== 'number' || typeof rows !== 'number') return;
      resizePtyFromBridge(id, cols, rows);
      break;
    }

    case 'spawn': {
      const kind = msg.kind || 'shell';
      if (kind !== 'shell' && kind !== 'command') {
        sendJSON(ws, { type: 'error', error: `Invalid spawn kind: ${kind}` });
        return;
      }
      const id = spawnPtyForBridge({
        kind,
        cwd: msg.cwd,
        command: msg.command,
        label: msg.label,
        cols: msg.cols,
        rows: msg.rows,
      });
      if (!id) {
        sendJSON(ws, { type: 'error', error: 'Failed to spawn PTY' });
        return;
      }
      // Auto-attach the spawning client to the new PTY.
      const sub = attachBridgeClient(
        id,
        (data) => sendJSON(ws, { type: 'output', id, data }),
        (info) => {
          sendJSON(ws, { type: 'exit', id, exitCode: info.exitCode, signal: info.signal });
          const fn = state.attachments.get(id);
          if (fn) {
            fn();
            state.attachments.delete(id);
          }
        },
      );
      if (sub.ok) {
        state.attachments.set(id, sub.unsubscribe);
      }
      // Reply with the new PTY info.
      const sessions = listPtySessionsForBridge();
      const info = sessions.find((s) => s.id === id);
      sendJSON(ws, { type: 'spawned', id, info, history: sub.bufferedHistory });
      break;
    }

    case 'focus-olympus': {
      try {
        if (process.platform === 'darwin') {
          app.focus({ steal: true });
        }
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
        sendJSON(ws, { type: 'focused', ok: windows.length > 0 });
      } catch (err: any) {
        sendJSON(ws, { type: 'error', error: `focus-olympus failed: ${err.message}` });
      }
      break;
    }

    default: {
      sendJSON(ws, { type: 'error', error: `Unknown message type: ${(msg as any).type}` });
    }
  }
}

function ensureClientState(ws: WebSocket): ClientState {
  let s = clients.get(ws);
  if (!s) {
    s = { attachments: new Map() };
    clients.set(ws, s);
  }
  return s;
}

function cleanupClient(ws: WebSocket) {
  const s = clients.get(ws);
  if (!s) return;
  for (const fn of s.attachments.values()) {
    try { fn(); } catch {}
  }
  s.attachments.clear();
}

// ─── Server lifecycle ────────────────────────────────────────────────────────

/**
 * Start the Terminal Bridge WebSocket server. Idempotent — safe to call
 * multiple times (subsequent calls are no-ops).
 *
 * Called from electron/main.ts on app.whenReady().
 */
export function registerTerminalBridge(): void {
  if (wss) {
    log('Terminal Bridge already registered — skipping (idempotent).');
    return;
  }

  // Generate (or rotate) the per-install token.
  currentToken = rotateToken();

  log('╔═══════════════════════════════════════════════════════════════╗');
  log('║ Terminal Bridge module loaded                                 ║');
  log(`║ port: ${BRIDGE_PORT}`);
  log(`║ token file: ${TOKEN_FILE}`);
  log('║ bind: 127.0.0.1 only (never exposed to network)              ║');
  log('║ protocol: ws://127.0.0.1:3740/?token=<token>                 ║');
  log('║ clients: VSCode/Codium/Cursor ext, Zed ext, `olympus terminal` CLI');
  log('╚═══════════════════════════════════════════════════════════════╝');

  wss = new WebSocketServer({
    port: BRIDGE_PORT,
    host: '127.0.0.1', // Localhost only — never exposed to the network.
    // Reject clients that don't send a valid token in the URL query string.
    // NOTE: `ws` passes a `{ origin, secure, req }` info object — NOT a
    // node:http IncomingMessage. The `req` field holds the IncomingMessage.
    // Annotate explicitly because verifyClient is a union-typed option
    // (sync | async) and TS can't infer the param type from the union.
    verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
      const url = info.req?.url || '';
      const token = extractTokenFromUrl(url);
      if (!token || !currentToken || token !== currentToken) {
        log(`verifyClient: REJECTED (no/invalid token) — url=${url.slice(0, 80)}...`);
        return false;
      }
      return true;
    },
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const ip = req.socket.remoteAddress || 'unknown';
    log(`Client connected from ${ip}`);

    ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      // Binary frames are raw input for the first attached PTY (low-latency
      // keystroke path). JSON frames are control messages.
      if (isBinary && raw instanceof Buffer) {
        const state = ensureClientState(ws);
        const firstId = state.attachments.keys().next().value;
        if (firstId) {
          writePtyFromBridge(firstId, raw.toString('utf-8'));
        }
        return;
      }

      let msg: BridgeMessage;
      try {
        const text = Buffer.isBuffer(raw) ? raw.toString('utf-8')
          : Array.isArray(raw) ? Buffer.concat(raw).toString('utf-8')
          : new TextDecoder().decode(raw);
        msg = JSON.parse(text);
      } catch (err: any) {
        sendJSON(ws, { type: 'error', error: `Invalid JSON: ${err.message}` });
        return;
      }
      try {
        handleMessage(ws, msg);
      } catch (err: any) {
        log(`handleMessage error: ${err.message}`);
        sendJSON(ws, { type: 'error', error: err.message });
      }
    });

    ws.on('close', () => {
      log(`Client disconnected from ${ip}`);
      cleanupClient(ws);
    });

    ws.on('error', (err: Error) => {
      log(`Client socket error from ${ip}: ${err.message}`);
      cleanupClient(ws);
    });

    // Send a hello so the client knows the handshake succeeded.
    sendJSON(ws, {
      type: 'hello',
      version: '1.0',
      server: 'olympus-terminal-bridge',
      pid: process.pid,
    });
  });

  wss.on('error', (err: Error) => {
    log(`WebSocket server error: ${err.message}`);
  });
}

/**
 * Shutdown the Terminal Bridge. Called from electron/main.ts on before-quit.
 * Closes all client connections + the server itself.
 */
export function shutdownTerminalBridge(): void {
  if (!wss) return;
  try {
    for (const client of wss.clients) {
      try {
        client.close(1001, 'OLYMPUS shutting down');
      } catch {}
    }
    wss.close();
    wss = null;
    log('Terminal Bridge shut down.');
  } catch (err: any) {
    log(`shutdownTerminalBridge error: ${err.message}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTokenFromUrl(url: string): string | null {
  try {
    const q = url.split('?')[1];
    if (!q) return null;
    for (const pair of q.split('&')) {
      const [k, v] = pair.split('=');
      if (k === 'token' && v) return decodeURIComponent(v);
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Connection-info exports (for `olympus doctor`) ──────────────────────────

export interface BridgeStatus {
  running: boolean;
  port: number;
  host: string;
  tokenFile: string;
  hasToken: boolean;
  connectedClients: number;
}

/** Get the current bridge status (for `olympus doctor` + the in-app UI). */
export function getBridgeStatus(): BridgeStatus {
  return {
    running: !!wss,
    port: BRIDGE_PORT,
    host: '127.0.0.1',
    tokenFile: TOKEN_FILE,
    hasToken: !!currentToken,
    connectedClients: wss ? wss.clients.size : 0,
  };
}
