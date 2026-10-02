/**
 * Olympus — Electron Main Process
 *
 * Linux-only desktop application. Other platforms should use WSL.
 *
 * Responsibilities:
 *   1. Spawn the Next.js dev server (`next dev -p 3737`) as a child process.
 *      In production mode we spawn `next start -p 3737` (after `next build`).
 *   2. Poll `http://localhost:3737` until the server is ready.
 *   3. Create a BrowserWindow pointing at the Next.js URL.
 *   4. Wire up `<webview>` tag support so external HTTPS sites (GitHub, etc.)
 *      load directly — bypassing `X-Frame-Options` and `CSP: frame-ancestors`.
 *   5. Provide IPC handlers used by the preload script:
 *        - `olympus:open-external`     -> open URL in system default browser
 *        - `olympus:app-version`       -> read version from package.json
 *        - `olympus:execute-webview-js` -> execute JS in a webview by hostId
 *        - `olympus:window-minimize`   -> minimize the main window
 *        - `olympus:window-maximize-toggle` -> maximize/unmaximize
 *        - `olympus:window-close`      -> close the main window
 *        - `olympus:window-is-maximized` (sync) -> query maximized state
 *   6. Cleanly tear down the Next.js process when the app quits.
 *
 * Frameless window on Linux (frame: false). Custom window controls
 * are rendered in the StatusBar (electron-only).
 *
 * Security model:
 *   - contextIsolation: true
 *   - nodeIntegration: false
 *   - sandbox: true (renderer)
 *   - webviewTag: true (REQUIRED for embedded frames in custom-frames.tsx)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { app, BrowserWindow, ipcMain, shell, session, dialog, clipboard, nativeImage } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as nodeOs from 'node:os';
import http from 'node:http';
import { registerNativeTerminal } from './native-terminal.js';
import { registerTerminalBridge, shutdownTerminalBridge } from './terminal-bridge.js';
import { ensureLinuxSandboxReady } from './linux-sandbox.js';

// __dirname / __filename are available natively in CommonJS (electron/tsconfig.json
// compiles with module: CommonJS). No need for the import.meta.url shim.

// ─── Constants ────────────────────────────────────────────────────────────────

const PORT = 3737;
const BASE_URL = `http://localhost:${PORT}`;
const POLL_INTERVAL_MS = 400;
const POLL_TIMEOUT_MS = 60_000; // 1 minute to start (Next.js dev cold start)

// Olympus dark background — kept in sync with --color-olympus-bg
// in src/app/globals.css (#0A0E16).
const OLYMPUS_BG = '#0A0E16';
const OLYMPUS_GOLD = '#D4A574';

const isDev = !app.isPackaged;
const appRoot = isDev
  ? dirname(__dirname) // <project>/electron -> <project>
  : dirname(process.execPath); // packaged: next to the executable

// Linux setuid sandbox auto-fallback (see electron/linux-sandbox.ts).
// MUST run before app.requestSingleInstanceLock() below so the --no-sandbox switch
// is in place before the renderer/zygote process spawns.
ensureLinuxSandboxReady(appRoot, app.isPackaged);

// ─── Spawn Next.js ────────────────────────────────────────────────────────────

let nextProcess: ChildProcess | null = null;
let nextWasSpawnedExternally = false;

/**
 * Check whether a Next.js server is ALREADY listening on localhost:3737.
 */
async function isNextAlreadyRunning(): Promise<boolean> {
  const CHECK_TIMEOUT_MS = 8000; // 8 seconds max wait for external Next.js
  const start = Date.now();
  return new Promise((resolve) => {
    function attempt() {
      if (Date.now() - start > CHECK_TIMEOUT_MS) {
        resolve(false);
        return;
      }
      const req = http.get(
        `${BASE_URL}/api/olympus/health`,
        { timeout: 1000 },
        (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) {
            resolve(true);
          } else {
            setTimeout(attempt, 300);
          }
        },
      );
      req.on('error', () => setTimeout(attempt, 300));
      req.on('timeout', () => {
        req.destroy();
        setTimeout(attempt, 300);
      });
    }
    attempt();
  });
}

