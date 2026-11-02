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

/**
 * v0.0.34 — the full-catalog resolver. The 24 hand-mapped ids keep their
 * exact study; every other row (860+ upstream components) gets a study by
 * category/keyword, so ALL references render something alive without a
 * per-row hand mapping.
 */
export function previewFor(reference: { id: string; name?: string; category?: string }): PreviewSpec {
  const exact = REFERENCE_PREVIEWS[reference.id];
  if (exact) return exact;
  const hay = `${reference.id} ${reference.name ?? ''} ${reference.category ?? ''}`.toLowerCase();
  const seed = [...reference.id].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const rotate = (arr: PreviewSpec[]): PreviewSpec => {
    const spec = arr[seed % arr.length];
    const off = seed % spec.variants.length;
    return { ...spec, variants: [...spec.variants.slice(off), ...spec.variants.slice(0, off)] };
  };
  const GENERIC = [
    REFERENCE_PREVIEWS['svg-particles'], REFERENCE_PREVIEWS['black-hole'], REFERENCE_PREVIEWS['fluid-trail'],
    REFERENCE_PREVIEWS['kinetic-grid'], REFERENCE_PREVIEWS['spiral-images'], REFERENCE_PREVIEWS['coverflow-carousel'],
    REFERENCE_PREVIEWS['skiper-cursor-trail'], REFERENCE_PREVIEWS['skiper-image-reveal'], REFERENCE_PREVIEWS['pixel-reveal'],
    REFERENCE_PREVIEWS['star-burst'], REFERENCE_PREVIEWS['blinking-squares'], REFERENCE_PREVIEWS['snow-fall'],
  ];
  const ANIM = [
    REFERENCE_PREVIEWS['svg-particles'], REFERENCE_PREVIEWS['star-burst'], REFERENCE_PREVIEWS['snow-fall'],
    REFERENCE_PREVIEWS['blinking-squares'], REFERENCE_PREVIEWS['pixel-reveal'], REFERENCE_PREVIEWS['kinetic-grid'],
    REFERENCE_PREVIEWS['black-hole'],
  ];
  const TEXT = [
    REFERENCE_PREVIEWS['weight-hover'], REFERENCE_PREVIEWS['text-morph'],
    REFERENCE_PREVIEWS['scramble-text'], REFERENCE_PREVIEWS['smoky-text'],
  ];
  if (/cursor|pointer|mouse/.test(hay)) return REFERENCE_PREVIEWS['skiper-cursor-trail'];
  if (/loader|preload|spinner|loading/.test(hay)) return REFERENCE_PREVIEWS['blinking-squares'];
  if (/island|pill|notification/.test(hay)) return REFERENCE_PREVIEWS['skiper-dynamic-island'];
  if (/member|team|avatar|testimonial/.test(hay)) return REFERENCE_PREVIEWS['skiper-hover-members'];
  if (/tooltip|hint|microcopy/.test(hay)) return REFERENCE_PREVIEWS['skiper-vercel-tooltip'];
  if (/swap|token|coin|wallet|finance|price/.test(hay)) return REFERENCE_PREVIEWS['skiper-token-swap'];
  if (/gallery|carousel|slider|coverflow|showcase/.test(hay)) {
    if (/swipe|stack|card/.test(hay)) return REFERENCE_PREVIEWS['swipe-stack'];
    if (/infinite|canvas|panorama/.test(hay)) return REFERENCE_PREVIEWS['infinity-canvas'];
    if (/spiral|orbit/.test(hay)) return REFERENCE_PREVIEWS['spiral-images'];
    if (/coverflow|album|flow/.test(hay)) return REFERENCE_PREVIEWS['coverflow-carousel'];
    return rotate([
      REFERENCE_PREVIEWS['coverflow-carousel'], REFERENCE_PREVIEWS['spiral-images'],
      REFERENCE_PREVIEWS['infinity-canvas'], REFERENCE_PREVIEWS['swipe-stack'],
    ]);
  }
  if (/text|type|word|font|glyph|letter|typography|scramble|morph|weight|ascii/.test(hay)) {
    if (/smoke|ink|plume/.test(hay)) return REFERENCE_PREVIEWS['smoky-text'];
    if (/scramble|decode|rain/.test(hay)) return REFERENCE_PREVIEWS['scramble-text'];
    if (/morph|appear|sequence|flow/.test(hay)) return REFERENCE_PREVIEWS['text-morph'];
    if (/weight|hover|bold/.test(hay)) return REFERENCE_PREVIEWS['weight-hover'];
    return rotate(TEXT);
  }
  if (/button|cta|toggle/.test(hay)) {
    if (/emoji|burst|celebrat|confetti/.test(hay)) return REFERENCE_PREVIEWS['emoji-burst'];
    if (/link|preview/.test(hay)) return REFERENCE_PREVIEWS['link-preview'];
    return REFERENCE_PREVIEWS['star-burst'];
  }
  if (/border|frame|outline|ring/.test(hay)) return REFERENCE_PREVIEWS['kinetic-grid'];
  if (/snow|rain|fall|petal|leaf/.test(hay)) return REFERENCE_PREVIEWS['snow-fall'];
  if (/pixel|mosaic|halftone|dither|led/.test(hay)) return REFERENCE_PREVIEWS['pixel-reveal'];
  if (/blink|cell|scan|square/.test(hay)) return REFERENCE_PREVIEWS['blinking-squares'];
  if (/image|photo|portrait|reveal|picture/.test(hay)) return REFERENCE_PREVIEWS['skiper-image-reveal'];
  if (/trail/.test(hay)) return REFERENCE_PREVIEWS['skiper-cursor-trail'];
  if (/particle|spark|star|dot|dust|glitter|sequin/.test(hay)) return REFERENCE_PREVIEWS['svg-particles'];
  if (/grid|mesh|lattice|wire|terrain/.test(hay)) return REFERENCE_PREVIEWS['kinetic-grid'];
  if (/orb|sphere|torus|vortex|tunnel|hole|plasma|crater|nebula|galaxy/.test(hay)) return REFERENCE_PREVIEWS['black-hole'];
  if (/fluid|ribbon|flow|liquid|smoke|ink|wave|silk/.test(hay)) return REFERENCE_PREVIEWS['fluid-trail'];
  if (/emoji|joy|play/.test(hay)) return REFERENCE_PREVIEWS['emoji-burst'];
  if (/animation|background|field|ambient|drift/.test(hay)) return rotate(ANIM);
  // The generic interactive shelf: a stable per-id rotation keeps the grid
  // visually varied instead of painting 400 cards with the same dots.
  return rotate(GENERIC);
}
