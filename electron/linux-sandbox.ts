/**
 * electron/linux-sandbox.ts — Linux setuid sandbox graceful fallback.
 *
 * On Linux, Electron's chrome-sandbox helper binary lives at
 *   <project>/node_modules/electron/dist/chrome-sandbox
 * and must be owned by root with mode 4755 (setuid). `npm install`
 * cannot set the setuid bit (it would require sudo), so the first
 * `npm run dev` on a fresh Linux checkout aborts with:
 *
 *   FATAL:setuid_sandbox_host.cc(163)] The SUID sandbox helper binary
 *   was found, but is not configured correctly ...
 *
 * The canonical fix is `sudo bash scripts/fix-linux-sandbox.sh`. To
 * keep `npm run dev` one-click for new users, this auto-fallback appends
 * `--no-sandbox` at startup when running in dev mode on Linux and the
 * helper is NOT properly setuid-root. The renderer then runs without
 * the Chromium setuid sandbox — acceptable for dev loading
 * localhost:3737.
 *
 * Packaged builds (electron-builder) ship the sandbox helper with the
 * correct permissions; this fallback is skipped there.
 *
 * To OPT OUT of the auto-fallback and restore the full sandbox in dev,
 * run once:  sudo bash scripts/fix-linux-sandbox.sh
 *
 * This MUST be called at the top of the main process, synchronously
 * and before app.requestSingleInstanceLock(), so the switch is in
 * place before the renderer/zygote process spawns.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { app } from 'electron';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function ensureLinuxSandboxReady(appRoot: string, isPackaged: boolean): void {
  // Only relevant on Linux + non-packaged dev launches.
  if (process.platform !== 'linux' || isPackaged) return;

  // Respect an explicit opt-out (user wants the real sandbox even in dev
  // and will accept that it aborts until they run the fix script).
  if (process.env.OLYMPUS_FORCE_LINUX_SANDBOX === '1') return;

  const sandboxPath = join(appRoot, 'node_modules', 'electron', 'dist', 'chrome-sandbox');
  if (!existsSync(sandboxPath)) return; // electron not extracted yet — defer.

  let isSetuidRoot = false;
  try {
    const st = statSync(sandboxPath);
    isSetuidRoot = st.uid === 0 && (st.mode & 0o4000) !== 0;
  } catch {
    return; // stat failed — let Electron surface its own error.
  }

  if (isSetuidRoot) {
    console.log('[olympus:electron] Linux chrome-sandbox is setuid-root — sandbox active.');
    return;
  }

  // chrome-sandbox exists but is not setuid/root → would cause the FATAL
  // abort. Disable the setuid sandbox helper so the app can launch.
  app.commandLine.appendSwitch('no-sandbox');
  console.log('[olympus:electron] chrome-sandbox not setuid-root — using --no-sandbox');
}