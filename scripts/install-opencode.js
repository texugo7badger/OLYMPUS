#!/usr/bin/env node
/**
 * Olympus OpenCode Installer — installs OpenCode LOCALLY (project-scoped).
 *
 * WHY LOCAL (not global)?
 *   - The Olympus project's `opencode.json` + `.opencode/` directory
 *     contain ALL the Olympus-specific config (v0.0.1):
 *       9 Olympus gods (Apollo-primary + 7 specialists + Callimachus)
 *       118 demigods (ECC + OLYMPUS-Extensions)
 *       330 vendored skills (incl. 14 superpowers sub-skills)
 *       16 OLYMPUS commands
 *       19 MCP servers, 21 hooks across 10 plugins
 *       Symphony v1.0 (latent God↔Demigod protocol)
 *     A local install ONLY puts the `opencode` BINARY in
 *     `node_modules/.bin/` — it does NOT touch any config files. When
 *     OpenCode runs, it reads the config from the project root, so the
 *     Olympus settings are always used.
 *   - A local install is scoped to the Olympus project. It doesn't
 *     pollute the global system. Uninstalling Olympus (deleting the
 *     project folder) also removes OpenCode.
 *   - The ttyd launcher resolves the `opencode` binary via PATH
 *     (which includes `node_modules/.bin/`), so a local install works.
 *
 * WILL THIS OVERWRITE OLYMPUS CONFIG?
 *   NO. `npm install --save-dev opencode-ai` only:
 *     1. Downloads the opencode package into node_modules/opencode-ai/
 *     2. Creates a symlink/script in node_modules/.bin/opencode
 *     3. Adds the package to devDependencies in package.json
 *   It does NOT create or modify:
 *     - opencode.json (the Olympus agent/command/model config)
 *     - .opencode/ directory (themes, skills, commands, prompts)
 *     - ~/.config/opencode/ (global OpenCode config — not touched)
 *   The Olympus config lives in the project root and is read at RUNTIME
 *   when `opencode` starts — the binary itself is config-agnostic.
 *
 * Usage:
 *   node scripts/install-opencode.js           # install latest (skip if exists)
 *   node scripts/install-opencode.js --update  # force update to latest
 *   node scripts/install-opencode.js --version 1.18.3  # specific version
 *
 
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isWindows = platform() === 'win32';

// Resolve Olympus root (parent of scripts/)
const OLYMPUS_ROOT = join(__dirname, '..');

function log(msg) { console.log(`[opencode] ${msg}`); }
function ok(msg) { console.log(`[opencode] OK ${msg}`); }
function warn(msg) { console.warn(`[opencode] ! ${msg}`); }
function err(msg) { console.error(`[opencode] X ${msg}`); }

const forceUpdate = process.argv.includes('--update') || process.argv.includes('-u');

log('Olympus OpenCode Installer (project-local)');
log(`Project root: ${OLYMPUS_ROOT}`);
log('');

// Check if opencode is already available (local or global)
function findLocalOpencode() {
  const localBin = join(OLYMPUS_ROOT, 'node_modules', '.bin',
    isWindows ? 'opencode.cmd' : 'opencode');
  if (existsSync(localBin)) return localBin;
  // Some npm versions create 'opencode' (no .cmd) even on Windows
  const altBin = join(OLYMPUS_ROOT, 'node_modules', '.bin', 'opencode');
  if (existsSync(altBin)) return altBin;
  return null;
}

function findGlobalOpencode() {
  try {
    const which = isWindows ? 'where opencode' : 'which opencode';
    const result = execSync(which, { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
    const first = result.split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0];
    return first || null;
  } catch { return null; }
}

const existingLocal = findLocalOpencode();
const existingGlobal = findGlobalOpencode();

if (existingLocal && !forceUpdate) {
  ok(`OpenCode already installed locally: ${existingLocal}`);
  log('');
  log('To UPDATE to the latest version, run:');
  log('  npm run install-opencode -- --update');
  log('');
  log('Olympus config (opencode.json + .opencode/) is NOT affected by updates.');
  process.exit(0);
}

if (existingGlobal && !existingLocal && !forceUpdate) {
  warn(`OpenCode found globally: ${existingGlobal}`);
  warn('Installing a LOCAL copy for the Olympus project (recommended)...');
  warn('The global install is NOT removed — both can coexist.');
  log('');
}

if (forceUpdate) {
  log('Force-updating OpenCode to the latest version...');
  log('Olympus config (opencode.json + .opencode/) will NOT be affected.');
  log('');
}

// Determine version to install
const versionArg = process.argv.includes('--version')
  ? process.argv[process.argv.indexOf('--version') + 1]
  : 'latest';

const pkg = `opencode-ai@${versionArg}`;
log(`Package: ${pkg}`);
log('');

// Install opencode locally via npm
// --save-dev scopes it to the project (not global)
// --no-audit --no-fund keeps output clean
try {
  // v0.0.18 FIX — On Windows with fnm/nvm, `npm` is a .cmd shim that
  // can't be spawned with shell:false (Node.js EINVAL error since
  // CVE-2024-27980). We use shell:true on Windows so cmd.exe resolves
  // the .cmd shim. On macOS/Linux, shell:false is fine (npm is a real
  // executable, not a .cmd).
  //
  // Also, spawnSync returns status=null when the spawn ITSELF fails
  // (ENOENT, EINVAL) — not just when the command exits non-zero.
  // The old code checked `result.status !== 0` which treated null as
  // failure (correct), but didn't distinguish "spawn failed" from
  // "npm returned non-zero". Now we check both status AND error.
  const cmd = isWindows ? 'npm' : 'npm';
  const args = ['install', '--save-dev', '--no-audit', '--no-fund', pkg];
  log(`Running: ${cmd} ${args.join(' ')}`);

  const result = spawnSync(cmd, args, {
    cwd: OLYMPUS_ROOT,
    stdio: 'inherit',
    shell: isWindows,  // Windows: shell:true (npm is a .cmd shim)
    // macOS/Linux: shell:false (npm is a real executable)
  });

  // v0.0.18 — Check for spawn failure (status=null, error set)
  if (result.error) {
    err(`Failed to spawn npm: ${result.error.message}`);
    err('npm might not be on PATH. Try: npx npm install --save-dev opencode-ai');
    process.exit(1);
  }

  if (result.status !== 0) {
    err(`npm install failed (exit ${result.status})`);
    err('Try installing manually: npm install --save-dev opencode-ai');
    process.exit(1);
  }

  // Verify the binary was created
  const localBin = findLocalOpencode();
  if (!localBin) {
    err('npm install succeeded but opencode binary not found in node_modules/.bin/');
    err('Check node_modules/opencode-ai/ for the binary.');
    process.exit(1);
  }

  ok(`OpenCode CLI installed locally: ${localBin}`);

  // Test it
  log('');
  log('Verifying installation...');
  try {
    const verResult = execSync(`"${localBin}" --version`, {
      encoding: 'utf-8', timeout: 10000,
    });
    ok(`Version: ${verResult.trim()}`);
  } catch (e) {
    warn(`Could not get version: ${e.message}`);
    warn('The binary is installed but may need a restart of the dev server.');
  }

  log('');
  ok('Done! OpenCode is installed in the Olympus project (node_modules/.bin/).');
  log('');
  log('The ttyd launcher will find it automatically via PATH.');
  log('Olympus config (opencode.json + .opencode/) is unchanged.');
  log('');
  log('To UPDATE later: npm run install-opencode -- --update');
  log('To UNINSTALL:    npm uninstall opencode-ai');

} catch (e) {
  err(`Installation failed: ${e.message}`);
  process.exit(1);
}
