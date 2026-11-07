/**
 * theme-manifest.ts — v0.0.85: the themed PWA surface for the phone.
 *
 * The widget became installable in v0.0.84 with a static gold manifest. The
 * mobile companion had no manifest at all. v0.0.85 makes BOTH surfaces real
 * PWAs with the SAME mark, but paints that mark with the active theme:
 * `/m/manifest.webmanifest` and `/m/widget/manifest.webmanifest` are generated
 * per request from `~/.olympus/theme.json`, and `/m/icon/<size>` renders the
 * favicon SVG through sharp. The manifest carries a theme hash in the icon
 * URL, so a theme change is a new icon URL (no stale gold icon).
 *
 * If sharp is absent the icon route falls back to the themed SVG; the app
 * stays installable, and the file is honest about the fallback.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_THEME,
  normalizeThemeState,
  resolvePalette,
  themedFaviconSvg,
  type ThemeState,
} from './theme';

export type MobileSurface = 'app' | 'widget';

/** The private home (respects the dev override used by the test lane). */
export function olympusHomeDir(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

/** Read the store; a missing/corrupt file means the default theme, never a crash. */
export function readThemeState(): ThemeState {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(olympusHomeDir(), 'theme.json'), 'utf-8'));
    return normalizeThemeState(raw);
  } catch {
    return DEFAULT_THEME;
  }
}

/** A short content hash of the theme — the icon cache-buster. */
export function themeVersion(state: ThemeState = readThemeState()): string {
  const palette = resolvePalette(state);
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ state, palette }))
    .digest('hex')
    .slice(0, 10);
}

/**
 * The app icon in the active palette.
 *
 * `maskable` insets the 64-unit mark inside an 80-unit full-bleed field so the
 * Android safe zone (80%) is respected; the standard icon keeps the badge.
 */
export function themedAppIconSvg(state: ThemeState, opts: { maskable?: boolean } = {}): string {
  const svg = themedFaviconSvg(state);
  if (!opts.maskable) return svg;
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const bg = resolvePalette(state).bg;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${bg}"/><g transform="translate(8 8)">${inner}</g></svg>`;
}

/** The Web App Manifest for one of the two phone surfaces. */
export interface MobileManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  orientation: 'portrait';
  background_color: string;
  theme_color: string;
  categories: string[];
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
  shortcuts: Array<{ name: string; short_name: string; description: string; url: string; icons: Array<{ src: string; sizes: string; type: string }> }>;
  prefer_related_applications: boolean;
}

export function mobileManifest(surface: MobileSurface, state: ThemeState = readThemeState()): MobileManifest {
  const palette = resolvePalette(state);
  const version = themeVersion(state);
  const widget = surface === 'widget';
  const icon = (size: number, maskable = false) =>
    `/m/icon/${size}?v=${version}${maskable ? '&maskable=1' : ''}`;
  const iconList = (size: number) => [{ src: icon(size), sizes: `${size}x${size}`, type: 'image/png' }];

  return {
    // Two installable apps, one identity: the same icon and palette, with
    // start_url different so each home-screen icon opens its own surface.
    // Scope /m covers both, so the in-app switcher never leaves the window.
    id: widget ? '/m/widget' : '/m',
    name: widget ? 'OLYMPUS Live' : 'OLYMPUS Mobile',
    short_name: widget ? 'OLYMPUS Live' : 'OLYMPUS',
    description: widget
      ? 'Live campaign progress, GO Plus usage, hops and the terminal queue — no PC screen.'
      : 'The OLYMPUS companion: voice, campaign, preview and the gods in your pocket.',
    start_url: widget ? '/m/widget' : '/m',
    scope: '/m',
    display: 'standalone',
    orientation: 'portrait',
    background_color: palette.bg,
    // v0.0.87 — the PWA/system status bar follows the active theme's
    // background, never the gold accent (the Android status strip was gold
    // on a dark theme). The accent stays in the icon and the in-app chrome.
    theme_color: palette.bg,
    categories: ['productivity', 'utilities'],
    icons: [
      { src: icon(192), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon(512), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon(512, true), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      widget
        ? { name: 'OLYMPUS Mobile', short_name: 'App', description: 'Open the mobile companion', url: '/m', icons: iconList(192) }
        : { name: 'OLYMPUS Live', short_name: 'Live', description: 'Open the live widget', url: '/m/widget', icons: iconList(192) },
    ],
    prefer_related_applications: false,
  };
}
