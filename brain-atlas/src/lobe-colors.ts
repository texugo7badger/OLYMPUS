/**
 * lobe-colors.ts — v0.0.34: one DISTINCT palette color per brain region.
 *
 * The old mapping reused semantic kind colors (frontal=gold, temporal=gold,
 * cerebellum=green …), so in themes where two kinds share a hex (Violet's
 * gold and purple, Mint's gold and green) two regions painted the same color.
 * On light palettes the additive cloud pass then washed everything to white
 * or black.
 *
 * This module resolves the six region colors once per palette:
 *   frontal (gold) · parietal (blue) · temporal (warm) ·
 *   occipital (purple) · cerebellum (green) · stem (dim)
 * and, when a preferred color is too close to an already chosen one, picks
 * the candidate with the largest minimum RGB distance; if even that is too
 * close, it synthesizes a tint toward the palette ink. The result is six
 * distinguishable region hues for EVERY theme, still inside that theme's
 * family.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { BrainPalette, LobeName } from './types.ts';

export const LOBE_ORDER: LobeName[] = ['frontal', 'parietal', 'temporal', 'occipital', 'cerebellum', 'stem'];

/** Preference lists — the first available key wins. */
const PREFERRED: Record<LobeName, string[]> = {
  frontal: ['project', 'person', 'decision', 'organization', 'hud'],
  parietal: ['concept', 'tool'],
  temporal: ['workThread', 'question', 'amberSoft'],
  occipital: ['source', 'repo'],
  cerebellum: ['dailyNote'],
  stem: ['index', 'unknown'],
};

/** Extra keys that may replace a collision (all are still theme colors). */
const FALLBACK_KEYS = [
  'incident', 'question', 'workThread', 'source', 'dailyNote', 'concept',
  'project', 'tool', 'repo', 'index', 'unknown', 'person',
];

/** Below this RGB distance two regions read as the same color. */
const MIN_DISTANCE = 52;

const cache = new WeakMap<object, Record<LobeName, string>>();

function parseHex(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  const h = hex.trim().replace('#', '');
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? r : 0, g, b];
}

function distance(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 0;
  return Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]);
}

function minDistance(color: string, used: string[]): number {
  if (used.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...used.map((u) => distance(color, u)));
}

function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(ca[0] + (cb[0] - ca[0]) * t)}${to(ca[1] + (cb[1] - ca[1]) * t)}${to(ca[2] + (cb[2] - ca[2]) * t)}`;
}

/**
 * The six region colors for a palette, cached by palette identity (the
 * renderer calls this for every cloud point and edge segment).
 */
export function lobeColorsForPalette(palette: BrainPalette): Record<LobeName, string> {
  const cached = cache.get(palette);
  if (cached) return cached;

  const kinds = palette.kinds || {};
  const firstFor = (lobe: LobeName): string => {
    for (const key of PREFERRED[lobe]) {
      if (typeof kinds[key] === 'string' && parseHex(kinds[key])) return kinds[key];
    }
    return palette.hud;
  };

  // The full candidate pool, preferred keys first, then the fallback keys.
  const pool: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && parseHex(v) && !pool.includes(v)) pool.push(v);
  };
  for (const lobe of LOBE_ORDER) for (const key of PREFERRED[lobe]) push(kinds[key]);
  for (const key of FALLBACK_KEYS) push(kinds[key]);
  push(palette.hud);

  const out = {} as Record<LobeName, string>;
  const used: string[] = [];
  for (const lobe of LOBE_ORDER) {
    const preferred = firstFor(lobe);
    let chosen = preferred;
    let best = minDistance(preferred, used);
    if (best < MIN_DISTANCE) {
      for (const candidate of pool) {
        const d = minDistance(candidate, used);
        if (d > best) { best = d; chosen = candidate; }
      }
    }
    if (used.length > 0 && best < MIN_DISTANCE) {
      // No palette color is far enough: synthesize a tint toward the ink so
      // the region still separates from the others without leaving the family.
      chosen = mixHex(preferred, palette.fg, 0.4);
    }
    out[lobe] = chosen;
    used.push(chosen);
  }

  cache.set(palette, out);
  return out;
}
