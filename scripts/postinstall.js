#!/usr/bin/env node
/**
 * OLYMPUS postinstall -- runs automatically after `npm install`.
 *
 * Ensures all LOCAL dependencies are present.
 *
 * WHY:
 *   All installation components (OpenCode CLI, native modules) must be
 *   installed locally within OLYMPUS to avoid compromising the user's
 *   global Node setup.
 *
 *   OpenCode (`opencode-ai`) is a devDependency in package.json. Running
 *   `npm install` installs it into `node_modules/.bin/opencode`. But:
 *     1. Some users run `npm install --production` (skips devDeps).
 *     2. Some users have a corrupted node_modules (partial install).
 *     3. Some users install with `--no-optional` or other flags.
 *
 *   This script checks that the critical local binaries are present AFTER
 *   `npm install` completes. If any are missing, it prints a clear warning
 *   with the fix command. It does NOT auto-install anything (that would
 *   be slow and could fail in restricted environments).
 *
 *   The check is FAST (< 50ms) and never fails the install -- it only
 *   prints warnings. This makes it safe to run on every `npm install`.
 *
 * WHAT IT CHECKS:
 *   1. `node_modules/.bin/opencode` -- the OpenCode CLI (local install).
 *      Required for the Interactive Terminal, Callimachus heartbeat,
 *      Athena edits, intake, compact-brain, and doc-summarizer.
 *   2. Electron (devDependency -- needed for `npm run dev`).
 *   3. node-pty (native module -- needed for the terminal panel).
 *
 * OLYMPUS does not ship an in-app code editor; users edit code in
 * their preferred IDE (Editor Bridge). Monaco and @monaco-editor/react
 * checks were removed along with the editor itself.
 *
 * If any of these are missing, the user sees a warning like:
 *
 *   [olympus:postinstall] ⚠ OpenCode CLI not found in node_modules/.bin/
 *     Fix: npm run install-opencode
 *     (or: npm install --include=dev)
 *
 * The script exits 0 regardless -- postinstall failures would block the
 * user's `npm install`, which is a worse experience than a missing
 * optional binary.
 
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, statSync, mkdirSync, writeFileSync, readFileSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const isWindows = process.platform === 'win32';

function log(msg) { console.log(`[olympus:postinstall] ${msg}`); }
function warn(msg) { console.warn(`[olympus:postinstall] ⚠ ${msg}`); }
function ok(msg) { console.log(`[olympus:postinstall] ✓ ${msg}`); }

// Skip in CI environments where we don't want warnings.
const isCI = process.env.CI === 'true' || process.env.CONTINUOUS_INTEGRATION === 'true';
if (isCI) {
  log('CI environment detected -- skipping local dependency checks.');
  process.exit(0);
}

// Skip when running as root in a Docker container (common in CI images).
if (process.getuid && process.getuid() === 0 && process.env.OLYMPUS_SKIP_POSTINSTALL === '1') {
  log('OLYMPUS_SKIP_POSTINSTALL=1 -- skipping.');
  process.exit(0);
}

log('Verifying local dependencies...');

let allPresent = true;

// 1. OpenCode CLI (local install)
const opencodeBin = isWindows
  ? join(ROOT, 'node_modules', '.bin', 'opencode.cmd')
  : join(ROOT, 'node_modules', '.bin', 'opencode');
const opencodeAlt = join(ROOT, 'node_modules', '.bin', 'opencode');
const opencodePkg = join(ROOT, 'node_modules', 'opencode-ai', 'package.json');

// #212: the v2 CLI (@opencode/cli) ships a JS STUB when its own postinstall
// was skipped (npm with dependency scripts disabled). The stub is a ~229-byte
// shim that exits 1 with "postinstall script was not run" — a "found" check
// that only tests existence would call that a healthy install. Detect the
// stub and repair it here so a fresh clone boots the latest v2.
const v2CliPkg = join(ROOT, 'node_modules', '@opencode', 'cli', 'package.json');
let v2CliVersion = null;
if (existsSync(v2CliPkg)) {
  try {
    const cli = JSON.parse(readFileSync(v2CliPkg, 'utf-8'));
    v2CliVersion = cli.version || null;
    const rel = Object.values(cli.bin || {})[0];
    const binPath = rel ? join(ROOT, 'node_modules', '@opencode', 'cli', rel) : null;
    const isStub = binPath && existsSync(binPath) && statSync(binPath).size < 1024;
    if (isStub) {
      log('@opencode/cli postinstall did not run (the bin is the stub) -- repairing...');
      execFileSync(process.execPath, [join(ROOT, 'node_modules', '@opencode', 'cli', 'postinstall.mjs')], { stdio: 'inherit' });
      ok(`OpenCode v2 CLI repaired (v${v2CliVersion})`);
    }
  } catch (e) {
    warn(`@opencode/cli repair failed: ${e.message}`);
    console.warn('    Fix: node node_modules/@opencode/cli/postinstall.mjs');
    allPresent = false;
  }
}

// #BIN-OWNERSHIP (v0.0.24): TWO packages ship an `opencode` bin — the legacy
// `opencode-ai` (1.x) and `@opencode/cli` (2.x). npm links whichever it
// resolves last, and after a plain `npm install` the link pointed at 1.x.
// The v1 CLI cannot open the v2 database ("Database is not empty and has no
// session table"), and every OLYMPUS spawn goes through `.bin/opencode` —
// so the bin MUST be the v2 CLI. Repair the symlink and name the truth.
const v2Bin = join(ROOT, 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
if (!isWindows && existsSync(v2Bin)) {
  try {
    const linkPath = join(ROOT, 'node_modules', '.bin', 'opencode');
    const wanted = realpathSync(v2Bin);
    let current = null;
    try { current = realpathSync(linkPath); } catch { current = null; }
    if (current !== wanted) {
      const reason = current
        ? `points at ${current.split('node_modules/').pop()}`
        : 'is missing or not a symlink';
      log(`node_modules/.bin/opencode ${reason} -- relinking to the v2 CLI (v${v2CliVersion || '?'})`);
      try { unlinkSync(linkPath); } catch { /* absent */ }
      symlinkSync(v2Bin, linkPath);
      ok('node_modules/.bin/opencode -> @opencode/cli (v2)');
    }
  } catch (e) {
    warn(`could not verify the opencode bin ownership: ${e.message}`);
  }
}

