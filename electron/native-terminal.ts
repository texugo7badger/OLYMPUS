/**
 * Native Terminal — node-pty + xterm.js multi-PTY manager.
 *
 * Architecture:
 *   Main process spawns PTYs → buffers output until renderer attaches →
 *   forwards output via IPC → renderer writes to xterm.js (for shell)
 *   or parses JSONL (for opencode).
 *
 * Key design decisions:
 *   - kind:'opencode' spawns `opencode run --format json` and streams JSONL.
 *   - Attach handshake with 1s auto-attach fallback (eliminates blank-terminal race).
 *   - Fallback to child_process.spawn when node-pty fails to load (ABI mismatch).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import { spawn as childSpawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

// Lazy node-pty loader.
// node-pty is a native addon that must be rebuilt for Electron's Node ABI.
// Loading lazily via require() lets us capture failure and fall back to
// child_process.spawn instead of crashing the module at import time.
import type { IPty } from 'node-pty';

type PtySpawnFn = (file: string, args: string[] | string, options: any) => IPty;

let _ptySpawn: PtySpawnFn | null = null;
let _ptyLoadError: string | null = null;
let _ptyLoadAttempted = false;

/**
 * Lazily load node-pty's spawn function. Returns null if the native module
 * failed to load (ABI mismatch, not rebuilt for Electron, etc.). The error
 * is captured in `_ptyLoadError` for surfacing to the renderer.
 *
 * This is called on EVERY `spawnPty()` invocation (not just once) so that
 * if the user runs `npm rebuild node-pty` while the app is open, the next
 * terminal spawn picks up the rebuilt module.
 */
