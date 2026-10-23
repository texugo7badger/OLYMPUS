# CREDITS

> OLYMPUS v0.0.9 — built on the shoulders of giants. This file lists the upstream projects that make OLYMPUS possible.

OLYMPUS is built on the shoulders of giants. This file lists the upstream projects that make OLYMPUS possible.

## License Summary

| Component | License | Source |
|-----------|---------|--------|
| OLYMPUS-original code | AGPL-3.0-or-later | This repository |
| ECC plugin (hooks system) | MIT | [ECC](https://github.com/ecc) |
| agency-agents (demigod design patterns) | MIT | [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) |
| Superpowers skill | MIT | [superpowers](https://github.com/obra/superpowers) |
| Caveman skill | MIT | [caveman](https://github.com/obra/caveman) |
| Impeccable skill | MIT | [impeccable](https://github.com/obra/impeccable) |
| OpenDesign references | MIT | [OpenDesign](https://github.com/opendesign) |
| OpenDesign MCP (opendesign-mcp) | MIT | [nexu-io/open-design](https://github.com/nexu-io/open-design) |
| olympus-go-cache (recipe port) | MIT | [opencode-go-cache](https://github.com/sst/opencode) |
| brain-atlas (renderer) | MIT | [brain-atlas](https://github.com/obra/brain-atlas) |
| mcp-compressor | Apache-2.0 | [mcp-compressor](https://github.com/atlassian/mcp-compressor) |
| tamp | MIT | [tamp](https://github.com/obra/tamp) |
| sqlite-vec | MIT | [sqlite-vec](https://github.com/asg017/sqlite-vec) |
| @google/model-viewer (FORGE-3D) | Apache-2.0 | [model-viewer](https://github.com/google/model-viewer) |
| Excalidraw (FORGE-2D) | MIT | [excalidraw](https://github.com/excalidraw/excalidraw) |
| @pinkpixel/mcpollinations | MIT | [mcpollinations](https://www.npmjs.com/package/@pinkpixel/mcpollinations) |
| REA (morluto/rea) | MIT | [rea](https://github.com/morluto/rea) |
| three.js | MIT | [three.js](https://github.com/mrdoob/three.js) |
| better-sqlite3 | MIT | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |

All OLYMPUS-original code is licensed under AGPL-3.0-or-later. Vendored upstream code retains its own license.

---

## Key upstream projects

### OpenCode
The agent runtime that powers OLYMPUS. OpenCode provides the plugin system, tool definitions, hook events, and the `opencode run` CLI that spawns agents.
- [opencode.ai](https://opencode.ai)

### ECC (Enhanced Claude Code)
The hooks system (tool.execute.before/after, session.idle, permission.ask) is based on ECC's plugin architecture. The ECC hook translator (`ecc-hooks`) was retired in #189 — OpenCode v2's native permissions, skills, and caching cover it; the remaining OLYMPUS hooks live in `.opencode/src/` and compile to `.opencode/plugin-dist/`.
- MIT licensed

### agency-agents (msitarzewski/agency-agents)
The 118-demigod fleet's design patterns — phase-gated pipelines, per-demigod specialty with no overlap, god-review protocol, clv2 instinct-querying integration — are adapted from The Agency's 230+ specialized AI agents. Each OLYMPUS god now has 4-5 deeply specialized demigods (identity, mission, critical rules, deliverables, workflow) modeled on this roster.
- MIT licensed — [github.com/msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)

### The ArtCraft Crafting Apps (vendored builds + icons + the mark)
The Craft Apps pane (W-M CRAFT-VENDOR, v0.0.8) DOWNLOADS the thirteen open-source Craft apps into `~/.olympus/craft-apps/` — the self-hosted WebAssembly builds (SHA-256-verified official release artifacts) served from the OLYMPUS origin, plus the optional per-OS native portable builds; the ArtCraft Studio rides the live web lane (their hosted product). The vendored app icons in `public/craft-apps/logos/` are each app's own icon, copied unmodified from its repository, licensed like that app (MIT OR Apache-2.0). The **ArtCraft mark** (`public/craft-apps/logos/artcraft-icon.svg`, the Studio card) is the official ArtCraft icon, copied unmodified from getartcraft.com and used to identify their product (the user's directive); it remains a **trademark of the ArtCraft Team** — credited here, never presented as an OLYMPUS mark.

The thirteen apps, each its own upstream (all Apache-2.0, all by the ArtCraft team — the heavy creative lanes OLYMPUS drives via the `olympus-craft` MCP):
- [storytold/photocraft](https://github.com/storytold/photocraft) (image editor) · [storytold/vectorcraft](https://github.com/storytold/vectorcraft) (vector illustration) · [storytold/filmcraft](https://github.com/storytold/filmcraft) (video editor) · [storytold/lightcraft](https://github.com/storytold/lightcraft) (photo library & raw)
- [storytold/pdfcraft](https://github.com/storytold/pdfcraft) (PDF workbench) · [storytold/effectcraft](https://github.com/storytold/effectcraft) (motion graphics & VFX) · [storytold/designcraft](https://github.com/storytold/designcraft) (page layout & publishing) · [storytold/figcraft](https://github.com/storytold/figcraft) (interface design)
- [storytold/wordcraft](https://github.com/storytold/wordcraft) (word processing) · [storytold/soundcraft](https://github.com/storytold/soundcraft) (audio workstation) · [storytold/deckcraft](https://github.com/storytold/deckcraft) (presentations) · [storytold/cadcraft](https://github.com/storytold/cadcraft) (CAD & drafting) · [storytold/gridcraft](https://github.com/storytold/gridcraft) (spreadsheets & data)

Plus the suite's home: [github.com/storytold/artcraft](https://github.com/storytold/artcraft) (the Studio — MIT/Apache-2.0 dual) · [getartcraft.com/apps](https://www.getartcraft.com/apps) (the official catalog) · [storytold/craft-launcher](https://github.com/storytold/craft-launcher) (their launcher — the update-sweep design inspiration: the releases/latest redirect + SHA-256 verification + never-replace-a-running-app laws are adopted from it).

### OriginKit + Skiper UI (UI references — referenced only)
The curated component inspiration catalog cites OriginKit's free animated-component library (the official MCP; the vellum-ai plugin MIT) and Skiper UI's free shadcn-registry components (PREMIUM = paid upstream, referenced never vendored). OLYMPUS carries the catalog + the demos + the fetch lanes — never the component source.
- [originkit.dev](https://www.originkit.dev) · [skiper-ui.com](https://skiper-ui.com)

### Superpowers / Caveman / Impeccable
The three core skills that form OLYMPUS's compression + quality layer:
- **Superpowers** — dispatching parallel agents, writing plans, verification-before-completion
- **Caveman** — output compression (natural language → terse caveman, 65% reduction)
- **Impeccable** — code quality enforcement

### brain-atlas
The 3D brain visualization renderer (WebGL2 + Canvas2D fallback). Provides the point-cloud brain surface, node positioning, lobe regions, and edge rendering.
- MIT licensed

### mcp-compressor
Atlassian's MCP schema compressor. Wraps the 3 heaviest MCP servers (github, context7, serena) and compresses their tool descriptions/schemas by 70–97%.
- Apache-2.0

### sqlite-vec
SQLite extension for vector search. Powers the skill index (TF-IDF cosine search across 330 skills).
- MIT licensed

---

## Vendored skills (330)

The `.opencode/skills/` directory contains 330 vendored skills from multiple sources:
- Superpowers repo (14 sub-skills)
- ECC repo
- OpenDesign references
- OLYMPUS gap-fillers (caveman, impeccable, continuous-learning-v2, etc.)
- Additional specialist skills

Each skill retains its upstream license. See individual `SKILL.md` files for attribution.
