/**
 * ui-references.ts — W-J UI-REFERENCES (v0.0.7): the curated component
 * inspiration catalog — the two community libraries the user picked
 * (2026-10-20) so the gods and demigods have READY UI references at art
 * time instead of inventing generic layouts.
 *
 *   - OriginKit (originkit.dev, vellum-ai/originkit MIT plugin): 250+
 *     animated components; the official MCP server (mcp.originkit.dev/
 *     vellumai) browses free + fetches source on a FREE API key (10/day).
 *   - Skiper UI (skiper-ui.com): 106+ "un-common" shadcn/ui components
 *     (the Emil Kowalski / Rauno motion-craft school); FREE components
 *     install via the shadcn registry, PREMIUM is paid — referenced,
 *     never vendored.
 *
 * The doctrine: OLYMPUS NEVER COPIES these components into its own tree —
 * the catalog carries the WHAT + the demo link + the fetch lane; generated
 * projects install them through the upstream lanes (the shadcn registry /
 * the Originkit MCP), the licenses stay between upstream and the user.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { readOriginkitBudget, formatOriginkitReset } from '@/lib/originkit-budget';

export type UiRefLibrary = 'originkit' | 'skiper';

export interface UiReference {
  /** kebab id (the upstream component name). */
  id: string;
  name: string;
  library: UiRefLibrary;
  category: string;
  /** The one-line craft description — what it IS, for a god picking a pattern. */
  what: string;
  /** The live demo (the pane embeds it when frameable). */
  demoUrl: string;
  /** How a generated project obtains it (the honest lane). */
  fetchLane: string;
  /** false = upstream premium (paid — link-only, never vendored). */
  free: boolean;
}

/** The marquee catalog — curated, not exhaustive (the full libraries live
 *  upstream; this is the curated eye the gods draw from). */
