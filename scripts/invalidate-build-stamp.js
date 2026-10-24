/**
 * scripts/invalidate-build-stamp.js — the PRE-build half of the
 * build-complete stamp (2026-10-24).
 *
 * THE SPECIMEN: `olympus dev` was launched while `olympus build` was still
 * running. Electron found `.next/standalone/server.js` (a partial copy) and
 * served it — a screen that did not look like OLYMPUS at all.
 *
 * `scripts/electron-postcompile.js` writes `.next/.olympus-build-complete`
 * as the LAST step of a build, so the presence of that file means "a build
 * finished". This script deletes it as the FIRST step, so the window
 * "a build is happening right now" is expressible too: no stamp, no
 * production.
 *
 * Wired as `prebuild`, `prebuild:app`, `prebuild:linux` in package.json.
 * Idempotent and never fatal (a missing stamp is already the safe state).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = join(root, '.next', '.olympus-build-complete');

try {
  if (existsSync(stamp)) {
    rmSync(stamp, { force: true });
    console.log('[build-stamp] invalidated — a build is starting; production is disabled until it completes');
  } else {
    console.log('[build-stamp] already absent (no complete build to serve)');
  }
} catch (err) {
  // Never fail the build over a marker file.
  console.warn('[build-stamp] could not invalidate:', err?.message ?? err);
}
