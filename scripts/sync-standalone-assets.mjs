#!/usr/bin/env node
/**
 * sync-standalone-assets.mjs — COMPLETE the standalone output (v0.0.25).
 *
 * `next build` writes JS/CSS to `.next/static/` and the public tree to
 * `public/`, but it does NOT copy them into `.next/standalone/`. Two
 * consumers need them there:
 *   - `olympus start` (source run) spawns `.next/standalone/server.js`;
 *   - the packaged app ships `.next/standalone` as `next-standalone`.
 *
 * Electron main copies them at boot for source runs, and electron-builder
 * copies them for packages — but a bare `node .next/standalone/server.js`
 * (the boot smoke, CI, a debug session) served a page whose pane chunks
 * 404'd. This step makes the standalone tree self-sufficient and lets
 * scripts/verify-standalone.mjs assert the real artifact.
 *
 * Idempotent: a copy runs only when the destination is missing or its file
 * count differs; a rebuild wipes `.next/` so the copy is fresh.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone');

function countFiles(dir) {
  let n = 0;
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else n++;
    }
  };
  walk(dir);
  return n;
}

function sync(from, to, label) {
  if (!fs.existsSync(from)) return `skip ${label} (source absent)`;
  const srcCount = countFiles(from);
  const dstCount = fs.existsSync(to) ? countFiles(to) : -1;
  if (srcCount > 0 && srcCount === dstCount) return `ok ${label} (${srcCount} files)`;
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  return `copied ${label} (${srcCount} files)`;
}

if (!fs.existsSync(STANDALONE)) {
  console.error('sync-standalone-assets: .next/standalone is missing — run `next build` first.');
  process.exit(1);
}

const results = [
  sync(path.join(ROOT, '.next', 'static'), path.join(STANDALONE, '.next', 'static'), '.next/static'),
  sync(path.join(ROOT, 'public'), path.join(STANDALONE, 'public'), 'public'),
];
for (const line of results) console.log(`[standalone] ${line}`);
