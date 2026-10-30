---
title: Accessibility (WCAG 2.2 AA)
category: design
stacks: []
god: athena
last_updated: 2026-10-30
sources:
  - https://www.w3.org/TR/WCAG22/
  - https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
  - https://www.w3.org/WAI/ARIA/apg/
---

# Accessibility — WCAG 2.2 AA

## When to use
Every user-facing surface: pages, components, forms, modals, menus, charts,
and the empty/error states people forget. Accessibility is a ship gate, not a
later pass.

## The 2.2 additions that change default designs
- **2.4.11 Focus Not Obscured (AA)**: a focused element must not be entirely
  hidden by sticky headers/footers/toasts. Test with keyboard focus.
- **2.5.7 Dragging Movements (AA)**: any drag action needs a single-pointer
  alternative (arrows, menu, numeric input).
- **2.5.8 Target Size (AA)**: pointer targets at least 24×24 CSS px, or
  adequately spaced. Icon buttons need real hit areas, not 12px glyphs.
- **3.2.6 Consistent Help (A)**: help affordances appear in the same relative
  order across a set of pages.
- **3.3.7 Redundant Entry (A)**: do not ask for the same information twice in
  one flow; auto-populate or let the user select it.
- **3.3.8 Accessible Authentication (AA)**: no cognitive-function test to log
  in without an alternative (password managers, paste, email link). Do not
  block paste on password fields.

## Non-negotiables
- Semantic HTML first; ARIA only when no native element fits.
- Every control is keyboard reachable; focus order follows visual order.
- A visible focus indicator with >= 3:1 contrast against its background.
- Text contrast >= 4.5:1 (normal), >= 3:1 (large); UI boundaries >= 3:1.
- Images have alt text (decorative = empty alt); icons that trigger actions
  have accessible names.
- Forms: label + description + error message tied to the input, never
  placeholder-only labels.
- Motion respects `prefers-reduced-motion`; no autoplaying carousels.
- Modals trap focus, restore it on close, and `Esc` closes them.

## Checklist
- [ ] Keyboard-only pass: tab, shift-tab, enter, space, escape.
- [ ] Screen-reader pass on the primary flow (at least name/role/value).
- [ ] Zoom 200% and 320px width: no horizontal scroll for content.
- [ ] Color is never the only signal (error, status, chart series).
- [ ] Reduced-motion pass.
- [ ] Automated axe/Lighthouse pass, then the manual checks above.

## Anti-patterns
- `div` with `onClick` and no role/keyboard handler.
- `aria-label` on a non-interactive element to paper over missing text.
- Focus outlines removed globally.
- Placeholder as the only label.
- Toast-only errors that disappear before a screen reader reads them.

## Sources
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- What's new in 2.2: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- WAI-ARIA Authoring Practices: https://www.w3.org/WAI/ARIA/apg/