let resolvedBin = null;
try { resolvedBin = realpathSync(opencodeBin); } catch { resolvedBin = null; }
const binIsV2 = Boolean(resolvedBin && resolvedBin.includes(join('@opencode', 'cli')));

if (binIsV2) {
  ok(`OpenCode CLI found in node_modules/.bin/ (v2 v${v2CliVersion || '?'})`);
} else if (existsSync(opencodeBin) || existsSync(opencodeAlt)) {
  warn('node_modules/.bin/opencode is NOT the v2 CLI (a legacy 1.x bin shadows it).');
  console.warn('    Fix: npm run postinstall   (relinks the bin to @opencode/cli)');
} else if (existsSync(opencodePkg)) {
  ok('opencode-ai package installed (binary symlink may be missing -- run: npm rebuild opencode-ai)');
} else {
  warn('OpenCode CLI not found in node_modules/.bin/');
  console.warn('    Fix: npm run install-opencode');
  console.warn('    (or: npm install --include=dev)');
  allPresent = false;
}

// 2. Electron (devDependency -- needed for `npm run dev`)
const electronPkg = join(ROOT, 'node_modules', 'electron', 'package.json');
const electronBin = join(ROOT, 'node_modules', 'electron', 'dist', 'electron');
if (existsSync(electronPkg)) {
  if (existsSync(electronBin)) {
    ok('electron found and binary ready');
  } else {
    warn('electron package installed but binary NOT downloaded');
    console.warn('    Fix: node node_modules/electron/install.js');
    console.warn('    (the postinstall script downloads the ~150MB Electron binary)');
    allPresent = false;
  }
} else {
  warn('electron not found in node_modules/');
  console.warn('    Fix: npm install --include=dev');
  console.warn('    (electron is a devDependency -- needed to launch the desktop window)');
  allPresent = false;
}

// 3. node-pty (native module -- needed for the terminal panel)
const nodePtyPkg = join(ROOT, 'node_modules', 'node-pty', 'package.json');
if (existsSync(nodePtyPkg)) {
  ok('node-pty found');
} else {
  warn('node-pty not found in node_modules/');
  console.warn('    Fix: npm install --include=dev');
  console.warn('    (node-pty is needed for the terminal panel)');
  allPresent = false;
}

if (allPresent) {
  log('All local dependencies present. OLYMPUS is ready.');
  console.log('  Start the desktop app:  npm run dev');
  console.log('  Or:                     npm run electron:dev');
  console.log('  One-click bootstrap:    npm run setup');
} else {
  log('Some local dependencies are missing (see warnings above).');
  console.log('  Run the fix commands, then: npm run dev');
}

// ─── Install-state marker ─────────────────────────────────────────────────────
// Records that `npm install` completed so the doctor and installer can tell
// "installed but something broke" from "not installed yet". This is also the
// signal that IDE type diagnostics (missing react/@types/node etc.) should be
// gone -- refresh diagnostics after install.
const OLYMPUS_HOME = join(homedir(), '.olympus');
try {
  const statePath = join(OLYMPUS_HOME, 'install-state.json');
  mkdirSync(OLYMPUS_HOME, { recursive: true });
  writeFileSync(statePath, JSON.stringify({
    installed: true,
    at: new Date().toISOString(),
    node: process.version,
    deps: {
      opencode: existsSync(opencodeBin) || existsSync(opencodeAlt) || existsSync(opencodePkg),
      electron: existsSync(electronBin),
      nodePty: existsSync(nodePtyPkg),
      complete: allPresent,
    },
  }, null, 2) + '\n', 'utf-8');
  ok(`install state recorded (${statePath})`);
} catch (err) {
  warn(`could not write install-state.json (${err.message})`);
}

// Always exit 0 -- postinstall failures would block the user's npm install,
// which is a worse experience than a missing optional binary.
process.exit(0);
