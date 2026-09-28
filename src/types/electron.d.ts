/**
 * Type declarations for `window.olympus` — the Electron preload bridge.
 * Set by electron/preload.ts. Undefined in regular browser contexts.
 */

export {};

declare global {
  interface Window {
    /** Present only when running inside the Electron wrapper. */
    olympus?: {
      isElectron: () => boolean;
      isDev: () => boolean;
      getAppVersion: () => string;
      openExternal: (url: string) => void;
      executeWebviewJs: (urlHint: string, code: string) => Promise<unknown>;
      reloadWebview: (urlHint: string) => Promise<boolean>;

      /** Returns OS info for xterm.js windowsPty option. Synchronous. */
      getOsInfo: () => {
        platform: NodeJS.Platform | 'unknown';
        windowsBuildNumber: number;
      };

      /** Multi-PTY native terminal API (node-pty + xterm.js). */
      terminal: {
        /** Create a new PTY. Returns ptyId (or null on failure). */
        create: (opts: {
          kind: 'shell' | 'opencode' | 'command';
          cwd?: string;
          command?: string;
          cols?: number;
          rows?: number;
          label?: string;
        }) => Promise<string | null>;
        /** Attach a PTY — flushes buffered output to the renderer. Idempotent. */
        attach: (id: string) => Promise<boolean>;
        /** Send user keyboard input to a specific PTY. */
        sendInput: (id: string, data: string) => void;
        /** Inject a command into a specific PTY. */
        inject: (id: string, command: string) => Promise<boolean>;
        /** Resize a specific PTY. */
        resize: (id: string, cols: number, rows: number) => void;
        /** Kill a specific PTY. */
        kill: (id: string) => Promise<boolean>;
        /** Register a callback for PTY output. cb(ptyId, data). */
        onOutput: (callback: (id: string, data: string) => void) => void;
        /** Register a callback for PTY exit. cb(ptyId, info). */
        onExit: (
          callback: (id: string, info: { exitCode: number; signal?: number }) => void,
        ) => void;
        /** Register a callback for spawn-failed events. */
        onSpawnFailed: (
          callback: (info: {
            kind: 'shell' | 'opencode' | 'command';
            label: string;
            error: string;
            message?: string;
            exitCode?: number;
          }) => void,
        ) => void;
        /** Remove all PTY event listeners. */
        off: () => void;
      };

      /** Window control API for frameless window. */
      window: {
        minimize: () => void;
        maximizeToggle: () => Promise<boolean>;
        close: () => void;
        isMaximized: () => boolean;
        onMaximizeChange: (callback: (maximized: boolean) => void) => void;
        offMaximizeChange: () => void;
      };

      on: (channel: string, callback: (...args: unknown[]) => void) => void;
      off: (channel: string) => void;

      /** Spawn the user's configured external editor on a project path. */
      spawnExternalEditor: (payload: {
        bin: string;
        args: string[];
        cwd?: string;
      }) => Promise<{ ok: boolean; pid?: number | null; error?: string }>;

      /** Focus the OLYMPUS BrowserWindow (used by IDE extensions). */
      focusWindow: () => Promise<boolean>;

      /** Check for updates, download, install via electron-updater. */
      autoUpdate: {
        checkForUpdates: () => Promise<{ ok: boolean }>;
        downloadUpdate: () => Promise<{ ok: boolean; error?: string }>;
        quitAndInstall: () => Promise<{ ok: boolean; error?: string }>;
        getVersionInfo: () => Promise<{
          version: string;
          isPackaged: boolean;
          platform: string;
          arch: string;
          electron: string;
          node: string;
        }>;
      };

      /** Read/clear error log + build GitHub issue URL. */
      crashTelemetry: {
        readErrorLog: (maxLines?: number) => Promise<{
          ok: boolean;
          entries: any[];
          totalLines?: number;
          error?: string;
        }>;
        clearErrorLog: () => Promise<{ ok: boolean; error?: string }>;
        buildIssueUrl: (userDescription: string) => Promise<{
          ok: boolean;
          url: string;
          clipboardCopied: boolean;
        }>;
      };
    };
    /** Compatibility alias for `window.olympus`. */
    electron?: {
      isElectron: () => boolean;
      isDev: () => boolean;
      version: () => string;
      openExternal: (url: string) => void;
      spawnExternalEditor?: Window['olympus'] extends infer O
        ? O extends { spawnExternalEditor: infer F } ? F : never
        : never;
      focusWindow?: Window['olympus'] extends infer O
        ? O extends { focusWindow: infer F } ? F : never
        : never;
    };
  }
}
