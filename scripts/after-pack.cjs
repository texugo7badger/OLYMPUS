/**
 * after-pack.cjs — THE COMPLETE STANDALONE COPY (v0.0.25).
 *
 * THE SPECIMEN (the shipped AppImage): `resources/next-standalone` contained
 * docs + src but NO node_modules — electron-builder's extraResources dropped
 * the directory, and the packaged server died at boot with
 * "Error: Cannot find module 'next'". The AppImage could never start; only
 * source runs (`olympus start`) worked.
 *
 * This hook copies the COMPLETE `.next/standalone` tree (which
 * scripts/sync-standalone-assets.mjs has already completed with
 * .next/static + public) into `resources/next-standalone`, bypassing the
 * extraResources filter, and verifies the critical modules are present.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

const fs = require('node:fs');
const path = require('node:path');

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

module.exports = async function afterPack(context) {
  const projectDir = context.packager?.projectDir || process.cwd();
  const appOutDir = context.appOutDir;
  const src = path.join(projectDir, '.next', 'standalone');
  const dst = path.join(appOutDir, 'resources', 'next-standalone');

  if (!fs.existsSync(src)) {
    throw new Error(`after-pack: missing ${src} — run \`next build\` first`);
  }

  console.log(`[after-pack] copying the complete standalone tree → ${dst}`);
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true, dereference: false, verbatimSymlinks: true });

  // The exact crash we are preventing: no node_modules, no next/ws.
  const required = [
    'server.js',
    'node_modules/next/package.json',
    'node_modules/ws/lib/websocket.js',
    'node_modules/react/package.json',
    '.next/BUILD_ID',
    '.next/static/chunks',
  ];
  const missing = required.filter((rel) => !fs.existsSync(path.join(dst, rel)));
  if (missing.length > 0) {
    throw new Error(`after-pack: the packaged standalone is incomplete — missing ${missing.join(', ')}`);
  }

  const files = countFiles(dst);
  console.log(`[after-pack] standalone ready: ${files} files (next + ws + react + chunks present)`);
};