function getPtySpawn(): PtySpawnFn | null {
  if (_ptyLoadAttempted && _ptySpawn) return _ptySpawn;
  _ptyLoadAttempted = true;
  try {
    // require() inside a try/catch — if node-pty's .node binary fails to
    // load (ABI mismatch), require() throws and we capture the error.
    // Using createRequire so this works in both CJS (compiled Electron main)
    // and ESM (if the module is ever loaded from the Next.js side).
    const mod = require('node-pty');
    if (typeof mod.spawn === 'function') {
      _ptySpawn = mod.spawn as PtySpawnFn;
      _ptyLoadError = null;
      log('node-pty loaded successfully (native module OK).');
      return _ptySpawn;
    }
    _ptyLoadError = 'node-pty loaded but .spawn is not a function (corrupted install).';
    log(`ERROR: ${_ptyLoadError}`);
    return null;
  } catch (err: any) {
    _ptyLoadError = `node-pty native module failed to load: ${err.message}. ` +
      `This usually means it was not rebuilt for Electron's Node ABI. ` +
      `Fix: npm install @electron/rebuild && npx electron-rebuild -f -w node-pty`;
    log(`ERROR: ${_ptyLoadError}`);
    log(`  err.code: ${err.code || '(none)'}`);
    log(`  err.stack: ${err.stack || '(none)'}`);
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type TerminalKind = 'shell' | 'opencode' | 'command';

export interface CreatePtyOptions {
  kind: TerminalKind;
  cwd?: string;
  command?: string;
  cols?: number;
  rows?: number;
  label?: string;
  /**
   * @internal — set by spawnPtyForBridge(). Skips the in-app diagnostic
   * test-command injection (OlYMPUS_PTY_TEST) so external IDE clients that
   * spawn a PTY via the Terminal Bridge don't see a stray echo in their
   * fresh terminal. The in-app renderer path leaves this undefined.
   */
  forBridge?: boolean;
}

/**
 * PtyLike interface — shared by node-pty's IPty and our FallbackPty.
 * Allows the rest of the code to be agnostic to whether node-pty loaded.
 */
interface PtyLike {
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

/**
 * FallbackPty — child_process.spawn-based PTY replacement.
 * Used when node-pty fails to load (ABI mismatch, not rebuilt for Electron, etc.).
 * Provides a working terminal without native module dependency.
 *
 * Limitations vs. a real PTY:
 *   - No tab completion, up-arrow history, or terminal resize
 *   - Some programs may detect non-TTY and disable color
 *
 * But it CAN run commands, show output, accept keyboard input, and support Ctrl+C.
 */
class FallbackPty implements PtyLike {
  private child: ChildProcess;
  private dataCbs: Array<(data: string) => void> = [];
  private exitCbs: Array<(e: { exitCode: number; signal?: number }) => void> = [];
  private _killed = false;
  private _resizeWarned = false;

  constructor(file: string, args: string[] | string, options: { cwd: string; env: NodeJS.ProcessEnv; cols?: number; rows?: number }) {
    // Flatten args if string (child_process.spawn wants string[])
    const argArray = typeof args === 'string' ? [args] : args;

    this.child = childSpawn(file, argArray, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Don't use shell:true — resolveSpawnTarget already returns the
      // shell binary directly. shell:true would nest shells.
      shell: false,
    });

    // Wire stdout → data callbacks.
    this.child.stdout?.on('data', (chunk: Buffer) => {
      const data = chunk.toString('utf-8');
      for (const cb of this.dataCbs) {
        try { cb(data); } catch {}
      }
    });

    // Wire stderr → data callbacks (merge into stdout so xterm.js shows it).
    this.child.stderr?.on('data', (chunk: Buffer) => {
      const data = chunk.toString('utf-8');
      for (const cb of this.dataCbs) {
        try { cb(data); } catch {}
      }
    });

    // Wire exit.
    this.child.on('close', (code, signal) => {
      const exitCode = code ?? -1;
      const signalNum = typeof signal === 'string' ? undefined : signal ?? undefined;
      for (const cb of this.exitCbs) {
        try { cb({ exitCode, signal: signalNum }); } catch {}
      }
    });

    // If the child fails to spawn at all (e.g. ENOENT), 'error' fires.
    this.child.on('error', (err: any) => {
      // Emit a diagnostic message so the user sees what went wrong, then
      // emit exit so the terminal shows the exit state.
      const msg = `\r\n\x1b[38;2;196;117;106m  [spawn error: ${err.message}]\x1b[0m\r\n`;
      for (const cb of this.dataCbs) {
        try { cb(msg); } catch {}
      }
      for (const cb of this.exitCbs) {
        try { cb({ exitCode: -1 }); } catch {}
      }
    });
  }

  onData(cb: (data: string) => void): void {
    this.dataCbs.push(cb);
  }

  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void {
    this.exitCbs.push(cb);
  }

  write(data: string): void {
    if (this._killed) return;
    try {
      // stdin might be null if the child already exited.
      if (this.child.stdin && !this.child.stdin.destroyed) {
        this.child.stdin.write(data);
      }
    } catch {}
  }

  resize(cols: number, rows: number): void {
    // No-op — child_process doesn't support TIOCSWINSZ. Warn once.
    if (!this._resizeWarned) {
      this._resizeWarned = true;
      // Don't log on every resize — just once.
    }
  }

  kill(): void {
    this._killed = true;
    try {
      // Close stdin first so the shell exits cleanly (EOF).
      if (this.child.stdin && !this.child.stdin.destroyed) {
        this.child.stdin.end();
      }
    } catch {}
    try { this.child.kill('SIGTERM'); } catch {}
    // Force-kill after 500ms if still alive.
    setTimeout(() => {
      try {
        if (!this.child.killed) {
          this.child.kill('SIGKILL');
        }
      } catch {}
    }, 500);
  }
}

interface PtyEntry {
  pty: PtyLike;
  id: string;
  kind: TerminalKind;
  cwd: string;
  command: string | null;
  label: string;
  killed: boolean;
  /** Attach handshake — false until renderer calls attachPty(). */
  attached: boolean;
  /** Buffered output while attached === false. */
  outputBuffer: string[];
  /** true when using FallbackPty (no node-pty). */
  isFallback: boolean;
  /** true once the PTY has emitted ANY data (never cleared).
   *  Used by the silent-failure detector so that an attached+flushed PTY
   *  that later exits non-zero is classified as "produced output".
   *  (the outputBuffer is cleared on attach, so it can't be used alone). */
  everEmittedData: boolean;
  /** true once we've logged the first output chunk (for debugging). Prevents log spam. */
  _loggedFirstOutput?: boolean;
  /** running count of output chunks for diagnostic logging. */
  _outputChunkCount?: number;
  /** External subscribers (IDE extensions on port 3740) — mirror output
   *  to bridge clients independently of the renderer's attach state. */
  bridgeListeners: BridgeListener[];
}

// ─── State ────────────────────────────────────────────────────────────────────

const ptys = new Map<string, PtyEntry>();

const PTY_LOG = join(homedir(), '.olympus', 'native-terminal.log');

function log(msg: string) {
  try {
    mkdirSync(dirname(PTY_LOG), { recursive: true });
    appendFileSync(PTY_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

// ─── Environment ──────────────────────────────────────────────────────────────

/**
 * Build the environment for spawned processes.
 * Loads ~/.olympus/.env, <root>/.env, and ~/.olympus/api-configs.json.
 * Sets locale vars and OpenCode-specific vars.
 */
function buildEnv(root: string, kind: TerminalKind): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // Load env files
  const envFiles = [
    join(homedir(), '.olympus', '.env'),
    join(root, '.env'),
    join(homedir(), '.olympus', 'api-configs.json'),
  ];

  for (const f of envFiles) {
    try {
      if (!existsSync(f)) continue;
      const content = readFileSync(f, 'utf-8');
      if (f.endsWith('.json')) {
        try {
          const configs = JSON.parse(content);
          if (configs && typeof configs === 'object') {
            for (const [key, value] of Object.entries(configs)) {
              if (typeof value === 'string' && key.endsWith('_API_KEY')) {
                env[key] = value;
              }
            }
          }
        } catch {}
      } else {
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx < 0) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (key) env[key] = value;
        }
      }
    } catch {}
  }

  env.OLYMPUS_ROOT = root;
  env.OLYMPUS_VAULT = env.OLYMPUS_VAULT || join(homedir(), 'OLYMPUS-VAULT');
  env.OLYMPUS_GOD = env.OLYMPUS_GOD || 'apollo';
  env.HOME = homedir();

  // Prepend node_modules/.bin to PATH
  const pathSep = ':';
  const localBinDir = join(root, 'node_modules', '.bin');
  const extraPaths = [
    localBinDir,
    join(homedir(), '.local', 'bin'),
    join(homedir(), '.bun', 'bin'),
    '/usr/local/bin',
  ];
  const existingPath = env.PATH || '';
  env.PATH = [...extraPaths, existingPath].filter(Boolean).join(pathSep);

  // For kind:'opencode', set the env vars that suppress TUI-specific
  // behavior. These are harmless for `opencode run --format json` (which
  // doesn't render a TUI) but make the spawn robust if a user ever
  // replaces the args with a TUI launch.
  if (kind === 'opencode') {
    env.BUN_DISABLE_KITTY_PROBE = env.BUN_DISABLE_KITTY_PROBE || '1';
    env.TERM_PROGRAM = env.TERM_PROGRAM || 'olympus';
    env.OPENCODE_DISABLE_MOUSE = env.OPENCODE_DISABLE_MOUSE || '1';
    env.OPENCODE_DISABLE_TERMINAL_TITLE = env.OPENCODE_DISABLE_TERMINAL_TITLE || '1';
  }

  return env;
}

/**
 * Find the Olympus root directory (where opencode.json lives).
 */
function findOlympusRoot(): string {
  if (process.env.OLYMPUS_ROOT && existsSync(join(process.env.OLYMPUS_ROOT, 'opencode.json'))) {
    return process.env.OLYMPUS_ROOT;
  }
  const appRoot = app.isPackaged
    ? dirname(dirname(process.execPath))
    : dirname(__dirname);
  if (existsSync(join(appRoot, 'opencode.json'))) return appRoot;
  if (existsSync(join(process.cwd(), 'opencode.json'))) return process.cwd();
  return appRoot;
}

/**
 * Resolve the opencode binary path (local install in node_modules/.bin).
 * Returns null if not found.
 */
function findOpencodeBinary(root: string): string | null {
  const binDir = join(root, 'node_modules', '.bin');
  const candidates = [
    join(binDir, 'opencode'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fall back to the package's bin shim (rare — only if the .bin symlink
  // is missing).
  const pkgBin = join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
  if (existsSync(pkgBin)) return pkgBin;
  return null;
}

/**
 * Resolve the shell/command to run inside the PTY.
 *
 * kind:'opencode' is handled by the one-shot IPC channel (olympus:opencode-run),
 * not via PTY. If received here (legacy caller), it falls back to shell.
 *
 * kind:'shell':
 *   Linux:    `$SHELL -i`
 *
 * kind:'command':
 *   Linux:    `$SHELL -i -c "<command>; exec $SHELL -i"`
 */
function resolveSpawnTarget(
  root: string,
  opencodeBin: string | null,
  kind: TerminalKind,
  command: string | undefined,
): { file: string; args: string[] } {
  // ─── Linux ──────────────────────────────────────────────────────────────────
  const shell = process.env.SHELL || '/bin/bash';

  if (kind === 'opencode') {
    // kind:'opencode' is no longer spawned via PTY.
    log('WARNING: kind:"opencode" spawned via PTY (legacy). Use the opencode-run IPC channel instead. Falling back to shell.');
    return { file: shell, args: ['-i'] };
  }
  if (kind === 'command' && command) {
    return { file: shell, args: ['-i', '-c', `${command}; exec ${shell} -i`] };
  }
  // kind === 'shell'
  return { file: shell, args: ['-i'] };
}

// ─── PTY Management ───────────────────────────────────────────────────────────

function sendOutputToRenderer(id: string, data: string): void {
  const windows = BrowserWindow.getAllWindows();
  // Log if there are no windows (race during app startup).
  if (windows.length === 0) {
    log(`sendOutputToRenderer: NO WINDOWS — output DROPPED (${data.length} bytes for PTY ${id})`);
    return;
  }
  for (const win of windows) {
    try {
      win.webContents.send('olympus:pty-output', { id, data });
    } catch (err: any) {
      log(`sendOutputToRenderer: webContents.send FAILED: ${err.message}`);
    }
  }
}

/**
 * Spawn a PTY with basic diagnostic logging (spawn target, exit code).
 */
function spawnPty(opts: CreatePtyOptions): string | null {
  try {
    const root = findOlympusRoot();
    const kind = opts.kind;
    // Default to home directory (not OLYMPUS source root) when no cwd provided.
    const cwd = opts.cwd && existsSync(opts.cwd) ? opts.cwd : homedir();

    // For kind:'opencode', find the local binary.
    let opencodeBin: string | null = null;
    if (kind === 'opencode') {
      opencodeBin = findOpencodeBinary(root);
      if (!opencodeBin) {
        log('ERROR: Local opencode binary not found.');
        log(`  Looked in: ${join(root, 'node_modules', '.bin', 'opencode')}`);
        log('  Run: npm run install-opencode');
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          try {
            win.webContents.send('olympus:pty-spawn-failed', {
              kind,
              label: opts.label || '',
              error: 'opencode-not-found',
            });
          } catch {}
        }
        return null;
      }
      log(`Found local opencode: ${opencodeBin}`);
    }

    const { file, args } = resolveSpawnTarget(root, opencodeBin, kind, opts.command);
    const env = buildEnv(root, kind);

    // Set TERM env vars.
    env.TERM = env.TERM || 'xterm-256color';
    env.COLORTERM = env.COLORTERM || 'truecolor';
    env.FORCE_COLOR = '1';
    delete env.NO_COLOR;

    log('════════════════════════════════════════════════════════════════');
    log(`Spawning PTY (kind=${kind})`);
    log(`  file: ${file}`);
    log(`  args: ${JSON.stringify(args)}`);
    log(`  cwd: ${cwd}`);
    log(`  platform: ${process.platform}`);
    log(`  backend: node-pty`);
    log(`  TERM: ${env.TERM}`);
    log(`  COLORTERM: ${env.COLORTERM || '(not set)'}`);
    log(`  FORCE_COLOR: ${env.FORCE_COLOR}`);
    if (kind === 'opencode') {
      log(`  BUN_DISABLE_KITTY_PROBE: ${env.BUN_DISABLE_KITTY_PROBE || '(not set)'}`);
      log(`  TERM_PROGRAM: ${env.TERM_PROGRAM || '(not set)'}`);
      log(`  OPENCODE_DISABLE_MOUSE: ${env.OPENCODE_DISABLE_MOUSE || '(not set)'}`);
    }
    log(`  PATH (first 200 chars): ${(env.PATH || '').substring(0, 200)}`);
    log('════════════════════════════════════════════════════════════════');

    const ptyOptions: any = {
      name: 'xterm-256color',
      cols: Math.max(1, opts.cols ?? 120),
      rows: Math.max(1, opts.rows ?? 30),
      cwd,
      env,
    };

    // LAZY-LOAD node-pty. Falls back to child_process.spawn if the native
    // module failed to load (ABI mismatch).
    const ptySpawnFn = getPtySpawn();
    let pty: PtyLike;
    let isFallback = false;

    if (ptySpawnFn) {
      // node-pty loaded successfully — use the real PTY (full features).
      pty = ptySpawnFn(file, args, ptyOptions);
      log('Using node-pty (full PTY mode).');
    } else {
      // Fall back to child_process.spawn (limited features: no tab completion,
      // no up-arrow history, no resize).
      log('node-pty unavailable — using child_process fallback mode.');
      log(`  Fallback reason: ${_ptyLoadError || 'unknown'}`);
      let fallbackFile = file;
      let fallbackArgs = typeof args === 'string' ? [args] : [...args];
      pty = new FallbackPty(fallbackFile, fallbackArgs, {
        cwd,
        env,
        cols: opts.cols,
        rows: opts.rows,
      });
      isFallback = true;
    }

    const id = randomUUID();
    const entry: PtyEntry = {
      pty,
      id,
      kind,
      cwd,
      command: opts.command ?? (kind === 'opencode' ? 'opencode run --format json --auto -' : null),
      label: opts.label || (kind === 'opencode' ? 'OpenCode' : kind === 'shell' ? 'Shell' : (opts.command || 'Terminal')),
      killed: false,
      attached: false,
      outputBuffer: [],
      isFallback,
      everEmittedData: false,
      bridgeListeners: [],
    };
    ptys.set(id, entry);

    // Register onData SYNCHRONOUSLY after spawn.
    pty.onData((data: string) => {
      // Mark that this PTY has produced output (for silent-failure detection).
      entry.everEmittedData = true;
      // Mirror output to bridge clients (port 3740) before the attach check.
      for (const bl of entry.bridgeListeners) {
        try { bl.onData(data); } catch {}
      }
      // Log the first 5 output chunks for diagnostic purposes.
      if (!entry._loggedFirstOutput) {
        entry._loggedFirstOutput = true;
        const preview = data.length > 100 ? data.slice(0, 100) + '...' : data;
        log(`PTY ${id} FIRST OUTPUT (${data.length} bytes): ${JSON.stringify(preview)}`);
      } else if ((entry._outputChunkCount = (entry._outputChunkCount ?? 0) + 1) <= 4) {
        const preview = data.length > 100 ? data.slice(0, 100) + '...' : data;
        log(`PTY ${id} output chunk #${entry._outputChunkCount + 1} (${data.length} bytes): ${JSON.stringify(preview)}`);
      }
      // Respond to CPR query (\u001b[6n) here in the main process so node-pty
      // doesn't wait forever for xterm.js to respond (which may not have
      // opened yet).
      if (data.includes('\u001b[6n')) {
        log(`PTY ${id}: CPR query detected — sending response \\u001b[1;1R`);
        try {
          entry.pty.write('\u001b[1;1R');
        } catch {}
      }
      // Buffer until attached.
      if (!entry.attached) {
        entry.outputBuffer.push(data);
        return;
      }
      sendOutputToRenderer(id, data);
    });

    // Inject fallback-mode banner when node-pty failed to load.
    if (isFallback) {
      const banner = '\r\n' +
        '\x1b[38;2;196;165;101m  ⚠  Fallback terminal mode (node-pty unavailable)\x1b[0m\r\n' +
        '\x1b[38;2;138;138;138m     Tab completion and up-arrow history are disabled.\x1b[0m\r\n' +
        '\x1b[38;2;138;138;138m     Run "npm run rebuild:native" for full PTY features.\x1b[0m\r\n\r\n';
      entry.outputBuffer.push(banner);
      // In fallback mode, add local echo (the shell doesn't echo without a TTY).
      const originalWrite = entry.pty.write.bind(entry.pty);
      entry.pty.write = (data: string) => {
        // Echo printable characters back to the renderer
        let echo = '';
        for (const ch of data) {
          if (ch === '\r' || ch === '\n') {
            echo += '\r\n';
          } else if (ch === '\b' || ch === '\x7f') {
            echo += '\b \b';
          } else if (ch >= ' ' && ch <= '~') {
            echo += ch;
          }
        }
        if (echo) {
          sendOutputToRenderer(id, echo);
        }
        // Forward the original data to the shell's stdin
        try { originalWrite(data); } catch {}
      };
    }

    // AUTO-ATTACH TIMEOUT FALLBACK — after 1s, flush buffer if renderer
    // hasn't called attach(). Makes the handshake optional.
    setTimeout(() => {
      if (!entry.attached && !entry.killed) {
        log(`PTY ${id} AUTO-ATTACH after 1s timeout — renderer did not call attach()`);
        log(`  (This is a fallback. The renderer's attach handshake failed or was not called.)`);
        log(`  Buffered output: ${entry.outputBuffer.length} chunks, ${entry.outputBuffer.join('').length} bytes`);
        attachPty(id, 'timeout');
      }
    }, 1000);

    // Inject a test command to verify the PTY is producing output.
    // Skipped for Bridge PTYs (opts.forBridge).
    if (!opts.forBridge) {
      setTimeout(() => {
        if (!entry.killed && entry.attached) {
          log(`PTY ${id}: injecting test command "echo OLYMPUS_PTY_TEST"`);
          try {
            entry.pty.write('echo OLYMPUS_PTY_TEST\r\n');
          } catch (err: any) {
            log(`PTY ${id}: test command injection failed: ${err.message}`);
          }
        }
      }, 4500);
    }

    pty.onExit(({ exitCode, signal }) => {
      log(`PTY ${id} exited (code=${exitCode} signal=${signal}) attached=${entry.attached} killed=${entry.killed}`);
      const e = ptys.get(id);
      if (e) e.killed = true;
      // Notify external IDE subscribers, then drop them on exit.
      for (const bl of entry.bridgeListeners) {
        try { bl.onExit({ exitCode, signal }); } catch {}
      }
      entry.bridgeListeners = [];
      const windows = BrowserWindow.getAllWindows();
      // Silent-failure detection. A non-zero exit with no output ever
      // produced is the silent-failure signature.
      const producedOutput = entry.everEmittedData || entry.attached;
      const silentFailure = exitCode !== 0 && !producedOutput && !e?.killed;
      for (const win of windows) {
        try {
          win.webContents.send('olympus:pty-exit', { id, exitCode, signal });
          if (silentFailure) {
            win.webContents.send('olympus:pty-spawn-failed', {
              kind,
              label: entry.label || '',
              error: 'silent-failure',
              exitCode,
            });
          }
        } catch {}
      }
    });

    log(`PTY spawned successfully (id=${id})`);
    return id;
  } catch (err: any) {
    log(`╔═══════════════════════════════════════════════════════════════╗`);
    log(`║ FAILED to spawn PTY                                           ║`);
    log(`║ kind: ${opts.kind}`);
    log(`║ error: ${err.message}`);
    log(`║ stack: ${err.stack || '(no stack)'}`);
    log(`║ platform: ${process.platform}`);
    log(`║ backend: node-pty`);
    log(`╚═══════════════════════════════════════════════════════════════╝`);
    // Surface the actual error to the renderer for diagnosis.
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      try {
        win.webContents.send('olympus:pty-spawn-failed', {
          kind: opts.kind,
          label: opts.label || '',
          error: 'spawn-exception',
          message: `${err.message || 'Unknown error'}\n\nDiagnostic details:\n` +
            `  platform: ${process.platform}\n` +
            `  kind: ${opts.kind}\n` +
            `  stack: ${err.stack ? err.stack.split('\n').slice(0, 3).join('\n') : '(none)'}\n\n` +
            `Full log at: ~/.olympus/native-terminal.log`,
        });
      } catch {}
    }
    return null;
  }
}

/**
 * ATTACH HANDSHAKE.
 *
 * Called both by the renderer (explicit) and by the 3-second auto-attach
 * timeout (fallback). Idempotent — safe to call multiple times.
 */
function attachPty(id: string, source: 'renderer' | 'timeout' = 'renderer'): void {
  const entry = ptys.get(id);
  if (!entry) {
    log(`attachPty: pty ${id} not found`);
    return;
  }
  if (entry.attached) return;
  entry.attached = true;
  const bufferedBytes = entry.outputBuffer.join('').length;
  log(`PTY ${id} attached (source=${source}) — flushing ${entry.outputBuffer.length} chunk(s), ${bufferedBytes} bytes`);
  if (entry.outputBuffer.length > 0) {
    const buffered = entry.outputBuffer.join('');
    entry.outputBuffer = [];
    sendOutputToRenderer(id, buffered);
  }
}

function writePty(id: string, data: string): void {
  const entry = ptys.get(id);
  if (!entry) {
    log(`writePty: pty ${id} not found — input DROPPED`);
    return;
  }
  // Log input for debugging (confirms renderer is sending input).
  const preview = data.length > 50 ? data.slice(0, 50) + '...' : data;
  log(`writePty: PTY ${id} received ${data.length} bytes: ${JSON.stringify(preview)}`);
  try {
    entry.pty.write(data);
  } catch (err: any) {
    log(`pty.write error: ${err.message}`);
  }
}

/**
 * Inject a command. Writes the command + newline to the PTY's stdin.
 *
 * For kind:'opencode' (which runs `opencode run --format json --auto -`),
 * each line written to stdin becomes a new prompt. So `inject(id, 'hello')`
 * sends the prompt "hello" to opencode, which streams a JSONL response.
 */
function injectPty(id: string, command: string): void {
  const entry = ptys.get(id);
  if (!entry) {
    log(`injectPty: pty ${id} not found`);
    return;
  }
  const cmd = command.endsWith('\n') ? command : command + '\n';
  writePty(id, cmd);
  log(`PTY ${id}: injected command (${command.length} chars)`);
}

function resizePty(id: string, cols: number, rows: number): void {
  const entry = ptys.get(id);
  if (!entry || entry.killed) return;
  try {
    entry.pty.resize(Math.max(1, cols), Math.max(1, rows));
  } catch (err: any) {
    log(`pty.resize error: ${err.message}`);
  }
}

function killPty(id: string): void {
  const entry = ptys.get(id);
  if (!entry) return;
  try {
    entry.pty.kill();
  } catch {}
  entry.killed = true;
  ptys.delete(id);
  log(`PTY ${id} killed`);
}

function killAllPties(): void {
  for (const id of ptys.keys()) {
    killPty(id);
  }
}

// ─── Terminal Bridge API (external IDE extensions, port 3740) ───────────────────
//
// Exposes in-app PTY sessions to external IDE extensions over a token-gated
// WebSocket. The bridge is an additional subscriber that mirrors output
// independently of the renderer's attach state.

/** Listener registered by a bridge client for live output + exit events. */
interface BridgeListener {
  onData: (data: string) => void;
  onExit: (info: { exitCode: number; signal?: number }) => void;
}

/** Snapshot of a PTY session, returned to bridge clients by `list`/`spawn`. */
export interface BridgePtyInfo {
  id: string;
  kind: TerminalKind;
  label: string;
  cwd: string;
  command: string | null;
  /** true while the underlying PTY process is alive. */
  alive: boolean;
}

/** List all live PTY sessions (for the bridge `list` message). */
export function listPtySessionsForBridge(): BridgePtyInfo[] {
  const out: BridgePtyInfo[] = [];
  for (const entry of ptys.values()) {
    out.push({
      id: entry.id,
      kind: entry.kind,
      label: entry.label,
      cwd: entry.cwd,
      command: entry.command,
      alive: !entry.killed,
    });
  }
  return out;
}

/**
 * Attach an external bridge client to a PTY. The client receives live output
 * + a one-shot exit event. Returns any output buffered before this call as
 * `bufferedHistory` (useful when a client attaches to a long-running PTY).
 */
export function attachBridgeClient(
  id: string,
  onData: (data: string) => void,
  onExit: (info: { exitCode: number; signal?: number }) => void,
): { ok: boolean; unsubscribe: () => void; bufferedHistory: string } {
  const entry = ptys.get(id);
  if (!entry) {
    return { ok: false, unsubscribe: () => {}, bufferedHistory: '' };
  }
  const listener: BridgeListener = { onData, onExit };
  entry.bridgeListeners.push(listener);
  // Snapshot the renderer-facing buffer (pre-attach output) as history. We
  // don't drain it here — the renderer may still need it. Bridge clients get
  // all FUTURE output live via the onData fan-out regardless.
  const bufferedHistory = entry.outputBuffer.join('');
  return {
    ok: true,
    unsubscribe: () => {
      const i = entry.bridgeListeners.indexOf(listener);
      if (i >= 0) entry.bridgeListeners.splice(i, 1);
    },
    bufferedHistory,
  };
}

/** Write input to a PTY on behalf of an external bridge client. */
export function writePtyFromBridge(id: string, data: string): void {
  writePty(id, data);
}

/** Resize a PTY on behalf of an external bridge client. */
export function resizePtyFromBridge(id: string, cols: number, rows: number): void {
  resizePty(id, cols, rows);
}

/**
 * Spawn a new PTY on behalf of an external bridge client.
 * The bridge only exposes `shell` + `command` kinds (not `opencode`, which is
 * a renderer-only one-shot path). Marks the PTY with `forBridge` so the
 * in-app diagnostic test-command injection is skipped for external clients.
 */
export function spawnPtyForBridge(opts: {
  kind: 'shell' | 'command';
  cwd?: string;
  command?: string;
  label?: string;
  cols?: number;
  rows?: number;
}): string | null {
  return spawnPty({
    kind: opts.kind,
    cwd: opts.cwd,
    command: opts.command,
    label: opts.label,
    cols: opts.cols,
    rows: opts.rows,
    forBridge: true,
  });
}

// ─── One-shot OpenCode Run (no PTY) ───────────────────────────────────────────
//
// Spawns a fresh `opencode run --format json --auto "<prompt>"` per user
// message via child_process.spawn (NOT node-pty — no TUI rendering needed).
// Each run gets a unique runId. The renderer can cancel via opencode-run-kill.
//

interface OpencodeRun {
  id: string;
  child: ChildProcess;
  prompt: string;
  agent: string | null;
  killed: boolean;
  startedAt: number;
}

const opencodeRuns = new Map<string, OpencodeRun>();

/**
 * Spawn a one-shot `opencode run --format json --auto "<prompt>"` process.
 *
 * Streams JSONL output to the renderer via `olympus:opencode-run-output`
 * IPC events (one per line, with the runId). Emits a final
 * `olympus:opencode-run-exit` event when the process exits.
 *
 * @returns the runId (or null if opencode binary not found).
 */
function spawnOpencodeRun(opts: {
  prompt: string;
  agent?: string | null;
  cwd?: string;
  runId?: string;
}): string | null {
  const root = findOlympusRoot();
  const opencodeBin = findOpencodeBinary(root);
  if (!opencodeBin) {
    log('ERROR: Local opencode binary not found for opencode-run.');
    log('  Run: npm run install-opencode');
    return null;
  }

  const runId = opts.runId || randomUUID();
  const prompt = opts.prompt;
  const agent = opts.agent || null;
  const cwd = (opts.cwd && existsSync(opts.cwd)) ? opts.cwd : root;

  // Build args: opencode run --format json --auto "<prompt>" [--agent <name>]
  // The prompt is passed as a POSITIONAL arg (not via stdin). This is the
  // correct one-shot invocation — opencode processes the single message,
  // streams JSONL, then exits.
  const args: string[] = ['run', '--format', 'json', '--auto'];
  if (agent) {
    args.push('--agent', agent);
  }
  args.push(prompt);

  // Build env (same as PTY env, but without TUI-specific vars).
  const env = buildEnv(root, 'opencode');
  // The opencode CLI respects NO_COLOR / FORCE_COLOR. For JSONL output,
  // disable color (ANSI escapes would break JSON parsing).
  env.NO_COLOR = '1';
  delete env.FORCE_COLOR;

  log('════════════════════════════════════════════════════════════════');
  log(`Spawning opencode-run (one-shot, id=${runId})`);
  log(`  file: ${opencodeBin}`);
  log(`  args: ${JSON.stringify(args)}`);
  log(`  cwd: ${cwd}`);
  log(`  agent: ${agent || '(default)'}`);
  log(`  prompt (first 200 chars): ${prompt.slice(0, 200)}`);
  log(`  platform: ${process.platform}`);
  log('════════════════════════════════════════════════════════════════');

  // shell:false — the binary is directly executable on Linux.
  // stdin:'ignore' — opencode detects non-TTY stdin and doesn't block.
  // stdout:'pipe'  — we parse JSONL line-by-line.
  // stderr:'pipe'  — surface as error events.
  const child = childSpawn(opencodeBin, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  const run: OpencodeRun = {
    id: runId,
    child,
    prompt,
    agent,
    killed: false,
    startedAt: Date.now(),
  };
  opencodeRuns.set(runId, run);

  // Buffer for line-based parsing (JSONL = one JSON object per line).
  let stdoutBuf = '';
  let stderrBuf = '';

  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString('utf-8');
    // Split on newlines — each complete line is one JSONL event.
    const lines = stdoutBuf.split('\n');
    // Keep the last (possibly partial) line in the buffer.
    stdoutBuf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      sendOpencodeRunOutputToRenderer(runId, trimmed);
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf-8');
    // Surface stderr as output lines too (so the renderer sees errors).
    const lines = stderrBuf.split('\n');
    stderrBuf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      sendOpencodeRunOutputToRenderer(runId, trimmed);
    }
  });

  child.on('error', (err: any) => {
    log(`opencode-run ${runId} ERROR: ${err.message}`);
    sendOpencodeRunOutputToRenderer(runId, JSON.stringify({
      type: 'error',
      error: { message: `spawn error: ${err.message}` },
      timestamp: Date.now(),
    }));
  });

  child.on('close', (code, signal) => {
    // Flush any remaining buffered output.
    if (stdoutBuf.trim()) {
      sendOpencodeRunOutputToRenderer(runId, stdoutBuf.trim());
    }
    if (stderrBuf.trim()) {
      sendOpencodeRunOutputToRenderer(runId, stderrBuf.trim());
    }
    log(`opencode-run ${runId} exited (code=${code} signal=${signal}) killed=${run.killed}`);
    sendOpencodeRunExitToRenderer(runId, {
      exitCode: code ?? -1,
      signal: signal ?? undefined,
      killed: run.killed,
    });
    opencodeRuns.delete(runId);
  });

  return runId;
}

