#!/usr/bin/env node
/**
 * vendor-xterm.js — copy xterm.js + xterm-addon-fit + xterm.css from the
 * project's node_modules into extensions/vscode-olympus/media/.
 *
 *
 * Run after `npm install` in the OLYMPUS root. The vendored files are
 * committed to the repo so the extension can be packaged into a .vsix
 * without a build step.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OLYMPUS_ROOT = join(__dirname, '..', '..');
const EXT_MEDIA = join(OLYMPUS_ROOT, 'extensions', 'vscode-olympus', 'media');

const FILES = [
  // xterm.js core (UMD bundle — works in webviews without bundler)
  {
    from: 'node_modules/@xterm/xterm/lib/xterm.js',
    to: 'xterm.js',
  },
  {
    from: 'node_modules/@xterm/xterm/css/xterm.css',
    to: 'xterm.css',
  },
  // xterm-addon-fit
  {
    from: 'node_modules/@xterm/addon-fit/lib/addon-fit.js',
    to: 'xterm-addon-fit.js',
  },
];

mkdirSync(EXT_MEDIA, { recursive: true });

let ok = 0;
let missing = 0;
for (const f of FILES) {
  const from = join(OLYMPUS_ROOT, f.from);
  const to = join(EXT_MEDIA, f.to);
  if (!existsSync(from)) {
    console.warn(`[vendor-xterm] MISSING: ${f.from}`);
    console.warn('  Run `npm install` in the OLYMPUS root first.');
    missing++;
    continue;
  }
  try {
    copyFileSync(from, to);
    console.log(`[vendor-xterm] OK ${f.to}`);
    ok++;
  } catch (err) {
    console.error(`[vendor-xterm] FAILED ${f.to}: ${err.message}`);
    missing++;
  }
}

console.log(`[vendor-xterm] ${ok} copied, ${missing} missing`);
if (missing > 0) process.exit(1);
