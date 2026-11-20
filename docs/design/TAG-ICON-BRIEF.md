# AIME tag marks & brand icons — design brief (v0.0.96)

## What exists today

The AIME tag marks are **not AI-generated**. They are 46 hand-authored 16×16
pixel glyphs in `src/components/tag-mark.tsx` (one silhouette per trope, a
14px legibility gate, `currentColor` + per-hue data ink, dark/light contrast).
The set is internally consistent; its ceiling is the **16px grid** and the
pixel-art language, not the model or MCP used to make it.

## Diagnosis

- Image-generation models (FLUX/Pollinations/Nakkas) are the wrong tool for a
  46-icon family: style drift, no stroke/grid control, no transparent vector
  precision.
- The current glyphs are legible at 14–16px but cannot carry the detail a
  premium tag badge needs at 24–32px.
- The AIME wordmark/symbol has no separate vector system (clear space,
  monochrome, favicon, social).

## Recommendation (two registers)

1. **Keep the 16×16 marks** for the card row: fast, cheap, already gated.
2. Add a **24×24 vector badge set** for library/detail/tag pages:
   - 24px grid, 2px stroke, pixel-aligned, 1 accent + 1 neutral;
   - 46 metaphors mapped one-to-one to the vocabulary;
   - contact sheet at 14/16/24/32 on the night and day surfaces;
   - contrast ≥ 4.5:1 for the ink; shape-only readable at 16;
   - no raster generation: SVG paths authored under the grid, reviewed as a
     family.
3. **AIME logo**: vector wordmark + symbol, clear space, monochrome, favicon
   16/32, social 512/1024. Test on light/dark and at 16px.
4. **Do not** use an image model for the family; use it only for moodboards or
   hero illustrations. An LLM may write SVG paths, but the contact-sheet review
   is mandatory.

## Acceptance

- 46/46 marks in the contact sheet, no duplicates, no blank glyph.
- 14px/16px/24px/32px pass; 14px outline still reads.
- One-to-one with `TAG_ICONS`; accessible label remains the authority.
- Logo at 16/32/64/256/favicon/social with clear space.
- A human "would I ship this?" review before replacing the card row.

## Scope

This brief is the v0.0.96 audit. The full 24px set + logo is a separate build
(3–5 days) so it does not destabilize the hibernation/burn release.
