/**
 * theme-store.ts — v0.0.32: the client theme state (one store, instant apply).
 *
 * localStorage is the instant source (a theme must not flash), the API is the
 * truth across restarts (`~/.olympus/theme.json`). Every change repaints the
 * CSS variables on <html> and notifies subscribers; no component reads the
 * palette directly.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
'use client';

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_THEME,
  applyTheme,
  normalizeThemeState,
  presetById,
  resolvePalette,
  themedFaviconSvg,
  type ThemeState,
} from './theme';

const LS_KEY = 'olympus:theme';
let state: ThemeState = DEFAULT_THEME;
let initialized = false;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const fn of subscribers) fn();
}

function repaint(next: ThemeState): void {
  if (typeof document === 'undefined') return;
  applyTheme(next, document.documentElement as unknown as {
    setAttribute(n: string, v: string): void;
    style: { setProperty(n: string, v: string): void };
  });
  // The tab/window icon follows the palette too (no static gold favicon).
  try {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = `data:image/svg+xml,${encodeURIComponent(themedFaviconSvg(next))}`;
  } catch { /* no head yet */ }
}

export function getThemeState(): ThemeState {
  return state;
}

export function subscribeTheme(fn: () => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

/**
 * Apply a (partial) theme immediately, persist to localStorage and the API.
 * `persist: false` is used by init (the loaded value is already the truth).
 */
export function setThemeState(patch: Partial<ThemeState>, opts: { persist?: boolean } = {}): void {
  const merged = normalizeThemeState({ ...state, ...patch });
  // Selecting a preset of the other mode flips the mode with it.
  if (patch.presetId && !patch.mode) merged.mode = presetById(merged.presetId).mode;
  state = merged;
  repaint(state);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    localStorage.setItem('olympus:theme-palette', JSON.stringify({ ...resolvePalette(state), _mode: state.mode }));
  } catch { /* private mode */ }
  emit();
  if (opts.persist !== false) {
    try {
      void fetch('/api/olympus/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      }).catch(() => { /* offline: localStorage already holds it */ });
    } catch { /* offline */ }
  }
}

/** Load once: localStorage first (no flash), then the private store. */
export async function initTheme(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      state = normalizeThemeState(JSON.parse(raw));
      repaint(state);
      try { localStorage.setItem('olympus:theme-palette', JSON.stringify({ ...resolvePalette(state), _mode: state.mode })); } catch { /* private */ }
      emit();
    }
  } catch { /* corrupt → default */ }
  repaint(state);
  try {
    const r = await fetch('/api/olympus/theme', { cache: 'no-store' });
    const d = await r.json();
    if (d?.ok && d.state) {
      state = normalizeThemeState(d.state);
      repaint(state);
      try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    localStorage.setItem('olympus:theme-palette', JSON.stringify({ ...resolvePalette(state), _mode: state.mode }));
  } catch { /* private mode */ }
      emit();
    }
  } catch { /* offline: the local theme stands */ }
  // One sync so ~/.olympus/theme.json carries the resolved palette for the
  // Electron splash/tray/window icon even when the user never re-picks.
  try {
    void fetch('/api/olympus/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }).catch(() => {});
  } catch { /* offline */ }
}

/** React hook: the current theme + a setter. */
export function useTheme(): [ThemeState, (patch: Partial<ThemeState>) => void] {
  const current = useSyncExternalStore(subscribeTheme, getThemeState, () => DEFAULT_THEME);
  return [current, (patch) => setThemeState(patch)];
}
