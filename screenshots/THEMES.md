# OLYMPUS themes — the gallery

Eighteen presets — ten dark and eight light — plus the palette lab (a full
14-key family generated with contrast floors). The new families: Vampire,
Celestial, Abyss, Rosewood, Ivory and Arctic. Click a card to open the SVG;
`npm run themes:gallery` regenerates the set from `src/lib/theme.ts`.

| Dark | Light |
|---|---|
| [Olympus](./themes/olympus.svg) · [Obsidian](./themes/obsidian.svg) · [Ember](./themes/ember.svg) | [Parchment](./themes/parchment.svg) · [Paper](./themes/paper.svg) · [Mist](./themes/mist.svg) |
| [Violet](./themes/violet.svg) · [Forest](./themes/forest.svg) · [Ice](./themes/ice.svg) | [Blossom](./themes/blossom.svg) · [Sand](./themes/sand.svg) · [Mint](./themes/mint.svg) |
| [Vampire](./themes/vampire.svg) · [Celestial](./themes/celestial.svg) · [Abyss](./themes/abyss.svg) | [Rosewood](./themes/rosewood.svg) · [Ivory](./themes/ivory.svg) · [Arctic](./themes/arctic.svg) |

## What changes with a theme

- the app chrome, the terminal, the god icons and the filters (CSS variables)
- the brain canvas (nodes by kind, cloud alpha and core ink adapt to light)
- the loader, the splash, the tray dot, the window icon and the Linux dock
- the Pattern Studio (particles and the voice orb)

## The palette lab

Settings → Appearance → **palette lab**: pick a hue, a harmony (analogous,
complementary, triadic, split, mono) and a mode; shuffle until it feels right;
**apply + make default** persists the family. Contrast is enforced by
construction and pinned by `scripts/palette-lab.test.mjs`.

## Real captures (v0.0.72)

The minimalist cards above are the gallery. The running app was also captured
in every theme, one clean-terminal screenshot per theme:
`screenshots/themes/<id>.png` (18 files, captured by `npm run shots:themes`).
They are the evidence, not the gallery.
