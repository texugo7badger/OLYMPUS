/**
 * design-skin.ts — v0.0.92: the Athena design surface follows the project.
 *
 * The design studio and the in-chat choice card used the OLYMPUS purple/gold
 * skin everywhere. The contract already carries the project's palette, type,
 * radius and density as prose; this module extracts the usable tokens and
 * exposes them as one small skin. When the contract has no usable color, the
 * fallback is the neutral OLYMPUS surface — never a hard-coded purple.
 *
 * Pure (no node:fs) so it runs in the client bundle.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export interface DesignSkin {
  accent: string;
  accentSoft: string;
  surface: string;
  elevated: string;
  border: string;
  text: string;
  radius: number;
  font?: string;
  density: 'compact' | 'comfortable' | 'spacious';
  source: 'contract' | 'fallback';
}

const FALLBACK: DesignSkin = {
  accent: '#D4A574',
  accentSoft: 'rgba(212,165,116,0.14)',
  surface: '#0B0E13',
  elevated: '#11151D',
  border: 'rgba(212,165,116,0.24)',
  text: '#E8E3D9',
  radius: 8,
  density: 'comfortable',
  source: 'fallback',
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || !/^[0-9a-f]{6}$/i.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex), b = hexToRgb(target);
  if (!a || !b) return hex;
  return rgbToHex(a.r + (b.r - a.r) * amount, a.g + (b.g - a.g) * amount, a.b + (b.b - a.b) * amount);
}

function hueFamily(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'neutral';
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (s < 0.12) return l > 0.6 ? 'light' : 'neutral';
  if (h < 15 || h >= 345) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 200) return 'cyan';
  if (h < 260) return 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}

function firstColorAfter(text: string, words: string[]): string | undefined {
  for (const word of words) {
    const re = new RegExp(`${word}[^#]{0,80}?(#[0-9a-fA-F]{3,8})`, 'i');
    const m = text.match(re);
    if (m) return m[1];
  }
  return undefined;
}

export function skinFromContract(contract: any): DesignSkin {
  const tokens = contract?.tokens && typeof contract.tokens === 'object' ? contract.tokens : {};
  const palette = String(tokens.palette || '');
  const all = Array.from(new Set(palette.match(/#[0-9a-fA-F]{3,8}/g) ?? []));
  if (!palette && all.length === 0) return { ...FALLBACK };

  const surface = firstColorAfter(palette, ['background', 'base', 'bed', 'canvas', 'surface'])
    ?? all.find((c) => { const rgb = hexToRgb(c); if (!rgb) return false; const { l } = rgbToHsl(rgb.r, rgb.g, rgb.b); return l < 0.22; })
    ?? FALLBACK.surface;
  const elevated = firstColorAfter(palette, ['elevated', 'card', 'raised', 'panel'])
    ?? all.find((c) => c !== surface && (() => { const rgb = hexToRgb(c); if (!rgb) return false; const { l } = rgbToHsl(rgb.r, rgb.g, rgb.b); return l < 0.32; })())
    ?? FALLBACK.elevated;
  const text = firstColorAfter(palette, ['text', 'ink', 'foreground', 'cream'])
    ?? all.find((c) => { const rgb = hexToRgb(c); if (!rgb) return false; const { l } = rgbToHsl(rgb.r, rgb.g, rgb.b); return l > 0.72; })
    ?? FALLBACK.text;

  const accent = firstColorAfter(palette, ['accent', 'primary', 'brand', 'highlight'])
    ?? all
      .filter((c) => c !== surface && c !== elevated && c !== text)
      .map((c) => {
        const rgb = hexToRgb(c)!;
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        return { c, score: hsl.s * 2 + (hsl.l > 0.25 && hsl.l < 0.75 ? 0.6 : 0) };
      })
      .sort((a, b) => b.score - a.score)[0]?.c
    ?? FALLBACK.accent;

  const radii = (String(tokens.radius || '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n >= 0 && n <= 24);
  const radius = radii.length ? Math.max(...radii) : FALLBACK.radius;
  const densityText = `${tokens.density || ''} ${tokens.spacing || ''}`.toLowerCase();
  const density = /compact|dense|tight/.test(densityText) ? 'compact' : /spacious|airy|roomy/.test(densityText) ? 'spacious' : 'comfortable';
  const typeText = String(tokens.type || '');
  const fontMatch = typeText.match(/[“"']([^”"']{2,40})[”"']/);
  const font = fontMatch?.[1];

  return {
    accent,
    accentSoft: `color-mix(in srgb, ${accent} 14%, transparent)`,
    surface,
    elevated,
    border: mix(accent, surface, 0.62),
    text,
    radius,
    font,
    density,
    source: 'contract',
  };
}

export function fallbackSkin(): DesignSkin {
  return { ...FALLBACK };
}

/** Inline CSS variables for a subtree; keeps Tailwind classes readable. */
export function skinVars(skin: DesignSkin): React.CSSProperties {
  return {
    '--athena-accent': skin.accent,
    '--athena-accent-soft': skin.accentSoft,
    '--athena-surface': skin.surface,
    '--athena-elevated': skin.elevated,
    '--athena-border': skin.border,
    '--athena-text': skin.text,
    '--athena-radius': `${skin.radius}px`,
    ...(skin.font ? { '--athena-font': skin.font } : {}),
  } as React.CSSProperties;
}

/** The density-derived padding for the studio's content. */
export function densityPad(skin: DesignSkin): number {
  return skin.density === 'compact' ? 8 : skin.density === 'spacious' ? 20 : 12;
}

export { hueFamily };
