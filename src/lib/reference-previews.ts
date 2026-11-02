/**
 * reference-previews.ts — v0.0.34: native preview specs for the reference
 * catalog.
 *
 * The card must show the COMPONENT, not the vendor's web page (the embedded
 * page carried its own chrome, a login banner and a "limited in sections"
 * modal). Each reference now renders a self-contained, interactive study of
 * the component inside OLYMPUS, in the active theme, with 2–3 switchable
 * variations exposed as OLYMPUS buttons (never inside the preview).
 *
 * The study is not a copy of the upstream source: it is an original canvas
 * interpretation of the same interaction, so the licenses stay upstream and
 * the card can run offline at 60 FPS.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type PreviewKind =
  | 'blackhole' | 'fluid' | 'particles' | 'grid'
  | 'spiral' | 'coverflow' | 'stack' | 'canvas'
  | 'smoke' | 'morph' | 'scramble' | 'weight'
  | 'pixel' | 'burst' | 'snow' | 'blink'
  | 'emoji' | 'link' | 'reveal' | 'island'
  | 'members' | 'tooltip' | 'swap' | 'trail';

export interface PreviewSpec {
  kind: PreviewKind;
  /** The OLYMPUS-side variations, shown as buttons outside the preview. */
  variants: string[];
}

const FALLBACK: PreviewSpec = { kind: 'particles', variants: ['drift', 'constellation', 'vortex'] };

export const REFERENCE_PREVIEWS: Record<string, PreviewSpec> = {
  // OriginKit — interactive elements
  'black-hole': { kind: 'blackhole', variants: ['gravity', 'warp', 'pulse'] },
  'fluid-trail': { kind: 'fluid', variants: ['ribbon', 'ink', 'comet'] },
  'svg-particles': { kind: 'particles', variants: ['drift', 'constellation', 'vortex'] },
  'kinetic-grid': { kind: 'grid', variants: ['ripple', 'magnetic', 'wave'] },
  // OriginKit — image gallery
  'spiral-images': { kind: 'spiral', variants: ['orbit', 'tunnel'] },
  'coverflow-carousel': { kind: 'coverflow', variants: ['flow', 'fan'] },
  'swipe-stack': { kind: 'stack', variants: ['spring', 'fan'] },
  'infinity-canvas': { kind: 'canvas', variants: ['grid', 'free'] },
  // OriginKit — text
  'smoky-text': { kind: 'smoke', variants: ['ash', 'aurora', 'ink'] },
  'text-morph': { kind: 'morph', variants: ['flow', 'split'] },
  'scramble-text': { kind: 'scramble', variants: ['decode', 'rain'] },
  'weight-hover': { kind: 'weight', variants: ['breathe', 'stretch'] },
  // OriginKit — animation / background / button
  'pixel-reveal': { kind: 'pixel', variants: ['assemble', 'dissolve'] },
  'star-burst': { kind: 'burst', variants: ['stars', 'confetti'] },
  'snow-fall': { kind: 'snow', variants: ['calm', 'storm'] },
  'blinking-squares': { kind: 'blink', variants: ['ambient', 'scan'] },
  'emoji-burst': { kind: 'emoji', variants: ['burst', 'float'] },
  'link-preview': { kind: 'link', variants: ['hover', 'stack'] },
  // Skiper UI
  'skiper-image-reveal': { kind: 'reveal', variants: ['spotlight', 'curtain'] },
  'skiper-dynamic-island': { kind: 'island', variants: ['compact', 'notify'] },
  'skiper-hover-members': { kind: 'members', variants: ['overlap', 'grid'] },
  'skiper-vercel-tooltip': { kind: 'tooltip', variants: ['crisp', 'soft'] },
  'skiper-token-swap': { kind: 'swap', variants: ['aave', 'minimal'] },
  'skiper-cursor-trail': { kind: 'trail', variants: ['images', 'sparkles'] },
};

export function previewSpec(id: string): PreviewSpec {
  return REFERENCE_PREVIEWS[id] ?? FALLBACK;
}
