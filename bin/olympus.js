#!/usr/bin/env node
/**
 * OLYMPUS CLI — the single entry point for `npm install -g olympus`,
 * `npx olympus`, and `bunx olympus`.
 *
 * OLYMPUS is a standalone Electron desktop application. The CLI spawns the
 * Electron main process, which in turn spawns the Next.js dev server on
 * localhost:3737 and opens a native BrowserWindow. There is no browser-mode
 * fallback — if you want to inspect the Next.js server directly you can
 * still visit http://localhost:3737 in any browser while OLYMPUS is running.
 *
 * Subcommands:
 *   olympus install           Run the interactive installer (scripts/install/)
 *   olympus init              Alias for `install` (backward compat)
 *   olympus doctor            Run the installation health check (68 checks)
 *   olympus dev               Launch the OLYMPUS Electron desktop window
 *                             (spawns Next.js internally; no separate
 *                             server start required)
 *   olympus start             Alias for `dev` (launches the packaged app
 *                             or runs Electron against the current source)
 *   olympus build             Build a standalone desktop installer
 *                             (.AppImage via electron-builder)
 *   olympus apply-strategy <id>   Switch LLM strategy
 *   olympus refresh-models      Re-fetch live free model lists (Free strategies)
 *   olympus seed-vault        Re-seed the vault (idempotent)
 *   olympus terminal          Connect to the running OLYMPUS Terminal Bridge
 *                             (port 3740) and stream a live PTY in the current
 *                             shell. Works in Zed's built-in terminal, tmux,
 *                             SSH sessions, etc. Requires OLYMPUS to be running.
 *                             Flags: --list, --status, --attach <id>,
 *                                    --spawn, --cwd <path>
 *   olympus uninstall         Run the vault-safe uninstaller (scripts/install/)
 *   olympus --version         Print version
 *   olympus --help            Show this help
 *
 * License: AGPL-3.0-or-later
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Colors (truecolor, falls back gracefully on no-color terminals) ─────────
const supportsColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = {
  reset:   supportsColor ? '\x1b[0m'  : '',
  bold:    supportsColor ? '\x1b[1m'  : '',
  dim:     supportsColor ? '\x1b[2m'  : '',
  gold:    supportsColor ? '\x1b[38;2;212;165;116m' : '',  // #D4A574
  goldDim: supportsColor ? '\x1b[38;2;212;165;116;2m' : '',
  green:   supportsColor ? '\x1b[38;2;123;174;142m' : '',  // #7BAE8E
  cyan:    supportsColor ? '\x1b[38;2;107;174;181m' : '',  // #6BAEB5
  gray:    supportsColor ? '\x1b[38;2;139;139;139m' : '',  // #8B8B8B
  red:     supportsColor ? '\x1b[38;2;196;117;106m' : '',  // #C4756A
};

// ─── Find Olympus source root ────────────────────────────────────────────────
function findOlympusRoot() {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const pkgPath = join(dir, 'package.json');
    const cfgPath = join(dir, 'opencode.json');
    if (existsSync(pkgPath) && existsSync(cfgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'olympus') return dir;
      } catch {}
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const ROOT = findOlympusRoot();

const PKG_VERSION = (() => {
  try {
    if (ROOT) {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      return pkg.version || '0.0.1';
    }
  } catch {}
  return '0.0.1';
})();

// ─── Banner ──────────────────────────────────────────────────────────────────

function printBanner() {
  const line = `${c.goldDim}${'─'.repeat(52)}${c.reset}`;
  console.log('');
  console.log(line);
  // OLYMPUS in large caps — matches the public/header.svg branding
  // The dot (•) above the center represents Atlas — the 10th god standing
  // at the peak of Mount Olympus, orchestrating dispatch execution.
  console.log(`  ${c.bold}${c.gold}      •  •  •  •  •  •  •  •  •  •${c.reset}`);
  console.log(`  ${c.bold}${c.gold}    ___  _  __   ____  __ ____  _   _ ____  ${c.reset}`);
  console.log(`  ${c.bold}${c.gold}   / _ \\| | \\ \\ / /  \\/  |  _ \\| | | / ___| ${c.reset}`);
  console.log(`  ${c.bold}${c.gold}  | | | | |  \\ V /| |\\/| | |_) | | | \\___ \\ ${c.reset}`);
  console.log(`  ${c.bold}${c.gold}  | |_| | |___| | | |  | |  __/| |_| |___) |${c.reset}`);
  console.log(`  ${c.bold}${c.gold}   \\___/|_____|_| |_|  |_|_|    \\___/|____/ ${c.reset}`);
  console.log('');
  console.log(`  ${c.bold}${c.gold}OLYMPUS${c.reset} ${c.gray}v${PKG_VERSION}${c.reset}  ${c.dim}·${c.reset}  ${c.cyan}Low-cost. Excellent quality. Always free.${c.reset}`);
  console.log(`  ${c.gray}10 gods · 118 demigods · 330 skills · 19 MCPs · 10 plugins · 16 commands${c.reset}`);
  console.log(line);
  console.log('');
}

// ─── Help ────────────────────────────────────────────────────────────────────
const HELP = `${c.bold}OLYMPUS${c.reset} ${c.gray}v${PKG_VERSION}${c.reset} — Low-cost, high-quality multi-agent OS built on OpenCode.

${c.bold}Usage:${c.reset}
  olympus <command> [args]

${c.bold}Commands:${c.reset}
  ${c.gold}install${c.reset}               Run the interactive installer (creates ~/.olympus, ~/OLYMPUS-VAULT)
  ${c.gold}init${c.reset}                  Alias for \`install\` (backward compat)
  ${c.gold}doctor${c.reset}                Run the 68-point installation health check
  ${c.gold}dev${c.reset}                   Launch the OLYMPUS Electron desktop window (spawns Next.js internally)
  ${c.gold}start${c.reset}                 Alias for \`dev\`
  ${c.gold}build${c.reset}                 Build a standalone desktop installer (.AppImage)
  ${c.gold}apply-strategy${c.reset} <id>   Switch LLM strategy (go-max-quality | go-balanced | go-budget | zen-max-quality | zen-balanced | zen-budget | free-openrouter | free-big-pickle | free-nvidia-build | custom-*)
  ${c.gold}refresh-models${c.reset}        Re-fetch the live free model lists (OpenRouter + NVIDIA Build) so the Free strategies pick up new flagships
  ${c.gold}seed-vault${c.reset}            Re-seed the vault (idempotent — safe to run multiple times)
  ${c.gold}terminal${c.reset}              Connect to the running OLYMPUS Terminal Bridge (port 3740) and
                          stream a live PTY in this shell. Works in Zed, tmux, SSH, etc.
  ${c.gold}opencode${c.reset}              Run the local OpenCode CLI from node_modules/.bin/opencode
                          Use for authorization: ${c.dim}olympus opencode${c.reset}
                          Pass args: ${c.dim}olympus opencode run --agent apollo "hello"${c.reset}
                          ${c.gray}(no global install needed)${c.reset}
  ${c.gold}uninstall${c.reset}             Run the vault-safe uninstaller (3 modes: quick / full / complete)
  ${c.gray}--version${c.reset}             Print version
  ${c.gray}--help${c.reset}                Show this help

${c.bold}Examples:${c.reset}
  ${c.dim}olympus install${c.reset}                                  ${c.gray}# First-time install (creates ~/.olympus, ~/OLYMPUS-VAULT)${c.reset}
  ${c.dim}olympus dev${c.reset}                                     ${c.gray}# Launch the OLYMPUS desktop window${c.reset}
  ${c.dim}olympus build${c.reset}                                   ${c.gray}# Build a standalone installer${c.reset}
  ${c.dim}olympus apply-strategy go-budget${c.reset}                ${c.gray}# Switch to the budget strategy${c.reset}
  ${c.dim}olympus apply-strategy zen-balanced${c.reset}             ${c.gray}# Switch to the Zen strategy (pay-as-you-go)${c.reset}
  ${c.dim}olympus refresh-models${c.reset}                              ${c.gray}# Refresh live free model lists${c.reset}
  ${c.dim}olympus opencode${c.reset}                                   ${c.gray}# Launch local OpenCode CLI for authorization${c.reset}
  ${c.dim}olympus opencode run --agent apollo "hello"${c.reset}        ${c.gray}# Run a one-off prompt via OpenCode${c.reset}
  ${c.dim}olympus terminal${c.reset}                                ${c.gray}# Attach to the live OLYMPUS terminal from any shell${c.reset}
  ${c.dim}olympus terminal --spawn --cwd ~/projects/foo${c.reset}   ${c.gray}# Spawn a fresh PTY at a specific directory${c.reset}
  ${c.dim}olympus doctor${c.reset}                                  ${c.gray}# Verify installation health (68 checks)${c.reset}
  ${c.dim}olympus uninstall${c.reset}                               ${c.gray}# Uninstall (preserves vault by default)${c.reset}

${c.bold}Quick start:${c.reset}
  ${c.dim}npm install -g olympus && olympus install${c.reset}
  ${c.dim}npx olympus install${c.reset}

${c.gray}Documentation: https://github.com/texugo7badger/olympus#readme${c.reset}
${c.gray}License: AGPL-3.0-or-later${c.reset}
${c.gray}Built with humility. Powered by OpenCode GO.${c.reset}
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fail(msg, code = 1) {
  console.error(`${c.red}olympus:${c.reset} ${msg}`);
  process.exit(code);
}

function runScript(scriptPath, args = []) {
  if (!existsSync(scriptPath)) {
    fail(`script not found: ${scriptPath}`);
  }
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: 'inherit',
    cwd: ROOT || undefined,
  });
  if (result.status !== 0) {
    fail(`script exited with code ${result.status}`, result.status ?? 1);
  }
}

function runShell(shellScript, args = []) {
  if (!existsSync(shellScript)) {
    fail(`installer not found: ${shellScript}`);
  }
  const result = spawnSync('bash', [shellScript, ...args], {
    stdio: 'inherit',
    cwd: ROOT || undefined,
  });
  if (result.status !== 0) {
    fail(`installer exited with code ${result.status}`, result.status ?? 1);
  }
}

/**
 * Resolve the path to the local OpenCode CLI binary.
 * Checks node_modules/.bin/opencode (symlink) and falls back
 * to the packaged binary directly.
 */
