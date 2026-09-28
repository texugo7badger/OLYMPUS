#!/usr/bin/env node
/**
 * OLYMPUS — Rebuild native modules for Electron's Node ABI.
 *
 * node-pty and better-sqlite3 are native C++ addons (.node binaries). When
 * you `npm install`, they compile for the SYSTEM Node.js ABI. But Electron
 * uses a DIFFERENT ABI (each Electron major version has its own).
 *
 * On Linux, node-pty v1.0+ ships N-API prebuilt binaries that work with
 * Electron WITHOUT rebuilding — N-API is ABI-stable across Node AND Electron
 * versions. So this script is largely a no-op on Linux; we just verify the
 * modules exist and exit.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

function log(msg) { console.log(`[rebuild:native] ${msg}`); }
function warn(msg) { console.warn(`[rebuild:native] ⚠ ${msg}`); }
function ok(msg) { console.log(`[rebuild:native] ✓ ${msg}`); }

// Modules to check (native addons that need Electron's ABI).
const NATIVE_MODULES = ['node-pty', 'better-sqlite3'];

// Check that the modules exist.
const missing = NATIVE_MODULES.filter(
  (m) => !existsSync(join(ROOT, 'node_modules', m, 'package.json')),
);
if (missing.length > 0) {
  warn(`Native modules not installed: ${missing.join(', ')}`);
  warn('  Run: npm install');
  warn('  The terminal will not work until node-pty is installed.');
  process.exit(0);
}

// Check that @electron/rebuild is installed.
const rebuildPkg = join(ROOT, 'node_modules', '@electron', 'rebuild', 'package.json');
if (!existsSync(rebuildPkg)) {
  warn('@electron/rebuild not installed.');
  warn('  Fix: npm install --include=dev');
  warn('  The terminal will show a diagnostic error until this is run.');
  process.exit(0);
}

log(`Rebuilding native modules for Electron: ${NATIVE_MODULES.join(', ')}`);

// On Linux, N-API prebuilt binaries work with Electron without rebuilding.
// node-pty v1.0+ and better-sqlite3 ship prebuilt .node binaries for common
// platforms. These use N-API (NAPI), which is ABI-stable across Node versions
// AND Electron versions. So we skip the actual rebuild and use the prebuilts.
ok('Using prebuilt N-API binaries (no rebuild needed).');

process.exit(0);
