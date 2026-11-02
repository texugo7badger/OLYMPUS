/**
 * design-generator.ts — v0.0.32 (Epic Q): project identity, generated.
 *
 * The Style Board had four fixed presets. A project needs its OWN identity:
 * a palette derived from its name (deterministic, so the same project always
 * starts from the same seed) and logo marks that use it. Everything is pure
 * SVG/CSS — the user picks, the choice is stored with the style, and the
 * brain reads the same file.
 *
 * Not random noise: the seed fixes the family; the user picks the member.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { StylePalette } from './artcraft';

export function hashSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const lig = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] :
    hue < 120 ? [x, c, 0] :
    hue < 180 ? [0, c, x] :
    hue < 240 ? [0, x, c] :
    hue < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export type PaletteScheme = 'analogous' | 'complementary' | 'triadic' | 'split' | 'mono' | 'warm-cool';

export interface GeneratedPalette {
  id: string;
  name: string;
  scheme: PaletteScheme;
  dark: boolean;
  colors: StylePalette;
}

const SCHEMES: Array<{ id: PaletteScheme; name: string; offsets: number[]; dark: boolean }> = [
  { id: 'analogous', name: 'Analogous', offsets: [0, 28, -28], dark: true },
  { id: 'complementary', name: 'Complementary', offsets: [0, 180], dark: true },
  { id: 'triadic', name: 'Triadic', offsets: [0, 120, 240], dark: true },
  { id: 'split', name: 'Split', offsets: [0, 150, 210], dark: false },
  { id: 'mono', name: 'Monochrome', offsets: [0, 8, -8], dark: false },
  { id: 'warm-cool', name: 'Warm / Cool', offsets: [0, 180], dark: false },
];

/**
 * Six palettes from one seed. Dark schemes keep the OLYMPUS discipline (low
 * saturation surfaces, one accent); light schemes flip the luminance and
 * darken the accent enough to stay legible on white.
 */
export function generatePalettes(seed: string, count = 6): GeneratedPalette[] {
  const h = hashSeed(seed || 'olympus');
  const baseHue = h % 360;
  return SCHEMES.slice(0, Math.max(1, Math.min(count, SCHEMES.length))).map((scheme) => {
    const accentHue = baseHue + scheme.offsets[0];
    const altHue = baseHue + (scheme.offsets[1] ?? scheme.offsets[0]);
    const thirdHue = baseHue + (scheme.offsets[2] ?? altHue);
    const dark = scheme.dark;
    const colors: StylePalette = dark
      ? {
          bg: hslToHex(accentHue, 0.22, 0.06),
          surface: hslToHex(accentHue, 0.20, 0.10),
          accent: hslToHex(accentHue, 0.55, 0.58),
          text: hslToHex(accentHue, 0.10, 0.90),
          muted: hslToHex(altHue, 0.12, 0.58),
        }
      : {
          bg: hslToHex(accentHue, 0.35, 0.965),
          surface: hslToHex(accentHue, 0.30, 0.985),
          accent: hslToHex(accentHue, 0.58, 0.40),
          text: hslToHex(thirdHue, 0.18, 0.14),
          muted: hslToHex(altHue, 0.12, 0.42),
        };
    return { id: `${scheme.id}-${h.toString(36)}`, name: scheme.name, scheme: scheme.id, dark, colors };
  });
}

export interface GeneratedLogo {
  id: string;
  name: string;
  svg: string;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] ?? c));
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'O';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const FONTS = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';

/**
 * Six mark families for the project. Deterministic from the name; each mark
 * is a standalone 96×96 SVG using the supplied palette (accent on the dark
 * surface, or the inverse for the light variants).
 */
export function generateLogos(opts: {
  name: string;
  accent: string;
  bg: string;
  text: string;
  count?: number;
}): GeneratedLogo[] {
  const name = opts.name || 'Project';
  const mono = initials(name);
  const accent = opts.accent;
  const bg = opts.bg;
  const text = opts.text;
  const marks: GeneratedLogo[] = [
    {
      id: 'ring', name: 'Ring monogram',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><circle cx="48" cy="48" r="44" fill="${bg}"/><circle cx="48" cy="48" r="38" fill="none" stroke="${accent}" stroke-width="2.5"/><text x="48" y="60" text-anchor="middle" font-family="${FONTS}" font-size="30" font-weight="600" fill="${accent}">${escapeXml(mono)}</text></svg>`,
    },
    {
      id: 'peak', name: 'Peak',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><rect width="96" height="96" rx="18" fill="${bg}"/><path d="M48 18 L78 72 H18 Z" fill="none" stroke="${accent}" stroke-width="3" stroke-linejoin="round"/><path d="M48 40 L61 72 H35 Z" fill="${accent}" opacity=".85"/><circle cx="48" cy="14" r="3" fill="${text}" opacity=".8"/></svg>`,
    },
    {
      id: 'hex', name: 'Hex monogram',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><rect width="96" height="96" rx="18" fill="${bg}"/><path d="M48 12 L80 30 V66 L48 84 L16 66 V30 Z" fill="none" stroke="${accent}" stroke-width="2.5"/><text x="48" y="59" text-anchor="middle" font-family="${FONTS}" font-size="26" font-weight="700" fill="${accent}">${escapeXml(mono)}</text></svg>`,
    },
    {
      id: 'orbit', name: 'Orbit',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><rect width="96" height="96" rx="18" fill="${bg}"/><circle cx="48" cy="48" r="26" fill="none" stroke="${accent}" stroke-width="2"/><ellipse cx="48" cy="48" rx="38" ry="15" fill="none" stroke="${accent}" stroke-width="1.4" opacity=".55" transform="rotate(-24 48 48)"/><circle cx="48" cy="48" r="6" fill="${accent}"/><circle cx="82" cy="36" r="3" fill="${text}" opacity=".85"/></svg>`,
    },
    {
      id: 'cut', name: 'Cut square',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><rect width="96" height="96" rx="18" fill="${bg}"/><path d="M18 18 H64 L78 32 V78 H32 L18 64 Z" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linejoin="round"/><text x="48" y="61" text-anchor="middle" font-family="${FONTS}" font-size="24" font-weight="700" fill="${accent}">${escapeXml(mono)}</text></svg>`,
    },
    {
      id: 'word', name: 'Wordmark',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 96" width="240" height="96"><rect width="240" height="96" rx="18" fill="${bg}"/><text x="120" y="58" text-anchor="middle" font-family="${FONTS}" font-size="30" font-weight="600" letter-spacing="4" fill="${accent}">${escapeXml(name.toUpperCase().slice(0, 14))}</text><line x1="48" y1="70" x2="192" y2="70" stroke="${text}" stroke-width="1.5" opacity=".4"/></svg>`,
    },
  ];
  return marks.slice(0, Math.max(1, Math.min(opts.count ?? 6, marks.length)));
}
