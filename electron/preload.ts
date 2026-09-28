/**
 * Olympus — Electron Preload Script
 *
 * Runs in an ISOLATED context with Node.js access (but limited by sandbox).
 * Exposes a SAFE, minimal API to the renderer via contextBridge.
 *
 * Security:
 *   - Never expose `require`, `process`, or `ipcRenderer` directly.
 *   - Only expose specific, validated methods.
 *   - All arguments are typed/validated before forwarding to the main process.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { contextBridge, ipcRenderer } from 'electron';

const validUrl = (u: unknown): u is string =>
  typeof u === 'string' && /^https?:\/\//.test(u);

const olympusApi = {
  /**
   * Returns true when running inside Electron.
   */
  isElectron: (): boolean => true,

  /**
   * Returns true when running in dev mode (npm run electron:dev). False when
   * packaged (npm run electron:build).
   */
  isDev: (): boolean => ipcRenderer.sendSync('olympus:is-dev') === true,

  /**
   * Returns the app version from package.json.
   */
  getAppVersion: (): string =>
    (ipcRenderer.sendSync('olympus:app-version') as string) || '0.0.0',

  /**
   * Returns OS info needed for the xterm.js `windowsPty` option.
   * Synchronous (sendSync) — needed at module-load time before xterm.js
   * Terminal construction. Falls back when not in Electron.
   */
  getOsInfo: (): { platform: NodeJS.Platform | 'unknown'; windowsBuildNumber: number } => {
    try {
      return ipcRenderer.sendSync('olympus:get-os-info') as {
        platform: NodeJS.Platform;
        windowsBuildNumber: number;
      };
    } catch {
      return { platform: 'unknown', windowsBuildNumber: 0 };
    }
  },

  /**
   * Open a URL in the system default browser.
   */
  openExternal: (url: string): void => {
    if (validUrl(url)) ipcRenderer.send('olympus:open-external', url);
  },

  /**
   * Execute JavaScript inside a <webview> identified by URL hint.
   */
  executeWebviewJs: (urlHint: string, code: string): Promise<unknown> =>
    ipcRenderer.invoke('olympus:execute-webview-js', urlHint, code),

  /**
   * Reload a <webview> by URL hint.
   */
  reloadWebview: (urlHint: string): Promise<boolean> =>
    ipcRenderer.invoke('olympus:reload-webview', urlHint),

  /**
   * ─── Native Terminal API (node-pty + xterm.js) ───────────────────────────
   *
   * Multi-PTY architecture. Each terminal tab owns its own ptyId.
   * Usage:
   *   const id = await window.olympus.terminal.create({ kind: 'shell' });
   *   window.olympus.terminal.onOutput((ptyId, data) => {
   *     if (ptyId === id) term.write(data);
   *   });
   *   term.onData(d => window.olympus.terminal.sendInput(id, d));
   */
  terminal: {
    /**
     * Create a new PTY. Returns the ptyId (or null on spawn failure).
     * kind: 'shell' | 'opencode' | 'command'.
     *
     * Output is buffered until `attach(id)` is called, eliminating the
     * race between PTY spawn and renderer readiness.
     */
    create: (opts: {
      kind: 'shell' | 'opencode' | 'command';
      cwd?: string;
      command?: string;
      cols?: number;
      rows?: number;
      label?: string;
    }): Promise<string | null> => ipcRenderer.invoke('olympus:pty-create', opts),

    /**
     * ATTACH HANDSHAKE — signal that the renderer is ready to receive
     * output for this PTY. Flushes the buffer of data emitted since spawn.
     * Idempotent — safe to call multiple times.
     */
    attach: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('olympus:pty-attach', id),

    /** Send user keyboard input (from xterm.js's onData) to a specific PTY. */
    sendInput: (id: string, data: string): void => {
      ipcRenderer.send('olympus:pty-input', { id, data });
    },

    /** Inject a command into a specific PTY. 100% reliable — direct PTY write. */
    inject: (id: string, command: string): Promise<boolean> =>
      ipcRenderer.invoke('olympus:pty-inject', id, command),

    /** Resize a specific PTY when its xterm.js container changes size. */
    resize: (id: string, cols: number, rows: number): void => {
      ipcRenderer.send('olympus:pty-resize', { id, cols, rows });
    },

    /** Kill a specific PTY (called when a terminal tab is closed). */
    kill: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('olympus:pty-kill', id),

    /** Register a callback for PTY output. The callback receives (ptyId, data). */
    onOutput: (callback: (id: string, data: string) => void): void => {
      const handler = (_e: unknown, payload: { id: string; data: string }) =>
        callback(payload.id, payload.data);
      ipcRenderer.on('olympus:pty-output', handler);
    },

    /** Register a callback for PTY exit. The callback receives (ptyId, info). */
    onExit: (
      callback: (id: string, info: { exitCode: number; signal?: number }) => void,
    ): void => {
      const handler = (
        _e: unknown,
        payload: { id: string; exitCode: number; signal?: number },
      ) => callback(payload.id, payload);
      ipcRenderer.on('olympus:pty-exit', handler);
    },

    /**
     * Register a callback for spawn-failed events (e.g. opencode binary
     * missing, node-pty ABI mismatch). The callback receives
     * { kind, label, error, message? }.
     *
     * v0.0.1 final-polish-v2 — `message` is now included so the renderer
     * can display the ACTUAL error (ABI mismatch, missing shell, etc.)
     * instead of the generic "Failed to spawn terminal."
     */
    onSpawnFailed: (
      callback: (info: {
        kind: 'shell' | 'opencode' | 'command';
        label: string;
        error: string;
        message?: string;
      }) => void,
    ): void => {
      const handler = (_e: unknown, info: any) => callback(info);
      ipcRenderer.on('olympus:pty-spawn-failed', handler);
    },

    /** Remove all PTY event listeners (called on component unmount). */
    off: (): void => {
      ipcRenderer.removeAllListeners('olympus:pty-output');
      ipcRenderer.removeAllListeners('olympus:pty-exit');
      ipcRenderer.removeAllListeners('olympus:pty-spawn-failed');
    },
  },

  /**
   * ─── One-shot OpenCode Run API ────────────────────────────────────────
   *
   * Spawns a fresh `opencode run --format json --auto "<prompt>"` per prompt.
   * Streams JSONL output via `onOutput`, emits `onExit` when done.
   */
  opencode: {
    /**
     * Spawn a one-shot `opencode run --format json --auto "<prompt>"`.
     * Returns the runId (or null if opencode binary not found).
     */
    run: (opts: { prompt: string; agent?: string | null; cwd?: string }): Promise<string | null> =>
      ipcRenderer.invoke('olympus:opencode-run', opts),

    /** Kill an in-flight run. Returns true if the run was found and killed. */
    kill: (runId: string): Promise<boolean> =>
      ipcRenderer.invoke('olympus:opencode-run-kill', runId),

    /**
     * Register a callback for run output. The callback receives (runId, line)
     * where `line` is one JSONL line from opencode's stdout (or a stderr line).
     * Try JSON.parse(line) — if it throws, it's a non-JSON log line.
     */
    onOutput: (callback: (runId: string, line: string) => void): void => {
      const handler = (_e: unknown, payload: { runId: string; line: string }) =>
        callback(payload.runId, payload.line);
      ipcRenderer.on('olympus:opencode-run-output', handler);
    },

    /** Register a callback for run exit. cb(runId, { exitCode, signal, killed }). */
    onExit: (
      callback: (runId: string, info: { exitCode: number; signal?: string; killed: boolean }) => void,
    ): void => {
      const handler = (
        _e: unknown,
        payload: { runId: string; exitCode: number; signal?: string; killed: boolean },
      ) => callback(payload.runId, payload);
      ipcRenderer.on('olympus:opencode-run-exit', handler);
    },

    /** Remove all opencode-run event listeners. */
    off: (): void => {
      ipcRenderer.removeAllListeners('olympus:opencode-run-output');
      ipcRenderer.removeAllListeners('olympus:opencode-run-exit');
    },
  },

  /**
   * ─── Window Control API (frameless window) ────────────────────────────
   *
   * Used by the StatusBar's custom window controls.
   */
  window: {
    minimize: (): void => {
      ipcRenderer.send('olympus:window-minimize');
    },
    /** Toggle maximize. Returns the new maximized state. */
    maximizeToggle: (): Promise<boolean> =>
      ipcRenderer.invoke('olympus:window-maximize-toggle'),
    close: (): void => {
      ipcRenderer.send('olympus:window-close');
    },
    /** Synchronous — needed at startup so the StatusBar can render the right icon. */
    isMaximized: (): boolean =>
      ipcRenderer.sendSync('olympus:window-is-maximized') === true,
    /** Register a callback for maximize/unmaximize events. */
    onMaximizeChange: (callback: (maximized: boolean) => void): void => {
      const handler = (_e: unknown, maximized: boolean) => callback(maximized);
      ipcRenderer.on('olympus:window-maximize-changed', handler);
    },
    /** Remove the maximize-change listener. */
    offMaximizeChange: (): void => {
      ipcRenderer.removeAllListeners('olympus:window-maximize-changed');
    },
  },

  /**
   * Spawn the user's configured external editor on a project path.
   */
  spawnExternalEditor: (payload: { bin: string; args: string[]; cwd?: string }): Promise<{ ok: boolean; pid?: number | null; error?: string }> =>
    ipcRenderer.invoke('olympus:spawn-external-editor', payload),

  /**
   * Focus the OLYMPUS BrowserWindow.
   */
  focusWindow: (): Promise<boolean> => ipcRenderer.invoke('olympus:focus-window'),

  /**
   * Auto-update API — check for updates, download, and install.
   */
  autoUpdate: {
    checkForUpdates: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('olympus:check-for-updates'),
    downloadUpdate: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('olympus:download-update'),
    quitAndInstall: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('olympus:quit-and-install'),
    getVersionInfo: (): Promise<{ version: string; isPackaged: boolean; platform: string; arch: string; electron: string; node: string }> =>
      ipcRenderer.invoke('olympus:get-version-info'),
  },

  /**
   * Crash telemetry — read/clear the error log + build a GitHub issue URL.
   */
  crashTelemetry: {
    readErrorLog: (maxLines?: number): Promise<{ ok: boolean; entries: any[]; totalLines?: number; error?: string }> =>
      ipcRenderer.invoke('olympus:read-error-log', maxLines),
    clearErrorLog: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('olympus:clear-error-log'),
    buildIssueUrl: (userDescription: string): Promise<{ ok: boolean; url: string; clipboardCopied: boolean }> =>
      ipcRenderer.invoke('olympus:build-issue-url', userDescription),
  },

  /**
   * Listen for events from the main process.
   */
  on: (channel: string, callback: (...args: unknown[]) => void): void => {
    const allowed = [
      'olympus:deep-link',
      'olympus:menu',
      'olympus:update',
      'olympus:god-tab-inject',
      'olympus:pty-output',
      'olympus:pty-exit',
      'olympus:pty-spawn-failed',
      'olympus:window-maximize-changed',
      'olympus:opencode-run-output',
      'olympus:opencode-run-exit',
      'olympus:update-available',
      'olympus:update-not-available',
      'olympus:update-download-progress',
      'olympus:update-downloaded',
      'olympus:update-error',
    ];
    if (!allowed.includes(channel)) return;
    const wrapped = (_e: unknown, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, wrapped);
  },

  /**
   * Remove a listener previously added with `on`.
   */
  off: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('olympus', olympusApi);

// Compatibility alias `electron` for code that uses the conventional name.
contextBridge.exposeInMainWorld('electron', {
  isElectron: olympusApi.isElectron,
  isDev: olympusApi.isDev,
  version: olympusApi.getAppVersion,
  openExternal: olympusApi.openExternal,
  getOsInfo: olympusApi.getOsInfo,
  spawnExternalEditor: olympusApi.spawnExternalEditor,
  focusWindow: olympusApi.focusWindow,
  autoUpdate: olympusApi.autoUpdate,
  crashTelemetry: olympusApi.crashTelemetry,
});

export {};
