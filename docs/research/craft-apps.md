# The Craft Apps Lane — the 13 ArtCraft apps vendored INSIDE OLYMPUS (W-M, v0.0.8)

> The user's directive (2026-10-21): no live-site embeds as the primary
> lane — DOWNLOAD every released app, keep auto-update ON, run them
> INSIDE OLYMPUS with no login, ever. This doc is the honest state (the
> TRELLIS discipline); it supersedes the v0.0.7 deferral.

## What ships (the vendored lanes)

- **The WEB lane (primary)**: every app publishes a **self-hostable
  WebAssembly build** in its GitHub releases (`<id>-web-<ver>.zip` —
  upstream's own "The WebAssembly app, to host yourself", probe-verified
  2026-10-21: **13/13 publish one**, FilmCraft included). The manager
  (`src/lib/craft-vendor.ts`) downloads + **SHA-256-verifies** (the
  release `SHA256SUMS.txt`) + extracts + **atomically swaps** it into
  `~/.olympus/craft-apps/web/<id>/current` (one previous generation
  kept at `prev`), and the serve route
  (`/api/olympus/craft-apps/serve/<id>/…`) hosts it on the **OLYMPUS
  origin** — the pane embeds OUR copy. No `app.getartcraft.com` round
  trip, no account, no login: the app runs from our disk.
- **The NATIVE lane (the "downloaded app" escalation)**: the per-OS
  portable build (Linux AppImage / Windows portable zip / macOS dmg —
  no sudo, no system install) into `~/.olympus/craft-apps/native/<id>/`
  — launched as its own OS window, driven headless by the agents via
  the upstream agent-ready CLI/JSON channel. A running native app is
  never replaced (the upstream launcher law).
- **The LIVE WEB lane (fallback only)**: when nothing is vendored, the
  W-G probe layer (v0.0.7) still tells the truth about
  `app.getartcraft.com/<app>` — the Get view offers the live web build
  as the explicit fallback, never a dead frame.
- **Auto-update is ON** (the user's directive): the background sweep
  starts with the pane (one timer per process), checks the
  `releases/latest` redirect (zero GitHub API quota — the craftcenter
  lesson), re-vendors web builds with newer releases, and defers
  native updates while the app runs. The refresh button forces a
  re-check.
- **The STUDIO stays live**: the ArtCraft Studio is their hosted AI
  product (the 62-model catalog on their infra) — outside the 13
  released apps. Its card keeps the live embed + the "AC" monogram
  (the ArtCraft mark is a TRADEMARK — deliberately not vendored).

## The sizes (the honest numbers that reopened the lane)

The v0.0.7 deferral assumed "hundreds of MB across 13 apps" — that was
the NATIVE estimate. The web builds are an order smaller:

| Lane | Per app | All 13 |
|------|---------|--------|
| Web build (`<id>-web-<ver>.zip`) | 7–14 MB | ~150 MB |
| Native portable | 8–95 MB | ~1 GB |
| App icons (vendored, `public/craft-apps/logos/`) | 3–20 KB | ~160 KB |

Nothing is bundled into the repo or the AppImage — downloads land in
`~/.olympus/craft-apps/` at runtime.

## The agent lane: the `olympus-craft` MCP (OLYMPUS-built)

Upstream ships NO MCP server (the org census 2026-10-21: 66 repos, none
MCP; `craft-ai-integrations` is the AI-provider layer, not a control
channel) — per the user's directive ("se não tiver criaremos") OLYMPUS
builds one: **`olympus-craft`** (`scripts/mcp-craft-server.mjs`,
registered in `.mcp.json`) — a stdio JSON-RPC server that drives the
vendored apps through the app route (one source of truth — the same
manager + manifest the pane uses):

- `craft_catalog` / `craft_status` — what is vendored, versions, updates
- `craft_install {app, lane: web|native}` — vendor one app
- `craft_update` — the sweep
- `craft_launch {app, file?}` — the native window
- `craft_exec {app, args}` — the upstream agent-ready CLI, headless

The forge demigods (image-generator, 2d-asset-designer,
3d-asset-engineer) cite the vendored lane + the MCP as their
heavy-editor escalation.

## The 13 apps (Apache-2.0, github.com/storytold/*)

| App          | Category                 | Status (upstream)  |
|--------------|--------------------------|-------------------|
| PhotoCraft   | Image editor             | Early alpha       |
| VectorCraft  | Vector illustration      | In development    |
| FilmCraft    | Video editor             | In development    |
| LightCraft   | Photo library & raw      | In development    |
| PdfCraft     | PDF workbench            | Early alpha       |
| EffectCraft  | Motion graphics & VFX    | In development    |
| DesignCraft  | Page layout & publishing | In development    |
| FigCraft     | Interface design         | Early alpha       |
| WordCraft    | Word processing          | In development    |
| SoundCraft   | Audio workstation        | In development    |
| DeckCraft    | Presentations            | In development    |
| CADCraft     | CAD & drafting           | In development    |
| GridCraft    | Spreadsheets & data      | In development    |

## Version-stamp honesty (the badge law)

The status-bar badge next to Compact Brain read
`window.__OLYMPUS_VERSION__` — which was never defined, so it fell back
to `'0.0.6'` while package.json moved on (the user's specimen). The
root layout now injects the real package.json version (W-M
VERSION-STAMP) — the badge can never go stale again.

## Licensing

All thirteen apps: Apache-2.0 (github.com/storytold/*). The app icons
vendored into `public/craft-apps/logos/` are each app's own icon,
copied unmodified from its repository, licensed like the app (MIT OR
Apache-2.0 — upstream's own rule). The **ArtCraft name, logo and "A"
mark are trademarks** of the ArtCraft Team — NOT vendored (the Studio
card keeps the monogram treatment); the pane uses the app names
nominatively. The downloads are official upstream release artifacts,
SHA-256-verified — nothing is modified, so the AGPL boundary is clean
(the brain-atlas precedent vendored MIT source; here the vendored
artifacts are Apache-2.0 binaries + assets, and the OLYMPUS-side code
is original).

*License: AGPL-3.0-or-later (original OLYMPUS code).*
