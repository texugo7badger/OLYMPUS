---
title: Design Systems & Tokens
category: design
stacks: []
god: athena
last_updated: 2026-10-30
sources:
  - https://m3.material.io/
  - https://developer.apple.com/design/human-interface-guidelines/
  - https://web.dev/explore/css
---

# Design Systems

## When to use
Any product with more than a handful of screens, and every project that will
be maintained after the first release. Tokens and primitives before pages.

## Non-negotiables
- **Tokens are the API**: color, spacing, radius, type, elevation, motion.
  Components consume tokens; inline literals are a defect when a token exists.
- **One accent**: a brand accent used boldly but sparingly (roughly <=10% of
  visible surface). A second accent dilutes the first.
- **Type scale with contrast**: pick a distinctive family (not the default
  system stack); pair a display size with a readable body size; set line
  height per size, not one global value.
- **Dark and light are one deliverable**: define semantic tokens
  (`bg`, `surface`, `elevated`, `text`, `muted`, `accent`, `danger`) and map
  them per theme. Never invert raw hex values.
- **Elevation via layered surfaces**, not one shadow everywhere. Three
  distinguishable layers is the minimum for depth.
- **Variants, not one-offs**: a button has size/intent/state variants; a card
  has a defined anatomy. If a page needs a new variant, add it to the system.
- **Motion tokens**: duration + easing per intent (enter, exit, emphasis).
  Respect reduced motion.

## Checklist
- [ ] Semantic tokens exist for color/surface/text/border/accent.
- [ ] Spacing scale is used everywhere (no arbitrary 13px).
- [ ] Type scale is documented with line heights and weights.
- [ ] Focus/hover/active/disabled/loading states exist for interactive parts.
- [ ] Empty, error, and skeleton states are designed, not improvised.
- [ ] The component API is documented with one usage example.

## Anti-patterns
- A "design system" that is a folder of unowned components.
- Every card with the same radius/shadow/padding (no hierarchy).
- Gradient + glow on everything; the accent loses meaning.
- Raw hex values in page code.
- Building pages before the primitives, then retrofitting tokens.

## Sources
- Material 3: https://m3.material.io/
- Apple HIG: https://developer.apple.com/design/human-interface-guidelines/
- web.dev CSS: https://web.dev/explore/css