export const UI_REFERENCES: UiReference[] = [
  // ── OriginKit — interactive elements ────────────────────────────────────
  { id: 'black-hole', name: 'Black Hole', library: 'originkit', category: 'Interactive elements', what: 'A gravitational point that warps and pulls surrounding particles — a living hero centerpiece.', demoUrl: 'https://www.originkit.dev/docs/blackhole', fetchLane: 'originkit MCP: fetch blackhole (free API key)', free: true },
  { id: 'fluid-trail', name: 'Fluid Trail', library: 'originkit', category: 'Interactive elements', what: 'The cursor drags a fluid, physics-smooth ribbon — tactile pointer feedback.', demoUrl: 'https://www.originkit.dev/docs/fluidtrail', fetchLane: 'originkit MCP: fetch fluidtrail (free API key)', free: true },
  { id: 'svg-particles', name: 'SVG Particles', library: 'originkit', category: 'Interactive elements', what: 'Lightweight SVG particle field that reacts to hover — depth without WebGL cost.', demoUrl: 'https://www.originkit.dev/docs/svgparticles', fetchLane: 'originkit MCP: fetch svgparticles (free API key)', free: true },
  { id: 'kinetic-grid', name: 'Kinetic Grid', library: 'originkit', category: 'Interactive elements', what: 'A grid that ripples and re-forms around the pointer — structure with motion.', demoUrl: 'https://www.originkit.dev/docs/kineticgrid', fetchLane: 'originkit MCP: fetch kineticgrid (free API key)', free: true },
  // ── OriginKit — image gallery ───────────────────────────────────────────
  { id: 'spiral-images', name: 'Spiral Images', library: 'originkit', category: 'Image gallery', what: 'Images orbit in a 3D spiral carousel — a gallery that feels physical.', demoUrl: 'https://www.originkit.dev/docs/spiralimages', fetchLane: 'originkit MCP: fetch spiralimages (free API key)', free: true },
  { id: 'coverflow-carousel', name: 'Coverflow Carousel', library: 'originkit', category: 'Image gallery', what: 'The album-cover flow — tilted, reflective, instantly familiar.', demoUrl: 'https://www.originkit.dev/docs/coverflowcarousel', fetchLane: 'originkit MCP: fetch coverflowcarousel (free API key)', free: true },
  { id: 'swipe-stack', name: 'Swipe Stack', library: 'originkit', category: 'Image gallery', what: 'Card-stack swiping with spring physics — decisive, playful.', demoUrl: 'https://www.originkit.dev/docs/swipestack', fetchLane: 'originkit MCP: fetch swipestack (free API key)', free: true },
  { id: 'infinity-canvas', name: 'Infinity Canvas', library: 'originkit', category: 'Image gallery', what: 'An endless drag canvas — space, not pages.', demoUrl: 'https://www.originkit.dev/docs/infinitycanvas', fetchLane: 'originkit MCP: fetch infinitycanvas (free API key)', free: true },
  // ── OriginKit — text ────────────────────────────────────────────────────
  { id: 'smoky-text', name: 'Smoky Text', library: 'originkit', category: 'Text', what: 'Letters dissolve into drifting smoke — the atmospheric headline.', demoUrl: 'https://www.originkit.dev/docs/smokytext', fetchLane: 'originkit MCP: fetch smokytext (free API key)', free: true },
  { id: 'text-morph', name: 'Text Morph', library: 'originkit', category: 'Text', what: 'One word flows into the next — state changes that breathe.', demoUrl: 'https://www.originkit.dev/docs/textmorph', fetchLane: 'originkit MCP: fetch textmorph (free API key)', free: true },
  { id: 'scramble-text', name: 'Scramble Text', library: 'originkit', category: 'Text', what: 'Characters scramble then settle — the decoding reveal.', demoUrl: 'https://www.originkit.dev/docs/scrambletext', fetchLane: 'originkit MCP: fetch scrambletext (free API key)', free: true },
  { id: 'weight-hover', name: 'Weight Hover', library: 'originkit', category: 'Text', what: 'Font weight breathes under the cursor — typography that answers touch.', demoUrl: 'https://www.originkit.dev/docs/weighthover', fetchLane: 'originkit MCP: fetch weighthover (free API key)', free: true },
  // ── OriginKit — animation + background + button ────────────────────────
  { id: 'pixel-reveal', name: 'Pixel Reveal', library: 'originkit', category: 'Animation', what: 'The image assembles from pixels — the arrival that earns attention.', demoUrl: 'https://www.originkit.dev/docs/pixelreveal', fetchLane: 'originkit MCP: fetch pixelreveal (free API key)', free: true },
  { id: 'star-burst', name: 'Star Burst', library: 'originkit', category: 'Animation', what: 'A celebratory particle burst — the moment of delight.', demoUrl: 'https://www.originkit.dev/docs/starburst', fetchLane: 'originkit MCP: fetch starburst (free API key)', free: true },
  { id: 'snow-fall', name: 'Snow Fall', library: 'originkit', category: 'Background animation', what: 'Ambient layered snowfall — a quiet, alive background.', demoUrl: 'https://www.originkit.dev/docs/snowfall', fetchLane: 'originkit MCP: fetch snowfall (free API key)', free: true },
  { id: 'blinking-squares', name: 'Blinking Squares', library: 'originkit', category: 'Background animation', what: 'A grid of softly blinking cells — the terminal-room ambience.', demoUrl: 'https://www.originkit.dev/docs/blinkingsquares', fetchLane: 'originkit MCP: fetch blinkingsquares (free API key)', free: true },
  { id: 'emoji-burst', name: 'Emoji Burst', library: 'originkit', category: 'Button', what: 'A button that answers with an emoji explosion — joy, functional.', demoUrl: 'https://www.originkit.dev/docs/emojiburst', fetchLane: 'originkit MCP: fetch emojiburst (free API key)', free: true },
  { id: 'link-preview', name: 'Link Preview', library: 'originkit', category: 'Button', what: 'Hover a link, see the page — context without the click.', demoUrl: 'https://www.originkit.dev/docs/linkpreview', fetchLane: 'originkit MCP: fetch linkpreview (free API key)', free: true },
  // ── Skiper UI — the motion-craft school (shadcn-registry lane) ─────────
  { id: 'skiper-image-reveal', name: 'Image Reveal', library: 'skiper', category: 'Motion & reveal', what: 'Images reveal with crafted masks/parallax — the portfolio-grade opener.', demoUrl: 'https://skiper-ui.com/v1/skiper71', fetchLane: 'npx shadcn add @skiper-ui/skiper71 (PREMIUM — paid upstream)', free: false },
  { id: 'skiper-dynamic-island', name: 'Dynamic Island', library: 'skiper', category: 'Adaptive UI', what: 'The macOS-class morphing pill — a notification surface that transforms.', demoUrl: 'https://skiper-ui.com/v1/skiper2', fetchLane: 'npx shadcn add @skiper-ui/skiper2', free: true },
  { id: 'skiper-hover-members', name: 'Hover Members', library: 'skiper', category: 'Team & social', what: 'Member cards with layered hover reveals — the team section with craft.', demoUrl: 'https://skiper-ui.com/v1/skiper6', fetchLane: 'npx shadcn add @skiper-ui/skiper6 (PREMIUM — paid upstream)', free: false },
  { id: 'skiper-vercel-tooltip', name: 'Vercel Tooltip', library: 'skiper', category: 'Feedback & microcopy', what: 'The Vercel-grade tooltip choreography — microcopy that lands precisely.', demoUrl: 'https://skiper-ui.com/v1/skiper43', fetchLane: 'npx shadcn add @skiper-ui/skiper43 (PREMIUM — paid upstream)', free: false },
  { id: 'skiper-token-swap', name: 'Aave Token Swap', library: 'skiper', category: 'Finance & data', what: 'The DeFi-grade swap interaction — dense data, zero friction.', demoUrl: 'https://skiper-ui.com/v1/skiper22', fetchLane: 'npx shadcn add @skiper-ui/skiper22 (PREMIUM — paid upstream)', free: false },
  { id: 'skiper-cursor-trail', name: 'Image Cursor Trail', library: 'skiper', category: 'Motion & reveal', what: 'The cursor drags a trail of images — the gallery you can feel.', demoUrl: 'https://skiper-ui.com/v1/skiper18', fetchLane: 'npx shadcn add @skiper-ui/skiper18 (PREMIUM — paid upstream)', free: false },
];