/**
 * Resolve the address Next.js should bind (issue #33).
 *
 * Next binds 0.0.0.0 unless told otherwise — `next dev` with no -H, and the
 * standalone server.js via `process.env.HOSTNAME || '0.0.0.0'`. That made the
 * whole app reachable from the LAN in *every* network mode, including
 * 'local', which is documented as needing no token. auth.ts could not be
 * relied on to stop it: 44 of the 60 olympus API routes carry no
 * requireAuth/requireReadAuth gate at all, and in local mode the gate is
 * intended to be a no-op.
 *
 * So bind the socket instead of trusting every route to police itself:
 *   lan      → 0.0.0.0, the mode that exists to be reachable, and which
 *             requires a bearer token anyway.
 *   local    → loopback only. The documented meaning of local mode.
 *   tunnel   → loopback, matching its documented "127.0.0.1 bind + Tailscale
 *             or SSH"; the tunnel provides reachability, the port does not.
 *
 * Unset or unreadable mode file → 'local' (the same default auth.ts applies),
 * hence loopback. OLYMPUS_BIND overrides, for developers who need to reach a
 * dev server from another host deliberately.
 */
function resolveNextBind(): string {
  const override = (process.env.OLYMPUS_BIND || '').trim();
  if (override) return override;
  let mode = '';
  try {
    mode = readFileSync(join(nodeOs.homedir(), '.olympus', 'network-mode'), 'utf-8').trim();
  } catch {}
  return mode === 'lan' ? '0.0.0.0' : '127.0.0.1';
}

/**
 * Spawn the Next.js server.
 */
function spawnNext(): ChildProcess {
  const bind = resolveNextBind();
  let args: string[];
  let cwd: string;

  if (isDev) {
    const nextCli = join(appRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
    if (!existsSync(nextCli)) {
      console.error(`[olympus:electron] Next.js CLI not found at: ${nextCli}`);
      console.error(`[olympus:electron] Run "npm install" in ${appRoot} first.`);
      app.quit();
      process.exit(1);
    }
    // `next dev` ignores the HOSTNAME env var, so the bind must be explicit
    // (issue #33). Without -H it defaults to 0.0.0.0.
    args = [nextCli, 'dev', '-p', String(PORT), '-H', bind];
    cwd = appRoot;
  } else {
    const resourcesPath = process.resourcesPath || join(appRoot, 'resources');
    const standaloneServer = join(resourcesPath, 'next-standalone', 'server.js');
    if (!existsSync(standaloneServer)) {
      console.error(`[olympus:electron] Standalone server not found at: ${standaloneServer}`);
      console.error(`[olympus:electron] The packaged app appears to be corrupted. Reinstall Olympus.`);
      app.quit();
      process.exit(1);
    }
    args = [standaloneServer];
    cwd = join(resourcesPath, 'next-standalone');
  }

  console.log(`[olympus:electron] spawning Next.js: node ${args.join(' ')}`);
  console.log(`[olympus:electron] bind: ${bind} (network mode: ${bind === '0.0.0.0' ? 'lan' : 'loopback-only'})`);
  console.log(`[olympus:electron] cwd: ${cwd}`);

  // Use the system node binary for the Next.js child process.
  // Using process.execPath (Electron binary) would run Next.js inside an
  // Electron-managed context, which requires --no-sandbox / ELECTRON_DISABLE_SANDBOX
  // workarounds that pollute process.argv or env. The actual node binary is
  // always available via PATH inherited from the terminal that launched dev.
  const child = spawn('node', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(PORT),
      // The standalone server.js reads process.env.HOSTNAME and falls back to
      // 0.0.0.0, so this is the only lever on the packaged app's bind
      // (issue #33). `next dev` needs -H instead; see spawnNext above.
      HOSTNAME: bind,
      NODE_ENV: isDev ? 'development' : 'production',
    },
  });

  const prefix = '[olympus:next]';
  child.stdout?.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .forEach((line: string) => console.log(`${prefix} ${line}`));
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .forEach((line: string) => console.error(`${prefix}! ${line}`));
  });

  child.on('exit', (code, signal) => {
    console.log(`[olympus:electron] Next.js exited (code=${code} signal=${signal})`);
    if (nextProcess === child) nextProcess = null;
  });

  return child;
}

