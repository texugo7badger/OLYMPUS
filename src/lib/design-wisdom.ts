/**
 * design-wisdom.ts — v0.0.34: Open Design distilled for the Style Board.
 *
 * The Open Design charter (the expert-designer system prompt vendored by the
 * `open-design-mcp` package) is long. The Style Board needs the COMPACT
 * decision layer: the principles that change a direction, plus the token
 * recipes of the reference systems designers actually recognize.
 *
 * The full charter still lives in the `opendesign` MCP lane (Athena) and in
 * `.opencode/skills/`; this file is the user-facing, one-click layer.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { DensityId, MotionId, RadiusId, StyleTokens, TypographyId } from './artcraft';

export interface DesignPrinciple {
  id: string;
  title: string;
  body: string;
  /** The token a click should nudge, when the principle has one. */
  apply?: Partial<Pick<StyleTokens, 'typography' | 'density' | 'radius' | 'motion'>>;
}

export const DESIGN_PRINCIPLES: DesignPrinciple[] = [
  {
    id: 'content-first',
    title: 'Content first',
    body: 'Start with the real words, numbers and states. Composition solves emptiness; placeholder copy hides it. If a section feels empty, change the layout — never invent filler.',
  },
  {
    id: 'type-interface',
    title: 'Type is the interface',
    body: 'One distinctive face, a clear scale, generous line-height. The headline carries the page; body copy stays quiet. Never Inter + system-ui by default.',
    apply: { typography: 'geometric-sans' },
  },
  {
    id: 'color-budget',
    title: 'Color is a budget',
    body: 'One accent, at most 10% of the visible surface. Depth comes from three background layers, not from a rainbow. Contrast floors: text 7:1, muted 4.5:1, accent 3:1.',
  },
  {
    id: 'space-material',
    title: 'Space is a material',
    body: 'Use an 8-point rhythm. Sections breathe (80px+), cards get room (24px+), and density is a deliberate choice — not an accident of margins.',
    apply: { density: 'spacious' },
  },
  {
    id: 'layered-depth',
    title: 'Layered depth',
    body: 'Three tonal layers (bg → surface → elevated), one border language, one shadow recipe. Depth should survive a screenshot with the color removed.',
  },
  {
    id: 'motion-reason',
    title: 'Motion with a reason',
    body: 'Animate transform and opacity only; 150–300ms for state, 400–700ms for arrival. Motion explains hierarchy or feedback — never decorates a static surface.',
    apply: { motion: 'subtle' },
  },
  {
    id: 'signature-detail',
    title: 'One signature detail',
    body: 'Every component earns one distinctive detail: a gradient edge, a custom hover, a border treatment, a typographic move. Generic shadcn clones are the enemy.',
  },
  {
    id: 'verify-real',
    title: 'Verify the real page',
    body: 'Look at the served page, not only the source. Check contrast, keyboard focus, 320px width, reduced motion, and the actual empty/loading/error states before shipping.',
  },
];

export interface DesignSystemRecipe {
  id: string;
  name: string;
  note: string;
  tokens: Pick<StyleTokens, 'typography' | 'density' | 'radius' | 'motion'>;
}

export const DESIGN_SYSTEMS: DesignSystemRecipe[] = [
  { id: 'linear', name: 'Linear', note: 'precise, dark, tight grids, mono accents', tokens: { typography: 'geometric-sans', density: 'compact', radius: 'sharp', motion: 'subtle' } },
  { id: 'vercel', name: 'Vercel', note: 'monochrome, sharp contrast, minimal radius', tokens: { typography: 'geometric-sans', density: 'comfortable', radius: 'sharp', motion: 'subtle' } },
  { id: 'stripe', name: 'Stripe', note: 'editorial scale, gradients, generous space', tokens: { typography: 'humanist-sans', density: 'spacious', radius: 'soft', motion: 'expressive' } },
  { id: 'raycast', name: 'Raycast', note: 'command-first, dense, keyboard-native', tokens: { typography: 'mono-technical', density: 'compact', radius: 'soft', motion: 'subtle' } },
  { id: 'apple', name: 'Apple HIG', note: 'clarity, deference, depth, 44pt targets', tokens: { typography: 'humanist-sans', density: 'comfortable', radius: 'pill', motion: 'subtle' } },
  { id: 'material', name: 'Material 3', note: 'tonal surfaces, 8dp grid, dynamic color', tokens: { typography: 'humanist-sans', density: 'comfortable', radius: 'soft', motion: 'expressive' } },
  { id: 'notion', name: 'Notion', note: 'content-first, calm, quiet hierarchy', tokens: { typography: 'serif-display', density: 'comfortable', radius: 'soft', motion: 'none' } },
  { id: 'airbnb', name: 'Airbnb', note: 'warm, photography-led, rounded and human', tokens: { typography: 'humanist-sans', density: 'spacious', radius: 'pill', motion: 'subtle' } },
];

export const TYPE_LABEL: Record<TypographyId, string> = {
  'geometric-sans': 'geometric sans',
  'humanist-sans': 'humanist sans',
  'serif-display': 'serif display',
  'mono-technical': 'mono technical',
};

export const DENSITY_LABEL: Record<DensityId, string> = {
  compact: 'compact',
  comfortable: 'comfortable',
  spacious: 'spacious',
};

export const RADIUS_LABEL: Record<RadiusId, string> = {
  sharp: 'sharp',
  soft: 'soft',
  pill: 'pill',
};

export const MOTION_LABEL: Record<MotionId, string> = {
  none: 'none',
  subtle: 'subtle',
  expressive: 'expressive',
};