function findOpencodeBin() {
  if (!ROOT) return null;
  const candidates = [
    join(ROOT, 'node_modules', '.bin', 'opencode'),
    join(ROOT, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * Resolve the absolute path to the Electron executable.
 *
 * Uses the binary directly (node_modules/electron/dist/electron).
 *
 * If the binary is missing but the Electron npm package is installed
 * (package.json exists), attempts to run the postinstall download script
 * to fetch the binary before giving up.
 */
function resolveElectronPath() {
  if (!ROOT) return null;

  const electronDist = join(ROOT, 'node_modules', 'electron', 'dist', 'electron');
  if (existsSync(electronDist)) return electronDist;

  // Binary missing — but is the Electron npm package installed?
  // If so, try running the postinstall download script automatically.
  const electronPkg = join(ROOT, 'node_modules', 'electron', 'package.json');
  const installScript = join(ROOT, 'node_modules', 'electron', 'install.js');
  if (existsSync(electronPkg) && existsSync(installScript)) {
    console.log(`${c.gray}olympus: Electron package found but binary missing — downloading...${c.reset}`);
    try {
      const result = spawnSync(process.execPath, [installScript], {
        stdio: 'inherit',
        cwd: ROOT,
        env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '' },
      });
      if (result.status === 0 && existsSync(electronDist)) {
        console.log(`${c.green}olympus: Electron binary downloaded successfully.${c.reset}`);
        return electronDist;
      }
      console.log(`${c.yellow}olympus: Electron download script ran but binary still not found.${c.reset}`);
    } catch (err) {
      console.log(`${c.yellow}olympus: Electron download failed: ${err.message}${c.reset}`);
    }
  }

  return null;
}

/**
 * Spawn the Electron desktop window pointing at the OLYMPUS Next.js app.
 *
 * The Electron main process (electron/main.ts) is compiled to
 * dist-electron-tsc/main.js by `tsc -p electron/tsconfig.json`. If the
 * compiled output doesn't exist yet (e.g. fresh clone), we run the
 * TypeScript compile step first.
 *
 * @param {string[]} extraArgs - extra CLI args to pass to Electron (rare)
 */
function startElectron(extraArgs = []) {
  if (!ROOT) fail('could not locate OLYMPUS source root');

  const electronBin = resolveElectronPath();
  if (!electronBin) {
    fail(
      `Electron is not installed.\n` +
      `Run ${c.bold}npm install${c.reset} first (Electron is in devDependencies).`,
    );
  }

  // Rebuild native modules (node-pty,
  // better-sqlite3) for Electron's Node ABI BEFORE spawning Electron.
  //
  // node-pty is a native C++ addon. When you `npm install`, it compiles for
  // the SYSTEM Node.js ABI. But Electron uses a DIFFERENT ABI. Without
  // rebuilding, `require('node-pty')` throws at module load time, and the
  // terminal falls back to FallbackPty (child_process.spawn with pipes).
  //
  // The `npm run dev` script runs `rebuild:native` before Electron, but
  // `olympus dev` spawns Electron DIRECTLY (not via `npm run dev`). So we
  // must run the rebuild here. The rebuild script is idempotent — if the
  // modules are already rebuilt, it's a fast no-op.
  const rebuildScript = join(ROOT, 'scripts', 'rebuild-native.js');
  if (existsSync(rebuildScript)) {
    console.log(`${c.gold}olympus:${c.reset} rebuilding native modules for Electron...`);
    const rebuildResult = spawnSync(process.execPath, [rebuildScript], {
      stdio: 'inherit',
      cwd: ROOT,
      env: process.env,
    });
    if (rebuildResult.status !== 0) {
      console.log(`${c.gray}olympus: native rebuild had issues (terminal may use fallback mode)${c.reset}`);
    }
  }

  // Ensure the Electron main process is compiled. Recompile if any source
  // .ts file in electron/ is newer than the compiled main.js.
  const compiledMain = join(ROOT, 'dist-electron-tsc', 'main.js');
  const cjsMarker = join(ROOT, 'dist-electron-tsc', 'package.json');
  const electronSrcDir = join(ROOT, 'electron');

  function isCompiledStale() {
    if (!existsSync(compiledMain) || !existsSync(cjsMarker)) return true;
    try {
      const compiledMtime = statSync(compiledMain).mtimeMs;
      function checkDir(dir) {
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              if (checkDir(fullPath)) return true;
            } else if (entry.name.endsWith('.ts')) {
              if (statSync(fullPath).mtimeMs > compiledMtime) return true;
            }
          }
        } catch {}
        return false;
      }
      return checkDir(electronSrcDir);
    } catch {
      return true;
    }
  }

  // Always force a recompile if the OLYMPUS_ELECTRON_FORCE_REBUILD
  // env var is set, OR if the compiled main.js doesn't exist. The isCompiledStale()
  // check can give false negatives when zip extraction sets all mtimes to the
  // same value. After a fresh install, ALWAYS recompile to be safe.
  const forceRecompile = process.env.OLYMPUS_ELECTRON_FORCE_REBUILD === '1' || !existsSync(compiledMain);

  if (forceRecompile || isCompiledStale()) {
    console.log(`${c.gold}olympus:${c.reset} compiling Electron main process...`);
    const tscCli = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    if (!existsSync(tscCli)) {
      fail(`TypeScript CLI not found at: ${tscCli}\nRun "npm install" first.`);
    }
    const tscResult = spawnSync(process.execPath, [tscCli, '-p', join(ROOT, 'electron', 'tsconfig.json')], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    if (tscResult.status !== 0) {
      fail(`Electron TypeScript compile failed (exit ${tscResult.status})`, tscResult.status ?? 1);
    }
    const postcompileScript = join(ROOT, 'scripts', 'electron-postcompile.js');
    if (existsSync(postcompileScript)) {
      const pcResult = spawnSync(process.execPath, [postcompileScript], { stdio: 'inherit', cwd: ROOT });
      if (pcResult.status !== 0) {
        fail(`electron-postcompile failed (exit ${pcResult.status})`, pcResult.status ?? 1);
      }
    }
    if (!existsSync(compiledMain)) {
      fail(`Electron main.js not found at ${compiledMain} after compile`);
    }
    console.log(`${c.green}olympus:${c.reset} Electron compiled OK`);
  }

  console.log(`${c.gold}olympus:${c.reset} launching OLYMPUS desktop window...`);
  console.log(`${c.gray}olympus: Electron will start Next.js on port 3737 and open the window.${c.reset}`);
  console.log(`${c.gray}olympus: close the OLYMPUS window to stop. Ctrl+C also works.${c.reset}`);
  console.log('');

  // Use the path from resolveElectronPath() — it already confirmed the binary
  // exists (and attempted auto-download if needed).
  const electronExePath = electronBin;

  // Linux: auto-detect if the chrome-sandbox is NOT setuid-root and pass
  // --no-sandbox to avoid the FATAL abort at startup. This check must happen
  // HERE (before spawning Electron) because Electron's C++ sandbox check runs
  // before the JS main process code in electron/main.ts can append the flag.
  // The ensureLinuxSandboxReady() in the main process is a safety net, but the
  // crash happens before it executes.
  // Set WM_CLASS to 'olympus' so the Linux desktop environment matches
  // the .desktop entry (which has StartupWMClass=olympus) and shows the
  // OLYMPUS logo in the taskbar/dock instead of the generic gear icon.
  let electronArgs = ['--class=olympus', ROOT, ...extraArgs];
  if (process.platform === 'linux') {
    const chromeSandbox = join(ROOT, 'node_modules', 'electron', 'dist', 'chrome-sandbox');
    let sandboxOk = false;
    try {
      const st = statSync(chromeSandbox);
      sandboxOk = st.uid === 0 && (st.mode & 0o4000) !== 0;
    } catch {}
    if (!sandboxOk) {
      electronArgs.unshift('--no-sandbox');
      console.log(`${c.gray}olympus: Linux chrome-sandbox not setuid-root — using --no-sandbox${c.reset}`);
    }
  }

  console.log(`${c.gray}olympus: binary: ${electronExePath}${c.reset}`);
  console.log(`${c.gray}olympus: app root: ${ROOT}${c.reset}`);
  console.log('');

  const child = spawn(electronExePath, electronArgs, {
    stdio: 'inherit',
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      OLYMPUS_ELECTRON: '1',
    },
    shell: false,
  });

  let spawnErrored = false;

  child.on('error', (err) => {
    spawnErrored = true;
    fail(`failed to start Electron: ${err.message}`);
  });

  // Log Electron's exit code so we can diagnose silent exits.
  // The previous code just called process.exit(code) without logging — if
  // Electron crashed with a non-zero code, the user saw a silent return.
  child.on('close', (code, signal) => {
    if (spawnErrored) return;
    if (code === null && signal) {
      console.error(`${c.red}olympus: Electron exited with signal ${signal}${c.reset}`);
      process.exit(1);
    }
    if (code !== 0) {
      console.error(`${c.red}olympus: Electron exited with code ${code}${c.reset}`);
      console.error(`${c.gray}olympus: Check that dist-electron-tsc/main.js exists and is valid.${c.reset}`);
      console.error(`${c.gray}olympus: Try running: npm run electron:compile${c.reset}`);
    }
    process.exit(code ?? 0);
  });

  // Capture Electron's stderr so we can see crash messages.
  // The previous code used stdio: 'inherit' which pipes stderr to the
  // parent's stderr — but if the parent is hidden (VBS launcher), the
  // stderr goes nowhere. By capturing stderr separately, we can log
  // crash messages to the terminal log file.
  // Note: we can't change stdio to 'pipe' because 'inherit' is needed
  // for the Next.js dev server output. Instead, we add a separate
  // error handler on the child process.
  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`${c.red}olympus: Electron process exited (code=${code})${c.reset}`);
    }
  });

  process.on('SIGINT', () => { child.kill('SIGINT'); });
  process.on('SIGTERM', () => { child.kill('SIGTERM'); });
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const [cmd, ...args] = process.argv.slice(2);

  // `--vault <path>` flag for multi-project vault
  // isolation. Sets OLYMPUS_VAULT_DIR env var before any subprocess spawns.
  // Must be parsed BEFORE the switch statement so it applies to all commands.
  const vaultFlagIdx = args.indexOf('--vault');
  if (vaultFlagIdx >= 0 && vaultFlagIdx + 1 < args.length) {
    const vaultPath = args[vaultFlagIdx + 1];
    process.env.OLYMPUS_VAULT_DIR = vaultPath;
    // Remove the flag + value from args so downstream commands don't see it.
    args.splice(vaultFlagIdx, 2);
    console.log(`${c.gold}olympus:${c.reset} using vault at ${c.bold}${vaultPath}${c.reset}`);
  }

  // No command -> show banner + help
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    printBanner();
    process.stdout.write(HELP);
    return;
  }

  if (cmd === '--version' || cmd === '-v') {
    printBanner();
    return;
  }

  if (!ROOT) {
    fail('could not locate OLYMPUS source root — ensure you installed olympus via npm/npx/bun from the project root');
  }

  switch (cmd) {
    case 'install':
    case 'init': {
      // `install` is the primary command; `init` is kept as
      // an alias for backward compatibility. Runs scripts/install/install.sh.
      const installer = join(ROOT, 'scripts', 'install', 'install.sh');
      runShell(installer, args);
      return;
    }
    case 'doctor': {
      runScript(join(ROOT, 'scripts', 'olympus-doctor.js'), args);
      return;
    }
    case 'dev':
    case 'start':
    case 'electron': {
      // All three are aliases — OLYMPUS is always Electron.
      const filtered = args.filter(a => !a.startsWith('--'));
      printBanner();
      console.log(`${c.gold}olympus:${c.reset} starting in Electron desktop mode...`);
      console.log('');
      startElectron(filtered);
      return;
    }
    case 'build':
    case 'electron:build':
    case 'build:electron': {
      const result = spawnSync('npm', ['run', 'build', '--', ...args], {
        stdio: 'inherit',
        cwd: ROOT,
        shell: false,
      });
      if (result.status !== 0) fail(`build exited with code ${result.status}`, result.status ?? 1);
      return;
    }
    case 'apply-strategy':
    case 'strategy': {
      const strategyId = args[0];
      if (!strategyId) fail('usage: olympus apply-strategy <id> (e.g. go-balanced)');
      runScript(join(ROOT, 'scripts', 'apply-strategy.js'), ['--strategy', strategyId, ...args.slice(1)]);
      return;
    }
    case 'refresh-models': {
      // Re-fetch the live free model lists (OpenRouter + Groq + NVIDIA Build)
      // so the Free / Free Big Pickle strategies pick up newly released flagships.
      runScript(join(ROOT, 'scripts', 'refresh-free-models.js'), args);
      return;
    }
    case 'seed-vault': {
      // Try python3 first, then python
      const pyCheck = spawnSync('python3', ['--version'], { stdio: 'ignore' });
      const pyBin = pyCheck.status === 0 ? 'python3' : 'python';
      const result = spawnSync(pyBin, [join(ROOT, 'scripts', 'seed-vault.py'), ...args], {
        stdio: 'inherit',
        cwd: ROOT,
      });
      if (result.status !== 0) fail(`seed-vault exited with code ${result.status}`, result.status ?? 1);
      return;
    }
    case 'uninstall': {
      // v3: runs the vault-safe uninstaller from scripts/install/.
      const uninstaller = join(ROOT, 'scripts', 'install', 'uninstall.sh');
      runShell(uninstaller, args);
      return;
    }
    case 'opencode': {
      // Run the local OpenCode CLI from node_modules/.bin/opencode.
      // Useful for: authorization (`olympus opencode`), one-off prompts
      // (`olympus opencode run --agent apollo "hello"`), or any other
      // opencode command without needing a global install.
      const opencodeBin = findOpencodeBin();
      if (!opencodeBin) {
        fail('OpenCode CLI not found in node_modules/.bin/ — run npm install first');
      }
      const result = spawnSync(opencodeBin, args, {
        stdio: 'inherit',
        cwd: ROOT || undefined,
      });
      if (result.status !== 0 && result.status !== null) {
        process.exit(result.status);
      }
      return;
    }
    case 'terminal':
    case 'term': {
      // Connect to the running OLYMPUS Terminal
      // Bridge (port 3740) and stream a live PTY in the current shell. Used
      // by the IDE extensions + by users who want OLYMPUS's terminal in a
      // tmux pane / SSH session / Zed's built-in terminal.
      const terminalScript = join(ROOT, 'scripts', 'olympus-terminal.js');
      if (!existsSync(terminalScript)) {
        fail(`olympus-terminal.js not found at ${terminalScript}`);
      }
      const result = spawnSync(process.execPath, [terminalScript, ...args], {
        stdio: 'inherit',
        cwd: ROOT,
        env: process.env,
      });
      if (result.status !== 0) fail(`olympus terminal exited with code ${result.status}`, result.status ?? 1);
      return;
    }
    case 'vault': {
      // `olympus vault prune [--dry-run|--live]`
      // runs the vault pruning policy. Default is --dry-run (just preview).
      const subcmd = args[0];
      if (subcmd === 'prune') {
        const pruneScript = join(ROOT, 'scripts', 'vault-prune.js');
        if (!existsSync(pruneScript)) {
          fail(`vault-prune.js not found at ${pruneScript}`);
        }
        const pruneArgs = args.slice(1);
        // Default to --dry-run if neither --live nor --dry-run is specified.
        if (!pruneArgs.includes('--live') && !pruneArgs.includes('--dry-run')) {
          pruneArgs.push('--dry-run');
        }
        const result = spawnSync(process.execPath, [pruneScript, ...pruneArgs], {
          stdio: 'inherit',
          cwd: ROOT,
          env: process.env,
        });
        if (result.status !== 0) fail(`olympus vault prune exited with code ${result.status}`, result.status ?? 1);
        return;
      }
      fail(`olympus vault: unknown subcommand "${subcmd}". Valid: prune`);
      return;
    }
    case 'settings': {
      // `olympus settings export/import` for
      // moving the user's config between machines.
      const settingsScript = join(ROOT, 'scripts', 'settings-export-import.js');
      if (!existsSync(settingsScript)) {
        fail(`settings-export-import.js not found at ${settingsScript}`);
      }
      const result = spawnSync(process.execPath, [settingsScript, ...args], {
        stdio: 'inherit',
        cwd: ROOT,
        env: process.env,
      });
      if (result.status !== 0) fail(`olympus settings exited with code ${result.status}`, result.status ?? 1);
      return;
    }
    case 'test': {
      // `olympus test demigod <name>` runs the
      // prompt's frontmatter tests (agent prompt versioning).
      const testScript = join(ROOT, 'scripts', 'test-demigod.js');
      if (!existsSync(testScript)) {
        fail(`test-demigod.js not found at ${testScript}`);
      }
      const result = spawnSync(process.execPath, [testScript, ...args], {
        stdio: 'inherit',
        cwd: ROOT,
        env: process.env,
      });
      if (result.status !== 0) fail(`olympus test exited with code ${result.status}`, result.status ?? 1);
      return;
    }
    default:
      fail(`unknown command: ${cmd}\n\nRun ${c.bold}olympus --help${c.reset} to see available commands.`, 2);
  }
}

main();
