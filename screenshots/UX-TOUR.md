# OLYMPUS — UX tour (v0.0.34)

> Real screenshots from the running app: `npm run shots` (Electron, offscreen)
> captures them from `http://127.0.0.1:3737`. No mockups.

## 1. The Brain Atlas — where the work lives

![Brain Atlas](./01-brain.png)

The 3D/Canvas brain is the map of the project's intelligence: gods (gold),
instincts (green), knowledge (purple), skills (blue) and the project hub. It
follows the active theme (nodes are recolored by kind; the background, labels
and haze use the palette). Hover a node for its card, click to open the
document or the god. The bottom-left orbit is the live mark; campaign events
stream next to it.

## 2. Craft — the surfaces that build the product

![Craft apps](./02-references.png)

The Craft dashboard gathers the vendored apps (ArtCraft Studio, PhotoCraft,
VectorCraft, …) and the design lanes. Each app runs inside OLYMPUS after a
one-click install; the ArtCraft Studio is the composition lane.

## 3. Builds — the loadout hub

![Builds](./05-builds.png)

**251 default builds** (51 curated + a matrix of every sector × every god ×
skill-led/agent-led), grouped by category and filterable by god. Every card
shows the god, the agents, the skills, the MCPs and the earned tier
(hot ≥ 80 % over 5 wins, warm ≥ 50 % over 2). Click a card to open the viewer;
**simulate** loads it into the talent carousel. The first visit gets a
four-step animated tutorial.

### The talent carousel

One sector per screen, swipe or use the arrows. Each slot opens the **whole
arsenal** (334 skills · 28 MCPs · 132 agents) with search and a custom value;
the caps are 3 skills / 3 MCPs / 5 parallel agents. Saving stores a user build
the brain learns from.

## 4. Style — the project's direction, not OLYMPUS's

![Style](./03-style.png)

The Style Board belongs to the open project. A neutral project palette starts
the direction; **edit** exposes the five colors, and the mock page updates
live. **Generate** produces six palettes and six logo marks from the project
name; **Athena suggests** three families from the project's seed and stacks.
**Send to the gods** enqueues the direction at maximum priority; **Athena**
asks for a refinement. Nothing is copied by hand.

## 5. References — real components, one click

![References](./02-references.png)

The catalog is fixed (24/24 demo URLs) and searchable by category. Hover a card
to play the **real component** from the Originkit page (cropped to the demo area,
one iframe at a time); **use** carries the reference into the project's Style
Board, **send to queue** opens a high-priority Athena task.

## 6. Appearance — one palette for the whole machine

![Appearance](./06-settings.png)

Twelve presets (six dark, six light pastel) plus the **palette lab**: a hue
slider, five harmonies, shuffle, and a full 14-key family generated with
contrast floors (text ≥ 7:1, dim ≥ 4.5:1, accent ≥ 3:1). The choice repaints
the app chrome, the terminal, the god icons, the brain, the loader, the splash,
the tray dot, the window icon and the Linux dock icon. **Stable mode** removes
decorative motion; the 60 FPS rule is a standing law.

## 7. Pattern Studio — watch the machine think

A star button in the status bar opens a full-screen artistic view: a drifting
particle field where every burst is a real hop, the themed mark in the center,
the gods' in-flight work on the left and the **voice orb** (plasma ring) with a
language selector on the right. One canvas, DPR capped, paused when hidden,
static in stable mode. The voice synthesis and full i18n arrive in a later
release; the surface is already here.

## 8. Notifications and the sleep contract

The bell lists every event with a link to the exact pane; **hibernate on lock**
is on by default, and **now** keeps the campaign while the window disappears.
The tray dot stays colored while the window is hidden.

## Running it

```bash
npm install
npm run dev        # Electron + Next on 127.0.0.1:3737
npm run shots      # re-capture these screenshots from the live app
```

The app is local-first: no account, no upload, no telemetry by default.

---

## v0.0.34 — the chameleon pass

![Pattern Studio](./04-studio.png)

### Pattern Studio — every thought is a node

The **criatividade** button in the status bar opens the studio. Every hop,
verification and park becomes a thought node around the mark, merged by hop
(shared thoughts evolve instead of duplicating), with a line back to the
centre and the god's color. The background is a living cell field with Van
Gogh brushstrokes; ten god icons orbit the original OLYMPUS mark. Click a node
or a god icon to switch the active god.

The plasma-ring orb is the voice. Each god has a calm neural voice (free
`edge-tts` lane), and the orb expands while speaking. The discreet chat answers
**only what you ask** — it does not narrate the walk — and speaks the answer
when voice is on. Click a **learning** item (instinct, knowledge, skill or MCP)
to hear the god explain what it learned and how it improves. The **project
summary** button asks for the short version in one click.

![References](./02-references.png)

### References — 859 components, one live study each

OriginKit + Skiper are fully indexed (859 entries, deduped by id and name).
Every card is an original interactive canvas study in the active theme — no
vendor page, no login banner. The grid loads 60 at a time as you scroll, until
the catalog truly ends; preview canvases mount only near the viewport, so
memory stays flat. Search understands the seven languages (category aliases
and localized labels).

![Style Board](./03-style.png)

### Style — Open Design wisdom + a real browser preview

The board keeps the instant token mock (click a component to select it) and
adds a **live** tab with the project's real dev server: URL editing,
back/forward, reload and mark-to-edit. **Open Design wisdom** distills the
designer charter into eight principles and eight system recipes (Linear,
Vercel, Stripe, Raycast, Apple, Material, Notion, Airbnb), with one-click
application. Athena's decision shows at most three project-specific
directions, one clearly recommended; in hibernation the recommended one is
applied automatically.

The identity generator now shows **one logo at a time**, built from the
project name and palette, with "another" and "use this".

![Builds](./05-builds.png)

### Builds — the talent icons follow the machine

The 251-build hub and the talent carousel now tint every animated category
icon with the active palette (server-rendered SVG recoloring, cache-busted per
palette). The original mark stays the only app/system identity.

![Settings](./06-settings.png)

### Settings — seven languages, real

The language selector applies instantly to the whole interface and to the
chat. God names, domains, reference categories, the build queue, the projects
and the Pattern Studio follow it. See the [Languages section](../README.md#languages--olympus-is-global).
