# The UI References Lane — the curated component inspiration (W-J, v0.0.7)

> The user's directive: at art time, the gods and demigods have READY UI
> references — the two community libraries the user picked, wired into the
> design flow. This doc is the honest state.

## What ships

- **The curated catalog** (`src/lib/ui-references.ts`): ~24 marquee
  components across both libraries — OriginKit (black-hole, fluid-trail,
  spiral-images, smoky-text, pixel-reveal...) and Skiper UI (image-reveal,
  dynamic-island, vercel-tooltip, token-swap...) — each with a one-line
  craft description, the live demo URL, and the honest fetch lane.
- **The [OLYMPUS-DESIGN] marker injection**: every architectural prompt
  carries the bounded UI-REFERENCES block — the marquee names + the
  doctrine: "pick at most ONE signature interaction per section, adapt it
  to the design tokens, never copy a demo whole."
- **The References tab** (the Craft Apps pane): the searchable catalog for
  the USER — each entry opens the live demo (embedded when frameable,
  the honest external-open chip otherwise) + the copy-lane button
  (`npx shadcn add ...` / the originkit fetch hint).
- **The originkit MCP** (the agents' hands): the official server
  (`mcp.originkit.dev/vellumai`, probe-verified 401-without-key — the auth
  gate works), registered by the full 8-step checklist — DISABLED by
  default + LOCKED until the FREE `ORIGINKIT_API_KEY` (10 fetches/day,
  browse unlimited), cold-tier for **athena + hephaestus**.

## The licensing doctrine (never violated)

OLYMPUS **never copies component source** into its own tree: the catalog
carries the WHAT + the demo link + the fetch lane; generated projects
install through the upstream lanes (the shadcn registry / the originkit
MCP), the licenses stay between upstream and the user. Skiper's FREE
components are referenced by their registry ids; **Skiper PREMIUM is paid
upstream — the catalog marks every premium entry and never carries its
code** (the demo links only). OriginKit is a free library; the vellum-ai
MCP plugin is MIT.

## The two libraries

| | OriginKit | Skiper UI |
|---|---|---|
| Catalog | 250+ animated components (6 categories) | 106+ un-common shadcn/ui components |
| Lane | Official MCP (browse free, fetch on the free key) | `npx shadcn add @skiper-ui/<id>` |
| Cost | Free (10 fetches/day) | Free + Premium ($129 one-time) |
| School | The animated-web craft (black hole, smoky text) | The motion-craft school (Kowalski/Rauno) |

*License: AGPL-3.0-or-later (original OLYMPUS code).*
