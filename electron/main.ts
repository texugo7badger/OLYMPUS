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

import { app, BrowserWindow, ipcMain, shell, session, dialog, clipboard, nativeImage, Tray, Menu } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, unlinkSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as nodeOs from 'node:os';
import http from 'node:http';
import { registerNativeTerminal } from './native-terminal.js';
import { resolveBootMode } from './boot-mode.js';
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

/**
 * DEV vs PRODUCTION — production is the DEFAULT (2026-10-24).
 *
 * THE SPECIMEN: the app ran `next dev` (Turbopack) for the whole UAT because
 * `isDev = !app.isPackaged`. With ~50 `dynamic(() => import(...))` panes and
 * `loading: () => null`, every first click on a dashboard triggered an
 * on-demand compile; under load the pane simply stayed BLANK with no spinner
 * ("vários dashboards não estão sendo abertos"). Production serves prebuilt
 * chunks — the same panels open in milliseconds.
 *
 * The rule now: a packaged app is always production; a SOURCE run is
 * production too WHEN a standalone build exists, and development only when
 * asked (`--dev` or OLYMPUS_DEV=1) or when no build exists (never brick the
 * app on a missing artifact — degrade to dev, loudly).
 */
const devFlag = process.argv.includes('--dev') || process.env.OLYMPUS_DEV === '1';
const prodFlag = process.argv.includes('--prod');
const sourceRoot = dirname(__dirname); // <project>/electron -> <project>
const packaged = app.isPackaged;
const standalonePath = packaged
  ? join(process.resourcesPath || '', 'next-standalone', 'server.js')
  : join(sourceRoot, '.next', 'standalone', 'server.js');
const hasStandalone = existsSync(standalonePath);

/**
 * A COMPLETE build, proven — never inferred from file existence.
 *
 * `scripts/electron-postcompile.js` (the LAST step of build:app) stamps
 * `.next/.olympus-build-complete`. If that stamp is missing, the chain never
 * finished — or a build is running RIGHT NOW — and `.next/standalone` may be
 * a partial copy. Serving it produced the 2026-10-24 "tela toda errada"
 * specimen (`olympus dev` while `olympus build` was mid-flight). A partial
 * build is worse than a slow one: it LOOKS like a different app.
 */
function buildIsComplete(): boolean {
  if (packaged) return hasStandalone;
  try {
    const stamp = JSON.parse(readFileSync(join(sourceRoot, '.next', '.olympus-build-complete'), 'utf-8'));
    if (!stamp?.completedAt) return false;
    // The stamp must describe the artifact we are about to serve.
    return hasStandalone && stamp.standalone === true;
  } catch {
    return false;
  }
}

const boot = resolveBootMode({
  packaged,
  devRequested: devFlag,
  prodRequested: prodFlag,
  hasStandalone,
  buildStamped: buildIsComplete(),
});
const isDev = boot.mode === 'development';
// Every source run says WHICH server it serves and WHY — the 2026-10-24
// specimen was undiagnosable precisely because nothing said it.
console.log(`[olympus:electron] mode: ${boot.mode.toUpperCase()} — ${boot.reason}`);
const appRoot = packaged
  ? dirname(process.execPath) // packaged: next to the executable
  : sourceRoot;

/**
 * A SOURCE run in production mode serves `.next/standalone` — which can be
 * STALER than the working tree (the classic "I changed the UI and nothing
 * moved"). We cannot afford a full source scan at boot, so we compare the
 * build id's mtime against a handful of load-bearing files and WARN LOUDLY
 * instead of silently serving old code.
 */
function standaloneStalenessWarn(): void {
  if (isDev || !hasStandalone) return;
  try {
    const buildId = join(sourceRoot, '.next', 'BUILD_ID');
    const buildAt = statSync(buildId).mtimeMs;
    const watch = [
      'src/app/page.tsx',
      'src/lib/olympus-store.ts',
      'src/components/olympus/interactive-terminal.tsx',
      'src/lib/hop-runtime/walker.ts',
    ];
    const newest = watch
      .map((f) => { try { return statSync(join(sourceRoot, f)).mtimeMs; } catch { return 0; } })
      .reduce((a, b) => Math.max(a, b), 0);
    if (newest > buildAt + 1_000) {
      safeConsole('error', '[olympus:electron] ⚠ the standalone build is OLDER than the source tree — this run serves STALE code.');
      safeConsole('error', `[olympus:electron]    build:  ${new Date(buildAt).toISOString()}`);
      safeConsole('error', `[olympus:electron]    source: ${new Date(newest).toISOString()}`);
      safeConsole('error', '[olympus:electron]    run `npm run build:app` (or `npm run dev` for hot reload).');
    } else {
      safeConsole('log', `[olympus:electron] serving the standalone build from ${new Date(buildAt).toISOString()} (production mode)`);
    }
  } catch { /* the warning is best-effort, never a boot gate */ }
}

