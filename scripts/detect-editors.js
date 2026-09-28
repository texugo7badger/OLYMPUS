#!/usr/bin/env node
/**
 * OLYMPUS Editor Detector — runs editor auto-detection and prints the results.
 *
 * Used by the installer (install.sh / install.ps1) to show the user which
 * editors were detected so they can confirm OLYMPUS will be able to launch
 * their preferred IDE. Also writes the initial ~/.olympus/editor-config.json
 * with the detection result.
 *
 * Self-contained (doesn't import from src/lib/editor-bridge.ts because that
 * would require tsx at install time). The detection logic here mirrors
 * src/lib/editor-bridge.ts — keep them in sync when adding new editors.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

function log(msg) { console.log(`[olympus:editors] ${msg}`); }
function ok(msg) { console.log(`[olympus:editors] ✓ ${msg}`); }
function warn(msg) { console.warn(`[olympus:editors] ! ${msg}`); }

const isWindows = process.platform === 'win32';
const CONFIG_FILE = join(homedir(), '.olympus', 'editor-config.json');

const EDITOR_CATALOG = [
  {
    id: 'zed',
    displayName: 'Zed',
    binaries: ['zed', 'zeditor'],
    knownPaths: {
      darwin: ['/Applications/Zed.app/Contents/MacOS/cli', join(homedir(), 'Applications/Zed.app/Contents/MacOS/cli')],
      linux: [join(homedir(), '.local/bin/zed'), '/usr/bin/zed', '/usr/local/bin/zed', '/snap/bin/zed', join(homedir(), '.local/share/zed/cli/zed')],
      win32: [join(homedir(), 'AppData/Local/Programs/Zed/zed.exe'), 'C:\\Program Files\\Zed\\zed.exe'],
    },
    homepage: 'https://zed.dev/download',
    tagline: 'GPU-accelerated, multiplayer',
  },
  {
    id: 'vscode',
    displayName: 'VSCode',
    binaries: ['code', 'code-insiders'],
    knownPaths: {
      darwin: ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'],
      linux: ['/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code', join(homedir(), '.local/bin/code')],
      win32: [join(homedir(), 'AppData/Local/Programs/Microsoft VS Code/bin/code.cmd'), 'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd'],
    },
    homepage: 'https://code.visualstudio.com/download',
    tagline: "Microsoft's VSCode — the industry default",
  },
  {
    id: 'vscodium',
    displayName: 'VSCodium',
    binaries: ['codium', 'vscodium'],
    knownPaths: {
      darwin: ['/Applications/VSCodium.app/Contents/Resources/app/bin/codium'],
      linux: ['/usr/bin/codium', '/usr/local/bin/codium', '/snap/bin/codium', join(homedir(), '.local/bin/codium')],
      win32: [join(homedir(), 'AppData/Local/Programs/VSCodium/bin/codium.cmd'), 'C:\\Program Files\\VSCodium\\bin\\codium.cmd'],
    },
    homepage: 'https://vscodium.com/#download',
    tagline: 'Telemetry-free VSCode fork',
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    binaries: ['cursor'],
    knownPaths: {
      darwin: ['/Applications/Cursor.app/Contents/Resources/app/bin/cursor'],
      linux: [join(homedir(), '.local/bin/cursor'), '/usr/bin/cursor', '/opt/cursor/cursor'],
      win32: [join(homedir(), 'AppData/Local/Programs/cursor/Cursor.exe'), 'C:\\Program Files\\Cursor\\Cursor.exe'],
    },
    homepage: 'https://cursor.com/download',
    tagline: 'AI-focused VSCode fork',
  },
];

function findOnPath(binary) {
  const cmd = isWindows ? 'where' : 'which';
  try {
    const result = spawnSync(cmd, [binary], { encoding: 'utf-8', timeout: 3000, windowsHide: true });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim().split('\n')[0].trim();
    }
  } catch {}
  return null;
}

function detectEditor(entry) {
  for (const bin of entry.binaries) {
    const onPath = findOnPath(bin);
    if (onPath) {
      return { id: entry.id, displayName: entry.displayName, binPath: onPath, source: 'PATH', homepage: entry.homepage, tagline: entry.tagline };
    }
  }
  const platform = process.platform;
  const known = entry.knownPaths[platform] || [];
  for (const p of known) {
    if (existsSync(p)) {
      return { id: entry.id, displayName: entry.displayName, binPath: p, source: 'known-location', homepage: entry.homepage, tagline: entry.tagline };
    }
  }
  return { id: entry.id, displayName: entry.displayName, binPath: null, source: null, homepage: entry.homepage, tagline: entry.tagline };
}

const detected = EDITOR_CATALOG.map(detectEditor);
let cfg = { preferred: 'auto' };
try {
  if (existsSync(CONFIG_FILE)) cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
} catch {}

log(`Detected ${detected.filter(e => e.binPath).length}/${detected.length} editors:`);
for (const ed of detected) {
  if (ed.binPath) {
    ok(`${ed.displayName} — ${ed.binPath} (${ed.source})`);
  } else {
    warn(`${ed.displayName} — not found (install: ${ed.homepage})`);
  }
}

const resolved = detected.find(e => e.binPath);
if (resolved) {
  log(`Will use: ${resolved.displayName} (${resolved.binPath})`);
} else {
  warn('No editor detected — install Zed, VSCode, VSCodium, or Cursor.');
  warn('  Or set a custom binary path in Settings → Editor Settings.');
}

cfg.lastDetected = detected;
cfg.lastDetectedAt = new Date().toISOString();
try {
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  ok('Saved detection result to ~/.olympus/editor-config.json');
} catch (err) {
  warn(`Failed to save config: ${err.message}`);
}

// Signal to olympus-doctor.js that detection ran successfully.
console.log('OK');