/** The library metadata (for the pane headers + the doc). */
export const UI_REF_LIBRARIES = [
  {
    id: 'originkit' as const,
    name: 'OriginKit',
    url: 'https://www.originkit.dev',
    mcp: 'https://mcp.originkit.dev/vellumai',
    key: 'ORIGINKIT_API_KEY',
    keyUrl: 'https://www.originkit.dev (Settings > API Integration — free, 10 fetches/day)',
    license: 'Free library; the vellum-ai plugin MIT; fetch via the official MCP',
  },
  {
    id: 'skiper' as const,
    name: 'Skiper UI',
    url: 'https://skiper-ui.com',
    mcp: null,
    key: null,
    keyUrl: null,
    license: 'Free components via the shadcn registry; PREMIUM components are paid — referenced, never vendored',
  },
];

/** The bounded injection for the [OLYMPUS-DESIGN] marker (~180 tokens):
 *  the marquee names + the pick-one doctrine. The full catalog lives in
 *  the pane + the lib. */
export const UI_REFERENCES_MARKER_BLOCK = [
  'UI REFERENCES — curated component inspiration (pick at most ONE signature interaction per section, adapt it to the design tokens, never copy a whole demo):',
  'motion/reveal: image-reveal (skiper) · pixel-reveal · star-burst | text: smoky-text · text-morph · weight-hover | interactive: black-hole · fluid-trail · kinetic-grid | gallery: spiral-images · coverflow-carousel · swipe-stack | microcopy: vercel-tooltip (skiper) · link-preview | surfaces: dynamic-island (skiper).',
  'The full catalog: the Craft Apps pane > References tab. OriginKit source: the originkit MCP (ORIGINKIT_API_KEY, free); Skiper: npx shadcn add @skiper-ui/<id> (free ids; premium = paid upstream — link the demo, never copy paid source).',
].join(' ');

/** #198 — the [OLYMPUS-DESIGN] references block with the LIVE OriginKit
 *  budget. The free key allows 10 fetches/day; a god that knows the count
 *  picks the Skiper lane instead of hanging on a silent exhaustion. */
export function uiReferencesMarkerBlock(now?: Date): string {
  const b = readOriginkitBudget({ now });
  const line = b.exhausted
    ? `OriginKit budget: 0/${b.limit} fetches left today — EXHAUSTED until ${formatOriginkitReset(b.resetAt)}. Use the Skiper shadcn lane or the demo URL instead; NEVER retry a refused fetch.`
    : `OriginKit budget: ${b.remaining}/${b.limit} fetches left today (resets at local midnight, ${formatOriginkitReset(b.resetAt)}). A refused fetch means the free key is exhausted — switch to the Skiper shadcn lane or the demo URL, never hang or retry.`;
  return `${UI_REFERENCES_MARKER_BLOCK} ${line}`;
}
