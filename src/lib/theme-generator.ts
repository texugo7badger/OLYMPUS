/**
 * theme-generator.ts — v0.0.32: the palette lab.
 *
 * The user should not pick ONE accent; they pick a family. This generator
 * builds all 14 palette keys from a hue + scheme + mode, keeps the OLYMPUS
 * pastel discipline (low saturation surfaces, one clear accent) and enforces
 * the contrast floors programmatically: text/bg >= 7, dim/bg >= 4.5,
 * accent/bg >= 3. Shuffle until something pleases the eye; save it as the
 * default and every surface (logo, loader, brain, system icon) follows.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { hslToHex } from './design-generator';
import { contrastRatio, type OlympusPalette, type ThemeMode } from './theme';

export type PaletteScheme = 'analogous' | 'complementary' | 'triadic' | 'split' | 'mono';

export interface PaletteLabSeed {
  hue: number;
  scheme: PaletteScheme;
  mode: ThemeMode;
}

const SCHEME_OFFSETS: Record<PaletteScheme, number[]> = {
  analogous: [0, 28, -28, 56],
  complementary: [0, 180, 180, 180],
  triadic: [0, 120, 240, 120],
  split: [0, 150, 210, 150],
  mono: [0, 8, -8, 16],
};

export function randomSeed(mode: ThemeMode): PaletteLabSeed {
  const schemes: PaletteScheme[] = ['analogous', 'complementary', 'triadic', 'split', 'mono'];
  return {
    hue: Math.floor(Math.random() * 360),
    scheme: schemes[Math.floor(Math.random() * schemes.length)],
    mode,
  };
}

/** Lift/darken a lightness until the pair clears the floor. */
function ensureContrast(make: (l: number) => string, against: string, floor: number, start: number, up: boolean): string {
  let l = start;
  let candidate = make(l);
  for (let i = 0; i < 24 && contrastRatio(candidate, against) < floor; i += 1) {
    l = Math.min(0.98, Math.max(0.02, l + (up ? 0.02 : -0.02)));
    candidate = make(l);
  }
  return candidate;
}

export function generateThemePalette(seed: PaletteLabSeed): OlympusPalette {
  const { hue, scheme, mode } = seed;
  const [a, b, c, d] = SCHEME_OFFSETS[scheme];
  const dark = mode === 'dark';
  const bg = dark ? hslToHex(hue, 0.20, 0.06) : hslToHex(hue, 0.22, 0.84);
  const panel = dark ? hslToHex(hue, 0.18, 0.10) : hslToHex(hue, 0.22, 0.88);
  const card = dark ? hslToHex(hue, 0.16, 0.14) : hslToHex(hue, 0.20, 0.92);
  // Move TOWARD contrast: light themes darken, dark themes lighten.
  const gold = ensureContrast((l) => hslToHex(hue + a, 0.45, l), bg, 3, dark ? 0.62 : 0.40, dark);
  const text = ensureContrast((l) => hslToHex(hue, 0.10, l), bg, 7, dark ? 0.88 : 0.14, dark);
  const textDim = ensureContrast((l) => hslToHex(hue, 0.10, l), bg, 4.5, dark ? 0.62 : 0.36, dark);
  const semantic = (h: number, l: number) => ensureContrast((x) => hslToHex(h, 0.40, x), bg, 3, l, dark);
  return {
    gold,
    amber: semantic(hue + b, dark ? 0.62 : 0.40),
    blue: semantic(hue + c, dark ? 0.66 : 0.40),
    green: semantic(hue + d, dark ? 0.64 : 0.38),
    amberSoft: semantic(hue + b, dark ? 0.68 : 0.46),
    purple: semantic(hue + c, dark ? 0.68 : 0.42),
    teal: semantic(hue + d, dark ? 0.62 : 0.38),
    red: semantic(hue + 180, dark ? 0.60 : 0.40),
    cyan: semantic(hue + b, dark ? 0.66 : 0.40),
    bg,
    panel,
    card,
    text,
    textDim,
  };
}
