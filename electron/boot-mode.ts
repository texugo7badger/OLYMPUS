/**
 * boot-mode.ts — WHICH SERVER DOES THIS LAUNCH SERVE? (2026-10-24)
 *
 * The decision used to live inline in main.ts as `isDev = !app.isPackaged`,
 * which meant a source run ALWAYS used `next dev`. When production became the
 * default for a source run, the inverse bug appeared: `olympus dev` served a
 * PRODUCTION standalone that was, at that moment, a partial copy from a
 * concurrent `npm run build` — "a screen that did not look like OLYMPUS at
 * all".
 *
 * The rule is now pure and testable (scripts/boot-mode.test.mjs):
 *
 *   1. a PACKAGED app is always production (the artifact IS the app);
 *   2. `--dev` / OLYMPUS_DEV=1 always wins;
 *   3. a source run is production ONLY when a build COMPLETED — proven by the
 *      stamp scripts/electron-postcompile.js writes as the last build step and
 *      scripts/invalidate-build-stamp.js deletes as the first;
 *   4. `--prod` cannot force an incomplete build (that is the specimen);
 *   5. anything else degrades to DEV, loudly — a slow app beats a fake one.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type BootMode = 'development' | 'production';

export interface BootModeInput {
  /** Electron's app.isPackaged. */
  packaged: boolean;
  /** --dev or OLYMPUS_DEV=1. */
  devRequested: boolean;
  /** --prod. */
  prodRequested: boolean;
  /** .next/standalone/server.js (or the packaged next-standalone) exists. */
  hasStandalone: boolean;
  /** The build-complete stamp exists AND describes this artifact. */
  buildStamped: boolean;
}

export interface BootModeDecision {
  mode: BootMode;
  /** Why — logged on every source run so the user never has to guess. */
  reason: string;
}

export function resolveBootMode(input: BootModeInput): BootModeDecision {
  const { packaged, devRequested, prodRequested, hasStandalone, buildStamped } = input;

  if (packaged) {
    return {
      mode: 'production',
      reason: hasStandalone
        ? 'packaged app (the bundled standalone is the application)'
        : 'packaged app but the bundled standalone is MISSING — the install is corrupted',
    };
  }
  if (devRequested) {
    return { mode: 'development', reason: 'requested (--dev / OLYMPUS_DEV=1)' };
  }
  if (!hasStandalone) {
    return { mode: 'development', reason: 'no standalone build on disk — run `npm run build:app` for production' };
  }
  if (!buildStamped) {
    return {
      mode: 'development',
      reason: 'a build is in progress or never completed (no .next/.olympus-build-complete stamp) — refusing to serve a partial build',
    };
  }
  return {
    mode: 'production',
    reason: prodRequested
      ? 'requested (--prod) and the build is complete'
      : 'the build is complete',
  };
}
