/**
 * god-tint.ts — v0.0.64: one god → one theme color.
 *
 * The studio, the crystal cuts, the progress bars and the activity rows all
 * need the same tint for a god. This is the single map (theme palette keys,
 * never invented hexes); unknown gods fall back to cyan.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { OlympusPalette } from './theme';

const GOD_TINT: Record<string, keyof OlympusPalette> = {
  apollo: 'gold',
  atlas: 'amberSoft',
  artemis: 'red',
  athena: 'purple',
  dionysus: 'green',
  hephaestus: 'blue',
  hermes: 'cyan',
  persephone: 'amber',
  prometheus: 'teal',
  callimachus: 'amberSoft',
};

export function godTintHex(palette: OlympusPalette, god: string | null | undefined): string {
  const key = String(god || '').toLowerCase().replace(/^god:/, '');
  const slot = GOD_TINT[key] ?? 'cyan';
  return palette[slot] ?? palette.cyan;
}

export function godTintKey(god: string | null | undefined): keyof OlympusPalette {
  const key = String(god || '').toLowerCase().replace(/^god:/, '');
  return GOD_TINT[key] ?? 'cyan';
}