function killOpencodeRun(runId: string): boolean {
  const run = opencodeRuns.get(runId);
  if (!run) return false;
  run.killed = true;
  try {
    run.child.kill('SIGTERM');
    // Force-kill after 2 seconds if still alive.
    setTimeout(() => {
      try { run.child.kill('SIGKILL'); } catch {}
    }, 2000);
  } catch {}
  log(`opencode-run ${runId} kill requested`);
  return true;
}

function sendOpencodeRunOutputToRenderer(runId: string, line: string): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    try {
      win.webContents.send('olympus:opencode-run-output', { runId, line });
    } catch {}
  }
}

function sendOpencodeRunExitToRenderer(runId: string, info: { exitCode: number; signal?: string; killed: boolean }): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    try {
      win.webContents.send('olympus:opencode-run-exit', { runId, ...info });
    } catch {}
  }
}

function killAllOpencodeRuns(): void {
  for (const id of opencodeRuns.keys()) {
    killOpencodeRun(id);
  }
}

// ─── IPC Registration ─────────────────────────────────────────────────────────

/**
 * Guard against double-registration of IPC handlers.
 * ipcMain.handle throws if a handler for the same channel is already registered.
 * Tracks registration in a module-level flag and removes existing handlers first.
 */
let _ipcRegistered = false;

