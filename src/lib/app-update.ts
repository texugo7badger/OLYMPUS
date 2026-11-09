/**
 * app-update.ts — v0.0.92: the startup update box's pure rules.
 *
 * The Electron main process already speaks `electron-updater`; the renderer
 * had no listener, so the box never appeared. These helpers keep the visible
 * decision deterministic: version comparison, preference validation and the
 * release URL. No network here — the component owns the I/O.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export interface UpdatePrefs {
  /** Check for a newer OLYMPUS release when the app opens. Default true. */
  checkOnStartup: boolean;
  /** Start the download as soon as an update is found. Default false. */
  autoDownload: boolean;
}

export const DEFAULT_UPDATE_PREFS: UpdatePrefs = {
  checkOnStartup: true,
  autoDownload: false,
};

export const UPDATE_PREFS_KEY = 'olympus:update-prefs';
export const UPDATE_REPO = 'texugo7badger/OLYMPUS';

/** Numeric semver comparison; missing segments count as 0. */
export function compareVersions(a: string, b: string): number {
  const split = (v: string): number[] => String(v ?? '')
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
  const aa = split(a);
  const bb = split(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const x = aa[i] ?? 0;
    const y = bb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(latest: string | null | undefined, current: string | null | undefined): boolean {
  if (!latest || !current) return false;
  return compareVersions(latest, current) > 0;
}

export function releaseUrl(tagOrVersion: string | null | undefined): string {
  const raw = String(tagOrVersion ?? '').trim();
  if (!raw) return `https://github.com/${UPDATE_REPO}/releases/latest`;
  const tag = /^v/i.test(raw) ? raw : `v${raw}`;
  return `https://github.com/${UPDATE_REPO}/releases/tag/${tag}`;
}

/** Accept only a real object with boolean-like fields; never trust storage. */
export function readUpdatePrefs(raw: unknown): UpdatePrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_UPDATE_PREFS };
  const o = raw as Record<string, unknown>;
  return {
    checkOnStartup: o.checkOnStartup !== false,
    autoDownload: o.autoDownload === true,
  };
}

export function writeUpdatePrefs(prefs: UpdatePrefs): string {
  return JSON.stringify({
    checkOnStartup: prefs.checkOnStartup !== false,
    autoDownload: prefs.autoDownload === true,
  });
}
