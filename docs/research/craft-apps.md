# The Craft Apps Lane — the 13 ArtCraft apps inside OLYMPUS (W-G, v0.0.7)

> The user's directive: everything inside OLYMPUS — the free open-source
> creative apps available to BOTH the user and the agents, without leaving
> the window. This doc is the honest state (the TRELLIS discipline).

## What ships (all probe-verified live, 2026-10-20)

- **The Craft Apps pane** (activity bar) — the Studio card + the 13-app
  grid; every click EMBEDS the app's live web build in the panel
  (probe-green: **14/14 reachable, 14/14 embeddable** — the full table via
  `node scripts/refresh-craft-apps.js`).
- **The Atelier's artcraft button opens the Studio INSIDE** the pane
  (the web lane; the local install stays the strongest lane when detected)
  with the asset's vault path on the clipboard.
- **The auto-update truth layer**: the panel route probes every app on
  every open (reachability + the X-Frame-Options/CSP embed check); the
  refresh script re-verifies on demand — the catalog never goes stale
  silently, and a frame-blocking upstream honestly falls back to the
  external-open chip (never a dead frame).
- **The agent lane**: the Craft Apps are agent-ready by upstream design
  ("Drive every app from a CLI, a JSON control channel or an MCP server" —
  their own docs). The deeplink detection covers the craft-launcher; the
  forge demigods (image-generator, 2d-asset-designer, 3d-asset-engineer)
  cite the control channel as their heavy-editor escalation.

## The 13 apps (Apache-2.0, github.com/storytold/*)

| App          | Category                 | Status (upstream)  | Repo stars |
|--------------|--------------------------|-------------------|------------|
| PhotoCraft   | Image editor             | Early alpha       | 69k        |
| VectorCraft  | Vector illustration      | In development    | 10k        |
| FilmCraft    | Video editor             | In development    | 15k        |
| LightCraft   | Photo library & raw      | In development    | 14k        |
| PdfCraft     | PDF workbench            | Early alpha       | 17k        |
| EffectCraft  | Motion graphics & VFX    | In development    | 7.5k       |
| DesignCraft  | Page layout & publishing | In development    | 4.5k       |
| FigCraft     | Interface design         | Early alpha       | 2.9k       |
| WordCraft    | Word processing           | In development    | 15k        |
| SoundCraft   | Audio workstation        | In development    | 3.4k       |
| DeckCraft    | Presentations            | In development    | 4k         |
| CADCraft     | CAD & drafting           | In development    | 6.1k       |
| GridCraft    | Spreadsheets & data      | In development    | 6k         |

Plus the **ArtCraft Studio** (34k stars, MIT/Apache-2.0 dual) — the AI
crafting engine (2D/3D compositing, posing, image-to-3D-mesh, the
62-model catalog), embedded at the top of the pane.

## The vendored-offline lane (DEFERRED, honest)

The apps compile to WebAssembly; a fully-offline OLYMPUS could vendor the
WASM builds into the Electron resources. Deferred because: (a) the size —
hundreds of MB across 13 apps on a 653MB AppImage, (b) the build pipeline —
vendoring prebuilt WASM needs a pinning + refresh chain, building from
source needs the Rust/WASM toolchain this box does not carry (the JET-class
honesty), (c) the live web lane serves 14/14 today with zero bundle cost.
The lane reopens when the user calls for offline-capable craft.

## Licensing

All thirteen apps + the launcher: Apache-2.0. The Studio: MIT/Apache-2.0
dual. OLYMPUS embeds their WEB BUILDS (loaded from app.getartcraft.com —
their runtime, their serving); no source is vendored into the OLYMPUS
tree, so the AGPL boundary is clean (the brain-atlas precedent embedded
MIT source; here nothing is copied — the pane is a live embed + the
catalog + the probe layer).

*License: AGPL-3.0-or-later (original OLYMPUS code).*