function safeHandle(channel: string, handler: (e: any, ...args: any[]) => any): void {
  try { ipcMain.removeHandler(channel); } catch {}
  ipcMain.handle(channel, handler);
}

function safeOn(channel: string, handler: (e: any, ...args: any[]) => void): void {
  try { ipcMain.removeAllListeners(channel); } catch {}
  ipcMain.on(channel, handler);
}

export function registerNativeTerminal(): void {
  // Idempotent registration — safe to call multiple times.
  if (_ipcRegistered) {
    log('Native Terminal IPC already registered — skipping (idempotent).');
    return;
  }
  _ipcRegistered = true;

  log('╔═══════════════════════════════════════════════════════════════╗');
  log('║ Native Terminal module loaded                                 ║');
  log(`║ platform: ${process.platform}`);
  log('║ backend: node-pty                                             ║');
  log('║ opencode kind: ONE-SHOT `opencode run --format json --auto`   ║');
  log('║   (no long-lived PTY — each prompt spawns a fresh process)    ║');
  log('║ opencode renderer: opencode-chat-pane.tsx (NOT xterm.js)      ║');
  log('║ shell/command kinds: xterm.js + node-pty                      ║');
  log('╚═══════════════════════════════════════════════════════════════╝');

  safeHandle('olympus:pty-create', (_e, opts: CreatePtyOptions) => {
    return spawnPty(opts);
  });

  safeHandle('olympus:pty-attach', (_e, id: string) => {
    attachPty(id);
    return true;
  });

  safeOn('olympus:pty-input', (_e, payload: { id: string; data: string }) => {
    if (payload && typeof payload.id === 'string') {
      writePty(payload.id, payload.data);
    }
  });

  safeHandle('olympus:pty-inject', (_e, id: string, command: string) => {
    injectPty(id, command);
    return true;
  });

  safeOn('olympus:pty-resize', (_e, payload: { id: string; cols: number; rows: number }) => {
    if (payload && typeof payload.id === 'string') {
      resizePty(payload.id, payload.cols, payload.rows);
    }
  });

  safeHandle('olympus:pty-kill', (_e, id: string) => {
    killPty(id);
    return true;
  });

  // One-shot opencode run IPC channels.
  safeHandle('olympus:opencode-run', (_e, opts: { prompt: string; agent?: string | null; cwd?: string }) => {
    if (!opts || typeof opts.prompt !== 'string') {
      log('olympus:opencode-run called without prompt');
      return null;
    }
    return spawnOpencodeRun({
      prompt: opts.prompt,
      agent: opts.agent || null,
      cwd: opts.cwd,
    });
  });

  safeHandle('olympus:opencode-run-kill', (_e, runId: string) => {
    if (typeof runId !== 'string') return false;
    return killOpencodeRun(runId);
  });

  app.on('before-quit', () => {
    killAllPties();
    killAllOpencodeRuns();
  });
}

// ─── Type re-export for the preload ───────────────────────────────────────────

export type NativeTerminalAPI = {
  create: (opts: CreatePtyOptions) => Promise<string | null>;
  attach: (id: string) => Promise<boolean>;
  sendInput: (id: string, data: string) => void;
  inject: (id: string, command: string) => Promise<boolean>;
  resize: (id: string, cols: number, rows: number) => void;
  kill: (id: string) => Promise<boolean>;
  onOutput: (callback: (id: string, data: string) => void) => void;
  onExit: (callback: (id: string, info: { exitCode: number; signal?: number }) => void) => void;
  onSpawnFailed: (callback: (info: { kind: TerminalKind; label: string; error: string }) => void) => void;
  off: () => void;
};
