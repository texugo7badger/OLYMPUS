/**
 * reference-collections.ts — v0.0.91: the curated face of the 939-study archive.
 *
 * The count was real; the experience was not. 501 of the 945 expanded rows are
 * "Interactive elements" with a templated sentence, so a flat infinite grid
 * reads as repetition. These collections are the small, opinionated set the
 * user should see first: one collection per design decision, with the marquee
 * studies that actually carry the idea.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export interface ReferenceCollection {
  id: string;
  name: string;
  /** One sentence: what this collection is for. */
  description: string;
  /** The category the collection mostly lives in. */
  category: string;
  /** The marquee ids that must be included even if the category is broad. */
  marquee: string[];
}

export const REFERENCE_COLLECTIONS: ReferenceCollection[] = [
  {
    id: 'hero',
    name: 'Hero arrivals',
    description: 'The first three seconds — one arrival, not five competing effects.',
    category: 'Animation',
    marquee: ['pixel-reveal', 'star-burst', 'pixelreveal', 'starburst'],
  },
  {
    id: 'interactive',
    name: 'Interactive',
    description: 'Pointer-reactive surfaces where the motion carries meaning.',
    category: 'Interactive elements',
    marquee: ['black-hole', 'fluid-trail', 'kinetic-grid', 'blackhole', 'fluidtrail', 'kineticgrid'],
  },
  {
    id: 'galleries',
    name: 'Galleries',
    description: 'Card stacks, coverflow and spatial browsing — pick one grammar.',
    category: 'Image gallery',
    marquee: ['spiral-images', 'coverflow-carousel', 'swipe-stack', 'infinity-canvas', 'spiralimages', 'coverflowcarousel', 'swipestack', 'infinitegallery'],
  },
  {
    id: 'type',
    name: 'Typography',
    description: 'Text as material: weight, smoke, morph and decode.',
    category: 'Text',
    marquee: ['smoky-text', 'text-morph', 'scramble-text', 'weight-hover', 'smokytext', 'textmorph', 'scrambletext', 'weighthover'],
  },
  {
    id: 'backgrounds',
    name: 'Backgrounds',
    description: 'Ambient fields that stay quiet behind the content.',
    category: 'Background animation',
    marquee: ['snow-fall', 'blinking-squares', 'snowfall', 'blinkingsquares'],
  },
  {
    id: 'buttons',
    name: 'Buttons & links',
    description: 'Micro-interactions that answer the press with intent.',
    category: 'Button',
    marquee: ['emoji-burst', 'link-preview', 'emojiburst', 'linkpreview'],
  },
  {
    id: 'adaptive',
    name: 'Adaptive UI',
    description: 'Surfaces that morph with state instead of redrawing.',
    category: 'Adaptive UI',
    marquee: ['skiper-dynamic-island', 'dynamic-island'],
  },
  {
    id: 'finance',
    name: 'Finance & data',
    description: 'Dense numbers without friction — the DeFi-grade interaction.',
    category: 'Finance & data',
    marquee: ['skiper-token-swap', 'token-swap'],
  },
];