function waitForNext(): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    // Listen for the 'Ready' message on the Next.js child process stdout.
    // This is faster than polling — Turbopack prints "✓ Ready in Xms" when
    // the dev server is accepting connections. We only use the health-poll
    // as fallback when the child process isn't available (external Next.js).
    if (nextProcess?.stdout) {
      const onReady = (chunk: Buffer) => {
        if (chunk.toString().includes('✓ Ready in')) {
          resolve();
        }
      };
      nextProcess.stdout.on('data', onReady);
      // If 10s pass without the "Ready" message, fall back to polling.
      setTimeout(() => nextProcess?.stdout?.off('data', onReady), 10_000);
    }

    function attempt() {
      const elapsed = Date.now() - start;
      if (elapsed > POLL_TIMEOUT_MS) {
        reject(new Error(`Next.js did not start within ${POLL_TIMEOUT_MS}ms`));
        return;
      }
      const req = http.get(
        `${BASE_URL}/api/olympus/health`,
        { timeout: 15_000 }, // 15s per-request — Turbopack's first compilation can take 3-10s
        (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else {
            setTimeout(attempt, POLL_INTERVAL_MS);
          }
        },
      );
      req.on('error', () => setTimeout(attempt, POLL_INTERVAL_MS));
      req.on('timeout', () => {
        req.destroy();
        setTimeout(attempt, POLL_INTERVAL_MS);
      });
    }
    attempt();
  });
}

// ─── Window ───────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function resolveIcon(): Electron.NativeImage {
  // PNG is most compatible with GTK/Wayland taskbars on Linux.
  // We prioritize PNG > ICO > favicon (SVG is skipped — nativeImage
  // does not support it).
  //
  // Using readFileSync + createFromBuffer() instead of createFromPath()
  // because createFromPath() can silently return empty images on Linux
  // depending on Electron version and display server.
  const candidates = [
    join(appRoot, 'public', 'logo.png'),
    join(appRoot, 'public', 'logo.ico'),
    join(appRoot, 'public', 'favicon.ico'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const buf = readFileSync(c);
        if (buf.length === 0) continue;
        const img = nativeImage.createFromBuffer(buf);
        if (!img.isEmpty()) {
          console.log(`[olympus:electron] loaded icon: ${c} (${buf.length} bytes)`);
          return img;
        }
      } catch (err) {
        console.warn(`[olympus:electron] failed to load icon ${c}:`, err);
      }
    }
  }
  console.warn('[olympus:electron] no icon found — using fallback');
  return nativeImage.createEmpty();
}

/**
 * On Linux/GNOME (especially Wayland), the taskbar/dock icon comes from the
 * .desktop file, not from BrowserWindow.icon. This function writes a temporary
 * .desktop entry so OLYMPUS shows its logo instead of the generic gear icon.
 *
 * The StartupWMClass key must match Electron's WM_CLASS, which is derived from
 * the first executable basename. We set --class on the command line to ensure
 * it's 'olympus' regardless of how the app was launched.
 */
function ensureLinuxDesktopEntry(): void {
  if (process.platform !== 'linux') return;
  try {
    const appsDir = join(nodeOs.homedir(), '.local', 'share', 'applications');
    mkdirSync(appsDir, { recursive: true });

    // Pick the best icon path.
    let iconPath = join(appRoot, 'public', 'logo.png');
    if (!existsSync(iconPath)) {
      iconPath = join(appRoot, 'public', 'logo.svg');
      if (!existsSync(iconPath)) iconPath = '';
    }

    // In dev mode, the 'exec' binary is the Electron binary inside
    // node_modules. In a packaged AppImage/deb, it's the installed binary.
    // We include --class=olympus so GNOME can match StartupWMClass.
    const execPath = isDev
      ? `${process.execPath} --class=olympus ${appRoot}`
      : `${process.execPath} --class=olympus %F`;

    const desktopFile = join(appsDir, 'olympus.desktop');
    const content = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=OLYMPUS',
      `Exec=${execPath}`,
      'StartupWMClass=olympus',
      `Icon=${iconPath}`,
      'Terminal=false',
      'Categories=Development;',
      'StartupNotify=true',
    ].join('\n') + '\n';

    // Only write if the file doesn't already exist, or if content changed.
    const existing = existsSync(desktopFile) ? readFileSync(desktopFile, 'utf-8') : '';
    if (existing !== content) {
      writeFileSync(desktopFile, content, 'utf-8');
      console.log(`[olympus:electron] wrote .desktop entry: ${desktopFile}`);
      console.log(`[olympus:electron] Icon path: ${iconPath}`);
      console.log(`[olympus:electron] To apply icon changes, run: update-desktop-database ~/.local/share/applications/`);
    }
  } catch (err) {
    // Non-fatal — the app still works, just with a generic taskbar icon.
    console.warn('[olympus:electron] could not write .desktop entry:', err);
  }
}

