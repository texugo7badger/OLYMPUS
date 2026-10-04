#!/usr/bin/env node
/**
 * scripts/olympus-overlay-postcompile.js
 *
 * Runs after `tsc --project .opencode/olympus/tsconfig.json` to flatten the
 * output directory structure.
 *
 * WHY THIS IS NEEDED
 * ------------------
 * The OLYMPUS overlay at `.opencode/olympus/` imports from
 * `src/lib/symphony/` (the Symphony runtime library). With `module: NodeNext`,
 * TypeScript resolves the `.js` import paths to the `.ts` SOURCE files
 * (preferring .ts over .d.ts when both exist). Without intervention, this
 * triggers TS6059 ("File is not under 'rootDir'") because the Symphony
 * sources live outside the overlay's `rootDir`.
 *
 * The fix is to use `rootDirs: [".", "../../src/lib"]` in the overlay's
 * tsconfig. This tells TypeScript to treat both directories as a single
 * virtual root, so the Symphony sources are no longer "outside rootDir".
 *
 * The side-effect of `rootDirs` is that TypeScript computes output paths
 * relative to the COMMON ANCESTOR of all rootDirs (the project root), which
 * produces a nested dist structure:
 *
 *   .opencode/olympus/dist/.opencode/olympus/index.js   (overlay files)
 *   .opencode/olympus/dist/src/lib/symphony/*.js        (Symphony files)
 *
 * This script flattens the structure back to what OpenCode expects:
 *
 *   .opencode/olympus/dist/index.js                     (overlay files)
 *
 * The Symphony .js files in `dist/src/lib/symphony/` are REMOVED — they
 * are NOT needed at runtime, because the overlay's compiled JS imports
 * from `../../../../src/lib/symphony/index.js`, which resolves at runtime
 * to the pre-compiled `src/lib/symphony/index.js` (shipped with the
 * package). The Symphony overlay tools (symphony-resonate, etc.) are
 * dormant by design — they are only registered if a future caller wires
 * them up via `./symphony/symphony-hooks.js`.
 *
 * Idempotent — safe to run multiple times. No-ops if the dist is already
 * flat.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { copyFileSync, existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The overlay's dist directory: <root>/.opencode/olympus/dist
const distDir = join(__dirname, '..', '.opencode', 'olympus', 'dist');
// The nested overlay directory: <root>/.opencode/olympus/dist/.opencode/olympus
const nestedOverlayDir = join(distDir, '.opencode', 'olympus');
// The nested Symphony directory: <root>/.opencode/olympus/dist/src
const nestedSrcDir = join(distDir, 'src');

function log(msg) { console.log(`[olympus:overlay-postcompile] ${msg}`); }
function warn(msg) { console.warn(`[olympus:overlay-postcompile] ⚠ ${msg}`); }

if (existsSync(distDir)) {
  log(`Flattening nested dist/.opencode/olympus/ -> dist/`);

  // Search for the nested overlay directory at ANY depth.
  // The `rootDirs` setting causes TypeScript to compute output paths
  // relative to the COMMON ANCESTOR of all rootDirs. Depending on the
  // project's absolute path, the nested overlay directory may appear at:
  //   dist/.opencode/olympus/         (when project root is the common ancestor)
  //   dist/<basename>/.opencode/olympus/  (when a subdirectory is the common ancestor)
  // We recursively search for the first `.opencode/olympus/` directory
  // under dist/ and flatten it.
  function findNestedOverlay(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === '.opencode') {
          const overlayDir = join(dir, entry.name, 'olympus');
          if (existsSync(overlayDir)) return overlayDir;
        }
        // Recurse into subdirectories (but skip 'src' — that's the
        // Symphony runtime which we delete separately).
        if (entry.name !== 'src' && entry.name !== 'node_modules') {
          const found = findNestedOverlay(join(dir, entry.name));
          if (found) return found;
        }
      }
    }
    return null;
  }

  const nestedOverlay = findNestedOverlay(distDir);
  if (nestedOverlay) {
    log(`Found nested overlay at: ${relative(distDir, nestedOverlay)}`);
    for (const entry of readdirSync(nestedOverlay)) {
      const src = join(nestedOverlay, entry);
      const dst = join(distDir, entry);
      // If the destination already exists (e.g. from a previous run), remove
      // it first. renameSync would throw EEXIST otherwise.
      if (existsSync(dst)) {
        try { rmSync(dst, { recursive: true, force: true }); } catch {}
      }
      try {
        renameSync(src, dst);
      } catch (err) {
        warn(`Failed to move ${entry}: ${err.message}`);
      }
    }
    // Remove the now-empty nested .opencode/ directory tree.
    // Walk up from nestedOverlay and delete each empty ancestor up to distDir.
    let dir2 = dirname(nestedOverlay);
    while (dir2 !== distDir && dir2.startsWith(distDir)) {
      try {
        const entries = readdirSync(dir2);
        if (entries.length === 0) {
          rmSync(dir2, { recursive: true, force: true });
        }
        dir2 = dirname(dir2);
      } catch { break; }
    }
    log(`Flattened overlay output.`);
  } else {
    log(`No nested .opencode/olympus/ directory found — dist is already flat.`);
  }
} else {
  log(`dist directory does not exist yet (${distDir}) — nothing to do.`);
  process.exit(0);
}

// 2. SYNC the emitted src/lib artifacts back into the shipped tree, then
//    remove dist/src/.
//
// The overlay tsc (rootDirs) emits the src/lib/symphony + vault-root
// sources it compiled into dist/src/. Those sources are ALSO shipped as
// compiled .js artifacts next to their .ts in src/lib/ — and before
// MADRUGA-3 p2 those artifacts could go STALE (the .ts moved to
// getVaultRoot() while the shipped .js still read process.env directly —
// the D22/D21 class). This sync makes every overlay:compile refresh the
// shipped artifacts, so "works in src" and "deployed artifact" can never
// diverge again (R12).
//
// Rule: only refresh files that ALREADY have a shipped counterpart — the
// sync never invents new files in src/lib.
if (existsSync(nestedSrcDir)) {
  let synced = 0;
  function syncDir(emittedDir, shippedDir) {
    if (!existsSync(emittedDir)) return;
    for (const entry of readdirSync(emittedDir, { withFileTypes: true })) {
      const em = join(emittedDir, entry.name);
      const sh = join(shippedDir, entry.name);
      if (entry.isDirectory()) {
        syncDir(em, sh);
      } else if (entry.name.endsWith('.ts')) {
        // .ts inputs are also emitted here; never overwrite a source.
        continue;
      } else if (existsSync(sh)) {
        copyFileSync(em, sh);
        synced++;
      } else if (entry.name.endsWith('.d.ts') && existsSync(sh.replace(/\.d\.ts$/, '.js'))) {
        // A shipped .js without its .d.ts breaks NodeNext resolution of
        // `.js` import specifiers (vault-root pre-p2). Ship the types too.
        copyFileSync(em, sh);
        synced++;
      }
    }
  }
  try {
    syncDir(join(distDir, 'src'), join(__dirname, '..', 'src'));
    log(`Synced ${synced} shipped src/lib artifact(s) from the overlay compile.`);
  } catch (err) {
    warn(`Artifact sync failed: ${err.message}`);
  }
  log(`Removing dist/src/ (Symphony runtime not needed in overlay dist).`);
  try { rmSync(nestedSrcDir, { recursive: true, force: true }); } catch {}
  log(`Removed dist/src/.`);
}

// 3. Verify the overlay entry point exists.
const entryPoint = join(distDir, 'index.js');
if (existsSync(entryPoint)) {
  log(`✓ Overlay entry point present: .opencode/olympus/dist/index.js`);
} else {
  warn(`Overlay entry point MISSING: .opencode/olympus/dist/index.js`);
  warn(`  The overlay compile may have failed. Check the tsc output above.`);
  process.exit(1);
}

log(`Overlay post-compile complete.`);