// Linux setuid sandbox auto-fallback (see electron/linux-sandbox.ts).
// MUST run before app.requestSingleInstanceLock() below so the --no-sandbox switch
// is in place before the renderer/zygote process spawns.
ensureLinuxSandboxReady(appRoot, app.isPackaged);

// ─── Spawn Next.js ────────────────────────────────────────────────────────────

let nextProcess: ChildProcess | null = null;
let nextWasSpawnedExternally = false;

// #177: the launching terminal can die (EIO on stdout/stderr). A console
// write must NEVER take the app down — safeConsole swallows the failure and
// the crash log (a FILE write) carries the evidence.
function safeConsole(kind: 'log' | 'error', ...args: any[]): void {
  try {
    (console[kind] as (...a: any[]) => void)(...args);
  } catch { /* the parent terminal is gone — the app stays alive */ }
}

// #177: after two GPU process crashes, persist a marker and relaunch with
// hardware acceleration disabled (Electron's documented recovery path —
// disableHardwareAcceleration() only takes effect before app ready).
let gpuCrashCount = 0;

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
    // The standalone path was resolved at boot (standalonePath): packaged →
    // process.resourcesPath; source run → <project>/.next/standalone. isDev is
    // false only when that file exists, so this branch never hits a missing
    // server unless the artifact vanished between boot and spawn.
    if (!existsSync(standalonePath)) {
      console.error(`[olympus:electron] Standalone server not found at: ${standalonePath}`);
      console.error(`[olympus:electron] Run "npm run build:app" (or reinstall the packaged app).`);
      app.quit();
      process.exit(1);
    }
    // #STATIC-ASSETS (the 2026-10-24 'tela cortada' specimen): the standalone
    // server serves from .next/standalone/, which does NOT contain the
    // _next/static/ chunks (CSS, JS, fonts) — those live in .next/static/.
    // In a packaged build, electron-builder copies them via extraResources;
    // in a SOURCE run they are simply absent, so the page renders as raw
    // text on a black background with infinite spinners. Symlink them in
    // before spawn (idempotent — a stale link is replaced, a real directory
    // is left alone). The same for public/.
    if (!packaged) {
      const standaloneDir = dirname(standalonePath);
      const staticSrc = join(sourceRoot, '.next', 'static');
      const staticDst = join(standaloneDir, '.next', 'static');
      const publicSrc = join(sourceRoot, 'public');
      const publicDst = join(standaloneDir, 'public');
      try {
        mkdirSync(join(standaloneDir, '.next'), { recursive: true });
        if (!existsSync(staticDst)) {
          symlinkSync(staticSrc, staticDst, 'dir');
          console.log('[olympus:electron] linked .next/static → standalone/.next/static');
        }
      } catch (e: any) {
        // A real directory (not a link) already exists — leave it.
        if (e?.code !== 'EEXIST') console.warn('[olympus:electron] static link failed:', e?.message);
      }
      try {
        if (!existsSync(publicDst)) {
          symlinkSync(publicSrc, publicDst, 'dir');
          console.log('[olympus:electron] linked public → standalone/public');
        }
      } catch (e: any) {
        if (e?.code !== 'EEXIST') console.warn('[olympus:electron] public link failed:', e?.message);
      }
    }
    args = [standalonePath];
    cwd = dirname(standalonePath);
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
      .forEach((line: string) => safeConsole('log', `${prefix} ${line}`));
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .forEach((line: string) => safeConsole('error', `${prefix}! ${line}`));
  });
  // #177: a dead parent terminal makes the child pipes emit EIO. Without a
  // handler that is an uncaughtException (the app died three times at the
  // compiled main.js:234 pipe write). Detach and log to the crash file.
  const guardPipe = (stream: NodeJS.ReadableStream | null | undefined, label: string) => {
    if (!stream) return;
    stream.on('error', (err: any) => {
      const code = String(err?.code || '');
      if (code === 'EIO' || code === 'EPIPE') {
        try {
          stream.removeAllListeners('data');
          (stream as any).destroy?.();
        } catch { /* already detached */ }
        logError('next-pipe-detached', err, {
          stream: label,
          note: 'parent terminal gone — pipe detached, the app stays alive',
        });
        return;
      }
      logError('next-pipe-error', err, { stream: label });
    });
  };
  guardPipe(child.stdout, 'stdout');
  guardPipe(child.stderr, 'stderr');

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
let tray: Tray | null = null;
// Extend the app type to track quitting state.
declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean;
    }
  }
}

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
  // #146 AUTO-RECOVERY (the ERR_CONNECTION_REFUSED specimen, 2026-10-18):
  // a -102 at load time means the Next server is down (a cold start still
  // compiling, or the server died). The user manually closing/reopening
  // the app to babysit a cold start is a dead UX — the app now recovers
  // ITSELF: it respawns its own server when it owns it (the external-
  // server lane is now isolated from benches by the #146 port guard), then
  // probes + reloads automatically, up to 8 rounds (~2.5min) before the
  // honest error screen. The counter resets on a successful load.
  let loadFailCount = 0;
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMain) => {
    console.error(`[olympus:electron] did-fail-load: code=${errorCode} desc="${errorDescription}" url=${validatedURL} isMain=${isMain}`);
    if (!isMain) return; // Only handle main-frame failures.
    // Force-show the window so the user sees the recovery/error page.
    mainWindow?.show();

    if (errorCode === -102 && loadFailCount < 8) {
      loadFailCount++;
      const attempt = loadFailCount;
      const reconnectHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reconnecting</title>
<style>
body{margin:0;padding:40px;background:#0A0E16;color:#B8B8B8;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.6;display:flex;align-items:center;justify-content:center;height:100vh}
.box{text-align:center}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#D4A574;margin:0 3px;animation:p 1.2s infinite ease-in-out}
.dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}
@keyframes p{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
h1{color:#D4A574;font-size:14px;margin:14px 0 6px;font-weight:600;letter-spacing:.05em}
p{color:#8B8B8B;font-size:11px;margin:0}
</style></head><body><div class="box">
<div><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
<h1>RECONNECTING THE WORKSPACE</h1>
<p>attempt ${attempt} of 8 — probing the server, respawning if needed, reloading on green…</p>
</div></body></html>`;
      mainWindow?.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(reconnectHtml));
      void (async () => {
        // Respawn when we own the server and it died.
        if (nextProcess && (nextProcess.exitCode !== null || nextProcess.signalCode !== null)) {
          console.log('[olympus:electron] our Next server died — respawning…');
          try { nextProcess = spawnNext(); } catch (e) { console.error('[olympus:electron] respawn failed', e); }
        }
        // Probe with bounded patience; reload on green (a failed reload
        // re-enters this handler → the next round, until 8).
        const start = Date.now();
        while (Date.now() - start < 20_000) {
          const ok = await isNextAlreadyRunning();
          if (ok) { loadFailCount = 0; console.log('[olympus:electron] server back — reloading.'); mainWindow?.loadURL(BASE_URL); return; }
          await new Promise((r) => setTimeout(r, 2_000));
        }
        mainWindow?.loadURL(BASE_URL);
      })();
      return;
    }
    if (errorCode === -102) {
      loadFailCount = 0; // exhausted — reset for the manual Reload click.
    }
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
  // v0.0.4 (the user's directive): ONLY the app's own origin stays in-app —
  // every OTHER localhost port (the live preview's dev-server URL, the
  // ephemeral gates, anything on 127.0.0.1:<other-port>) opens in the
  // user's DEFAULT browser when clicked. The old rule lumped all 127.0.0.1
  // into in-app windows, so the live preview's "open ↗" opened an Electron
  // window instead of the browser.
  const isAppOrigin = (url: string): boolean =>
    url === BASE_URL || url.startsWith(BASE_URL + '/');
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppOrigin(url)) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppOrigin(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(BASE_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // ─── SYSTEM TRAY — minimize to background ────────────────────────────────
  // The user wants to keep OLYMPUS running while playing games etc. without
  // it consuming the taskbar. The tray icon lives in the notification area;
  // closing the window hides it instead of quitting. Double-click restores.
  if (!tray) {
    try {
      const iconPath = existsSync(join(appRoot, 'public', 'logo-32x32.png'))
        ? join(appRoot, 'public', 'logo-32x32.png')
        : join(appRoot, 'public', 'logo.png');
      const icon = nativeImage.createFromPath(iconPath);
      tray = new Tray(icon.resize({ width: 16, height: 16 }));
      tray.setToolTip('OLYMPUS — click to restore');
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Show OLYMPUS', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } else createWindow(); } },
        { label: 'Hide to tray', click: () => { if (mainWindow) mainWindow.hide(); } },
        { type: 'separator' },
        { label: 'Quit OLYMPUS', click: () => { app.isQuitting = true; app.quit(); } },
      ]);
      tray.setContextMenu(contextMenu);
      tray.on('double-click', () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else createWindow();
      });
      console.log('[olympus:electron] system tray created');
    } catch (err: any) {
      console.warn('[olympus:electron] tray creation failed:', err?.message);
    }
  }

  // Minimize to tray instead of closing.
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      // Notify the renderer that it's now in background mode (reduce polling).
      mainWindow?.webContents.send('olympus:background-mode', true);
      console.log('[olympus:electron] window hidden to tray (running in background)');
    }
  });

  // When restored from tray, notify the renderer to resume full polling.
  mainWindow.on('show', () => {
    mainWindow?.webContents.send('olympus:background-mode', false);
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
  // #177: the crash logger must not depend on console.log — the same dead
  // stdout pipe that caused the EIO would recurse here. logError writes the
  // crash FILE first; the console echo is best-effort.
  logError('uncaughtException', err);
  safeConsole('error', '[olympus:crash] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  logError('unhandledRejection', reason);
  safeConsole('error', '[olympus:crash] unhandledRejection:', reason);
});
// #177: a terminal that launched the app can close mid-run; writes to
// process.stdout/stderr then emit EIO. Swallow it — the app (and any
// server-side turn) must survive the launcher.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: any) => {
    const code = String(err?.code || '');
    if (code === 'EIO' || code === 'EPIPE') return;
    try { logError('process-stream-error', err); } catch { /* never recurse */ }
  });
}

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

// #GPU-DISABLE (2026-10-25): the AMD Radeon RX 6600 on this machine crashes
// Electron's GPU process on launch (error_code=1002, "GPU process isn't
// usable. Goodbye."). The fallback marker + TTL approach doesn't work because
// the FATAL error kills the process before the marker is read.
//
// FIX: disable GPU UNCONDITIONALLY on this machine. The user can re-enable
// with --reset-gpu (which clears the marker and tries GPU again).
//
// The marker is kept for telemetry (when was GPU last disabled) but the
// decision is now: always disable unless --reset-gpu is explicitly passed.
const GPU_FALLBACK_MARKER = join(nodeOs.homedir(), '.olympus', 'gpu-fallback');
const GPU_FALLBACK_ARG = '--olympus-disable-gpu';

// #GPU-DISABLE: disable GPU unconditionally on this machine. The AMD Radeon
// RX 6600 crashes Electron's GPU process on launch (error_code=1002).
// The user can re-enable with --reset-gpu.
if (!process.argv.includes('--reset-gpu')) {
  try {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    console.log('[olympus:electron] hardware acceleration DISABLED (GPU incompatible with this machine — run with --reset-gpu to retry)');
  } catch (err) {
    console.error('[olympus:electron] GPU disable failed:', err);
  }
} else {
  try { unlinkSync(GPU_FALLBACK_MARKER); } catch { /* already gone */ }
  console.log('[olympus:electron] --reset-gpu: GPU fallback marker cleared — trying hardware acceleration again.');
}

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
      // Production is the default: say WHICH build is being served, and warn
      // loudly when the standalone artifact predates the source tree.
      standaloneStalenessWarn();
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
      // #RENDERER-LOG (2026-10-24): capture the renderer's console so a
      // blank/frozen window is diagnosable instead of a mystery. The user's
      // 'tela congelada' specimen had zero evidence in errors.log before this.
      webContents.on('console-message', (_e, level, message, line, sourceId) => {
        if (level >= 2) {
          // 2 = warning, 3 = error — only log the loud ones to avoid noise.
          logError('renderer-console', new Error(String(message)), {
            level,
            source: sourceId || 'unknown',
            line,
          });
        }
      });
    });
    app.on('child-process-gone', (_event, details) => {
      if (details.type === 'GPU') {
        gpuCrashCount++;
        logError('gpu-process-crashed', new Error('GPU process gone'), {
          type: details.type,
          reason: details.reason,
          exitCode: details.exitCode,
          crashCount: gpuCrashCount,
        });
        // #177: two GPU crashes in a session → persist the fallback marker
        // and relaunch once with acceleration disabled. The marker makes the
        // recovery stick across launches (disableHardwareAcceleration is a
        // pre-ready switch).
        if (gpuCrashCount >= 2 && !process.argv.includes(GPU_FALLBACK_ARG)) {
          try {
            mkdirSync(dirname(GPU_FALLBACK_MARKER), { recursive: true });
            writeFileSync(GPU_FALLBACK_MARKER, new Date().toISOString(), 'utf-8');
            // `app.disableHardwareAcceleration()` is a PRE-READY switch — the
            // old call here (after ready) threw "can only be called before app
            // is ready" and left the crash loop running with acceleration
            // still on (the errors.log specimen). The marker is the real
            // mechanism: the next boot reads it BEFORE app.whenReady() and
            // disables acceleration in the only window where it takes effect.
            safeConsole('error', '[olympus:electron] GPU crashed twice — persisting the fallback marker and relaunching '
              + '(acceleration is disabled at the next boot, before ready).');
            app.relaunch({ args: process.argv.slice(1).concat(GPU_FALLBACK_ARG) });
            app.exit(0);
          } catch (err) {
            logError('gpu-fallback-relaunch', err);
          }
        }
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
        console.warn('[olympus:electron] ready-to-show did not fire within 30s — force-showing window.');
        mainWindow.show();
      }
    }, 30_000);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    // Minimized to tray: keep running in the background instead of quitting.
    if (tray) return;
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