function buildWindowOptions(): Electron.BrowserWindowConstructorOptions {
  const appIcon = resolveIcon();
  const options: Electron.BrowserWindowConstructorOptions = {
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: OLYMPUS_BG,
    title: 'OLYMPUS',
    icon: appIcon.isEmpty() ? undefined : appIcon,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, 'preload.js'),
    },
  };
  return options;
}

function createWindow() {
  mainWindow = new BrowserWindow(buildWindowOptions());

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) {
      // Open DevTools automatically in dev mode for debugging.
      // mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Handle load failures explicitly — force window visible + show error page.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMain) => {
    console.error(`[olympus:electron] did-fail-load: code=${errorCode} desc="${errorDescription}" url=${validatedURL} isMain=${isMain}`);
    if (!isMain) return; // Only handle main-frame failures.
    // Force-show the window so the user sees the error page.
    mainWindow?.show();
    // Build an inline error page (data: URL) so we don't depend on Next.js.
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Olympus failed to load</title>
<style>
body{margin:0;padding:40px;background:#0A0E16;color:#B8B8B8;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.6}
h1{color:#D4A574;font-size:16px;margin:0 0 16px 0;font-weight:600;letter-spacing:0.05em}
.code{color:#C4756A;font-weight:600}
.hint{color:#8B8B8B;margin-top:24px;padding:12px;background:#0E1320;border-left:2px solid #D4A574}
button{margin-top:20px;padding:8px 16px;background:#D4A57422;color:#D4A574;border:1px solid #D4A57466;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px}
button:hover{background:#D4A57433}
</style></head><body>
<h1>OLYMPUS — Failed to load the workspace</h1>
<p>The Next.js dev server at <code>http://localhost:${PORT}</code> could not be loaded.</p>
<p>Error <span class="code">${errorCode}</span>: ${errorDescription}</p>
<p>This usually means the dev server crashed or is still compiling. Check the console output for details.</p>
<div class="hint">
<strong>Try:</strong>
<ul style="margin:8px 0 0 0;padding-left:20px">
<li>Wait 30 seconds and reload.</li>
<li>Close and reopen OLYMPUS (<code>olympus dev</code>).</li>
<li>Run <code>node scripts/olympus-doctor.js</code> to verify the installation.</li>
</ul>
</div>
<button onclick="location.reload()">Reload</button>
</body></html>`;
    mainWindow?.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });

  // Forward maximize/unmaximize events to the renderer so the StatusBar's
  // custom maximize button can toggle its icon.
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('olympus:window-maximize-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('olympus:window-maximize-changed', false);
  });

  // Open external links (target=_blank, window.open) in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BASE_URL) || url.startsWith('http://127.0.0.1:')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(BASE_URL) && !url.startsWith('http://127.0.0.1:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(BASE_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// Async handlers (invoke/handle) -------------------------------------------------

ipcMain.handle('olympus:open-external', (_e, url: string) => {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return;
  shell.openExternal(url);
});

ipcMain.handle('olympus:is-electron', () => true);

ipcMain.handle('olympus:is-dev-async', () => isDev);

ipcMain.handle('olympus:app-version-async', () => readAppVersion());

// ─── Window control handlers (frameless window) ───────────────────────────

ipcMain.on('olympus:window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('olympus:window-maximize-toggle', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});

ipcMain.on('olympus:window-close', () => {
  mainWindow?.close();
});

// Sync — needed at startup so the renderer can render the correct
// maximize/restore icon on first paint.
ipcMain.on('olympus:window-is-maximized', (e) => {
  e.returnValue = mainWindow ? mainWindow.isMaximized() : false;
});

// Sync handlers (sendSync/on + returnValue) ------------------------------------

ipcMain.on('olympus:is-dev', (e) => {
  e.returnValue = isDev;
});

ipcMain.on('olympus:app-version', (e) => {
  e.returnValue = readAppVersion();
});

// Sync OS info for the xterm.js `windowsPty` option.
// Linux is the only supported platform.
ipcMain.on('olympus:get-os-info', (e) => {
  e.returnValue = { platform: 'linux', windowsBuildNumber: 0 };
});

function readAppVersion(): string {
  try {
    const pkgPath = join(appRoot, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.0.0';
    }
  } catch {}
  return app.getVersion();
}

/**
 * Spawn the user's configured external editor (Zed, VSCode, VSCodium, Cursor,
 * etc.) on the active project path. The renderer passes the resolved binary
 * path + args; we just spawn it detached so it survives OLYMPUS quitting.
 *
 * Replaces the old /api/olympus/vscodium/launch
 * flow that spawned code-server. Now we launch the user's NATIVE editor
 * binary directly (no embedded web view), which works on Wayland, Zed, and
 * every other editor that doesn't have a `--web` mode.
 */
ipcMain.handle(
  'olympus:spawn-external-editor',
  (_e, payload: { bin: string; args: string[]; cwd?: string }) => {
    if (!payload || typeof payload.bin !== 'string') {
      return { ok: false, error: 'Missing bin path.' };
    }
    try {
      const child = spawn(payload.bin, payload.args, {
        cwd: payload.cwd || undefined,
        detached: true,
        stdio: 'ignore',
      });
      child.on('error', (err) => {
        console.error(`[olympus:electron] editor spawn error: ${err.message}`);
      });
      // unref so OLYMPUS can quit without waiting for the editor to close.
      child.unref();
      return { ok: true, pid: child.pid ?? null };
    } catch (err: any) {
      return { ok: false, error: err.message || String(err) };
    }
  },
);

/**
 * Focus the OLYMPUS BrowserWindow. Used by IDE extensions' "Open in OLYMPUS"
 * button to bring the Electron app to the foreground.
 *
 * Some Wayland compositors ignore focus() from a non-foreground app.
 */
ipcMain.handle('olympus:focus-window', () => {
  try {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    return true;
  } catch (err: any) {
    console.error(`[olympus:electron] focus-window failed: ${err.message}`);
    return false;
  }
});

/**
 * Execute JavaScript inside a <webview> identified by the URL it currently
 * displays.
 */
ipcMain.handle(
  'olympus:execute-webview-js',
  async (_e, urlHint: string, code: string) => {
    const { webContents } = require('electron');
    const all = webContents.getAllWebContents();
    for (const wc of all) {
      try {
        const u = wc.getURL();
        if (!u) continue;
        if (urlMatches(u, urlHint)) {
          return await wc.executeJavaScript(code, true);
        }
      } catch {}
    }
    return undefined;
  },
);

/**
 * Reload a <webview> by URL hint.
 */
ipcMain.handle('olympus:reload-webview', async (_e, urlHint: string) => {
  const { webContents } = require('electron');
  const all = webContents.getAllWebContents();
  for (const wc of all) {
    try {
      const u = wc.getURL();
      if (!u) continue;
      if (urlMatches(u, urlHint)) {
        wc.reload();
        return true;
      }
    } catch {}
  }
  return false;
});

function urlMatches(actual: string, hint: string): boolean {
  if (!hint) return false;
  if (actual === hint) return true;
  const normalize = (u: string) =>
    u
      .replace('://127.0.0.1:', '://localhost:')
      .replace('://localhost:', '://localhost:')
      .split('#')[0]
      .split('?')[0]
      .replace(/\/$/, '');
  return normalize(actual).startsWith(normalize(hint));
}

// ─── Crash / Error Telemetry ───────────────────────────────────────────────
//
// Catches unhandled errors + renderer crashes + native module load failures
// and logs them to ~/.olympus/errors.log. The renderer's "Report Issue"
// button reads this log (via IPC) and pre-fills a GitHub issue with the
// last 50 errors + system info.
//
// The log is append-only + capped at 10MB by vault-policy.ts pruning.

const ERROR_LOG = join(nodeOs.homedir(), '.olympus', 'errors.log');
const ERROR_LOG_MAX_BYTES = 10 * 1024 * 1024;

function logError(source: string, error: any, context?: Record<string, any>): void {
  try {
    const entry = {
      ts: new Date().toISOString(),
      source,
      message: error?.message || String(error),
      stack: error?.stack || null,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron || 'unknown',
      appVersion: readAppVersion(),
      context: context || null,
    };
    mkdirSync(dirname(ERROR_LOG), { recursive: true });
    appendFileSync(ERROR_LOG, JSON.stringify(entry) + '\n', 'utf-8');

    // Cap the log at ERROR_LOG_MAX_BYTES — tail-truncate if it exceeds.
    try {
      const stat = require('node:fs').statSync(ERROR_LOG);
      if (stat.size > ERROR_LOG_MAX_BYTES) {
        const content = readFileSync(ERROR_LOG, 'utf-8');
        const lines = content.split('\n');
        const keepLines = lines.slice(Math.floor(lines.length / 2));
        writeFileSync(ERROR_LOG, keepLines.join('\n'), 'utf-8');
      }
    } catch {}
  } catch (err) {
    // Logging the logger's failure would be recursive — just console.error.
    console.error('[olympus:crash] failed to log error:', err);
  }
}

// Install global error handlers.
process.on('uncaughtException', (err) => {
  logError('uncaughtException', err);
  console.error('[olympus:crash] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  logError('unhandledRejection', reason);
  console.error('[olympus:crash] unhandledRejection:', reason);
});

// IPC: read the error log (for the "Report Issue" button in the renderer).
ipcMain.handle('olympus:read-error-log', (_e, maxLines: number = 50) => {
  try {
    if (!existsSync(ERROR_LOG)) return { ok: true, entries: [] };
    const raw = readFileSync(ERROR_LOG, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    const tail = lines.slice(-(maxLines || 50));
    const entries = tail.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    return { ok: true, entries, totalLines: lines.length };
  } catch (err: any) {
    return { ok: false, error: err.message, entries: [] };
  }
});

// IPC: clear the error log (after the user reports an issue).
ipcMain.handle('olympus:clear-error-log', () => {
  try {
    if (existsSync(ERROR_LOG)) writeFileSync(ERROR_LOG, '', 'utf-8');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
});

// IPC: build a GitHub issue URL pre-filled with system info + recent errors.
ipcMain.handle('olympus:build-issue-url', (_e, userDescription: string) => {
  const repo = 'https://github.com/texugo7badger/olympus';
  const title = `[v${readAppVersion()}] ${userDescription.slice(0, 80) || 'Bug report'}`;
  const sysInfo = [
    `**OLYMPUS version:** ${readAppVersion()}`,
    `**Platform:** ${process.platform} ${nodeOs.release()} (${process.arch})`,
    `**Node.js:** ${process.version}`,
    `**Electron:** ${process.versions.electron || 'unknown'}`,
    `**Date:** ${new Date().toISOString()}`,
    '',
    `**User description:**`,
    userDescription || '(no description provided)',
    '',
    '**Recent errors (last 10 from ~/.olympus/errors.log):**',
    '```',
  ];
  try {
    if (existsSync(ERROR_LOG)) {
      const raw = readFileSync(ERROR_LOG, 'utf-8');
      const lines = raw.split('\n').filter(Boolean);
      const tail = lines.slice(-10);
      for (const line of tail) {
        try {
          const e = JSON.parse(line);
          sysInfo.push(`[${e.ts}] ${e.source}: ${e.message}`);
          if (e.stack) sysInfo.push(`  ${e.stack.split('\n').slice(0, 3).join('\n  ')}`);
        } catch {
          sysInfo.push(line);
        }
      }
    }
  } catch {}
  sysInfo.push('```');
  const body = sysInfo.join('\n');
  // Copy to clipboard so the user can paste it into the GitHub issue
  // (the URL would be too long for a query parameter).
  try { clipboard.writeText(body); } catch {}
  return { ok: true, url: `${repo}/issues/new?title=${encodeURIComponent(title)}`, clipboardCopied: true };
});

// ─── Auto-Update ──────────────────────────────────────────────────────────
//
// Uses electron-updater to check GitHub Releases for new versions. The check
// runs 30 seconds after app launch (not immediately — don't slow down startup)
// + on the `olympus:check-for-updates` IPC (triggered from Settings →
// "Check for updates" button).
//
// Auto-downloading is DISABLED by default — the user gets a notification
// with a "Download + Install" button. This is safer than auto-downloading
// because the user might be in the middle of a task.
//


let autoUpdater: any = null;
let updateInfo: any = null;

function initAutoUpdater(): void {
  // electron-updater is a devDependency — require it lazily so the dev
  // build (npm run dev) doesn't crash if it's not installed.
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (err: any) {
    console.log('[olympus:auto-update] electron-updater not available (dev mode or not installed) — skipping.');
    logError('auto-update-init', err, { note: 'electron-updater not installed — this is expected in dev mode' });
    return;
  }

  // Configure: don't auto-download, do auto-install on quit.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info: any) => {
    updateInfo = info;
    console.log(`[olympus:auto-update] Update available: v${info.version}`);
    // Notify the renderer — it shows a toast with a "Download + Install" button.
    mainWindow?.webContents.send('olympus:update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', (info: any) => {
    console.log('[olympus:auto-update] No update available.');
    mainWindow?.webContents.send('olympus:update-not-available', { currentVersion: readAppVersion() });
  });

  autoUpdater.on('download-progress', (progress: any) => {
    mainWindow?.webContents.send('olympus:update-download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info: any) => {
    console.log(`[olympus:auto-update] Update downloaded: v${info.version}`);
    mainWindow?.webContents.send('olympus:update-downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err: Error) => {
    console.error('[olympus:auto-update] Error:', err.message);
    logError('auto-update', err);
    mainWindow?.webContents.send('olympus:update-error', { message: err.message });
  });
}

function checkForUpdates(): void {
  if (!autoUpdater) {
    // Try to initialize if it wasn't available at startup (e.g. the user
    // installed electron-updater after launching).
    initAutoUpdater();
  }
  if (!autoUpdater) {
    mainWindow?.webContents.send('olympus:update-error', {
      message: 'electron-updater is not installed. Run `npm install --include=dev electron-updater`.',
    });
    return;
  }
  // Only check in packaged builds — dev builds don't have a valid app-update.yml.
  if (!app.isPackaged) {
    mainWindow?.webContents.send('olympus:update-not-available', {
      currentVersion: readAppVersion(),
      note: 'Dev build — auto-update is disabled. Build a packaged installer with `npm run build` to enable.',
    });
    return;
  }
  try {
    autoUpdater.checkForUpdates();
  } catch (err: any) {
    logError('auto-update-check', err);
  }
}

// IPC: manually check for updates (Settings → "Check for updates" button).
ipcMain.handle('olympus:check-for-updates', () => {
  checkForUpdates();
  return { ok: true };
});

// IPC: download the available update (after the user clicks "Download + Install").
ipcMain.handle('olympus:download-update', () => {
  if (!autoUpdater || !updateInfo) {
    return { ok: false, error: 'No update available. Call check-for-updates first.' };
  }
  try {
    autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err: any) {
    logError('auto-update-download', err);
    return { ok: false, error: err.message };
  }
});

// IPC: quit and install the downloaded update.
ipcMain.handle('olympus:quit-and-install', () => {
  if (!autoUpdater) return { ok: false, error: 'No update downloaded.' };
  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (err: any) {
    logError('auto-update-install', err);
    return { ok: false, error: err.message };
  }
});

// IPC: get the current app version (for the Settings → About section).
ipcMain.handle('olympus:get-version-info', () => {
  return {
    version: readAppVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron || 'unknown',
    node: process.version,
  };
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

// Set the app name explicitly so Electron uses 'olympus' for its data
// directories and WM_CLASS on Linux (matching StartupWMClass in the
// .desktop entry). Must be called before app.whenReady().
app.setName('OLYMPUS');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Register the native terminal (node-pty + xterm.js) IPC handlers.
    // Now supports multiple PTY sessions (Map<ptyId, IPty>).
    registerNativeTerminal();

    // Register the Terminal Bridge WebSocket server (port 3740).
    // Exposes the in-app PTY sessions to external IDE extensions
    // (VSCode, VSCodium, Cursor, Zed) so the user can attach to the
    // same live terminal from inside their editor. Token-gated — only
    // local clients holding ~/.olympus/terminal-bridge-token can connect.
    registerTerminalBridge();

    // Session defaults — allow webviews to load any origin.
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      const resHeaders = { ...details.responseHeaders };
      for (const k of Object.keys(resHeaders)) {
        const lk = k.toLowerCase();
        if (lk === 'x-frame-options') delete resHeaders[k];
        if (lk === 'content-security-policy') {
          const csp = (resHeaders[k] as string | string[]) || '';
          const arr = Array.isArray(csp) ? csp : [csp];
          resHeaders[k] = arr
            .map((s) =>
              s
                .split(';')
                .filter((d) => !d.trim().toLowerCase().startsWith('frame-ancestors'))
                .join(';'),
            )
            .filter(Boolean);
        }
      }
      cb({ responseHeaders: resHeaders });
    });

    console.log('[olympus:electron] checking for existing Next.js server...');
    const alreadyRunning = await isNextAlreadyRunning();
    if (alreadyRunning) {
      console.log('[olympus:electron] Next.js already running externally — skipping spawn.');
      nextWasSpawnedExternally = true;
    } else {
      console.log('[olympus:electron] no external Next.js detected — spawning our own...');
      nextProcess = spawnNext();
    }

    try {
      console.log(`[olympus:electron] waiting for ${BASE_URL}...`);
      await waitForNext();
      console.log('[olympus:electron] Next.js is ready. Creating window.');
    } catch (err: any) {
      console.error(`[olympus:electron] ${err.message}`);
      const { dialog } = require('electron');
      dialog.showErrorBox(
        'Olympus failed to start',
        `The Next.js dev server did not become ready at ${BASE_URL}.\n\n` +
          `Error: ${err.message}\n\n` +
          `Check the console output for details.`,
      );
      app.quit();
      return;
    }

    // Register a Linux .desktop entry so the taskbar shows the OLYMPUS
    // logo instead of the generic gear icon (Ubuntu/GNOME Wayland).
    ensureLinuxDesktopEntry();

    createWindow();

    // Initialize electron-updater + check for
    // updates 30s after launch (don't slow down startup). Only runs in
    // packaged builds — dev builds skip the check.
    initAutoUpdater();
    setTimeout(() => {
      if (app.isPackaged) {
        console.log('[olympus:auto-update] checking for updates (30s after launch)...');
        checkForUpdates();
      }
    }, 30_000);

    // Log renderer crashes + GPU crashes.
    // Electron 35 removed the deprecated `renderer-process-crashed` and
    // `gpu-process-crashed` app events. Their modern successors are:
    //   - GPU crashes      → app.on('child-process-gone', ...) with details.type === 'GPU'
    //   - renderer crashes → webContents.on('render-process-gone', ...) on each web contents
    //     (caught globally via 'web-contents-created' so we don't need to modify createWindow).
    app.on('web-contents-created', (_event, webContents) => {
      webContents.on('render-process-gone', (_e, details) => {
        logError('renderer-process-crashed', new Error('Renderer process gone'), {
          reason: details.reason,
          exitCode: details.exitCode,
          url: webContents?.getURL?.() || 'unknown',
        });
      });
    });
    app.on('child-process-gone', (_event, details) => {
      if (details.type === 'GPU') {
        logError('gpu-process-crashed', new Error('GPU process gone'), {
          type: details.type,
          reason: details.reason,
          exitCode: details.exitCode,
        });
      }
    });

    // Spawn the incremental skill index watcher.
    // Watches .opencode/skills/**/*.md for changes and upserts single skill
    // vectors into skill-vec.db (no full rebuild). Detached so it survives
    // OLYMPUS quitting — the watcher will exit on its own when the parent
    // process dies (via SIGTERM handler).
    try {
      const watcherScript = join(appRoot, 'scripts', 'incremental-skill-index.js');
      if (existsSync(watcherScript)) {
        const watcher = spawn(process.execPath, [watcherScript], {
          cwd: appRoot,
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, OLYMPUS_ROOT: appRoot },
        });
        watcher.unref();
        console.log(`[olympus:electron] incremental skill index watcher spawned (pid=${watcher.pid})`);
      }
    } catch (err: any) {
      console.error(`[olympus:electron] failed to spawn skill index watcher: ${err.message}`);
    }

    // Safety net: if ready-to-show never fires within 15s, force-show the window.
    setTimeout(() => {
      if (mainWindow && !mainWindow.isVisible()) {
        console.warn('[olympus:electron] ready-to-show did not fire within 15s — force-showing window.');
        mainWindow.show();
      }
    }, 15_000);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', (event) => {
    // Tear down the Terminal Bridge WebSocket server + any clients.
    try { shutdownTerminalBridge(); } catch {}

    if (nextWasSpawnedExternally) {
      return;
    }
    if (nextProcess) {
      event.preventDefault();
      console.log('[olympus:electron] killing Next.js process...');
      const proc = nextProcess;
      nextProcess = null;
      try {
        proc.kill('SIGTERM');
      } catch {}
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        app.exit(0);
      }, 2000);
      proc.on('exit', () => app.exit(0));
    }
  });

  process.on('SIGINT', () => app.quit());
  process.on('SIGTERM', () => app.quit());
}
