# OLYMPUS Roadmap

**v0.0.8 is the current release** (shipped 2026-10-21 — "CRAFT-VENDOR": the thirteen ArtCraft apps DOWNLOADED inside OLYMPUS — the self-hosted web builds vendored + auto-updated + no login; the native portable lane; the OLYMPUS-built olympus-craft MCP; the real app logos; the version-stamp badge fix). See [CHANGELOG.md](CHANGELOG.md) for the full arc.

---

## SHIPPED — v0.0.3 through v0.0.8 (2026-10-17 → 2026-10-21)

- v0.0.3 "the fix-OLYMPUS-itself release": the hop runtime wired end-to-end, the exit gate, the UAT cure (LUMINA walked 14/14).
- v0.0.4 "Mission Control": task timers, the TASKS sheet, the drill-down, the honest Cost screen.
- v0.0.5 "THE ATELIER'S TOOLS": the media vault, the describe lane, semantic search.
- v0.0.6 "THE FORGE COMPLETES" + the premio waves: FORGE-3D, the agentic RAG, GLB ingestion, free+BYOK image generation, every MCP configurable, TOTAL VISIBILITY, electron 44.
- v0.0.7 "THE CRAFT INSIDE": the 13 ArtCraft apps + the Studio embedded, the UI-references lane, the demigod naming law, React 19.3.1, the plugin cure (v2 loads the compiled JS, no more source failures), the originkit MCP, the plain release-title law (CI-enforced).
- v0.0.8 "CRAFT-VENDOR": the Craft Apps move from live-site embeds to DOWNLOADS INSIDE OLYMPUS — the self-hosted WASM web builds (SHA-256-verified, auto-updated, no login) served from the OLYMPUS origin, the native portable lane, the OLYMPUS-built `olympus-craft` MCP (upstream ships none), the 13 official logos, the "Craft apps" menu, the version-stamp badge cure, the docs/version sweep (the v0.0.7 "No changes" release notes retro-filled with the real story).

## The ladder to v0.1.0 — two releases

### v0.0.9 — "THE FIELD POLISH + THE EDITORS + THE PAIR FOUNDATION" (the devices release)

1. **The UAT wave** — every finding from the user's from-zero manual test becomes a fix/feat with taxonomy. **The 2026-10-21 first harvest**: the 15-minute silent stall (the #129 free-anchor class — FIXED in the v0.0.8 correction commit: the warm-stall bound + the lane-probe pre-flight), and the plugin surface finding (below).
2. **PLUGIN-V2 — the Effect API migration** (the correction-commit finding): the installed CLI's loader expects the Effect-based v2 plugin shape (`{ id, effect/setup }`, `server()` entrypoints) — all 9 OLYMPUS plugins still ship the old Promise-hooks shape and fail to load in spawned runs ("Plugin export is not a function"). Migrate the router/context-cache/reasoning/skill-registry surface, rebuild, verify with `opencode plugin list` in a spawned run. This also revives the **context-cache** — free-tier oxygen.
3. **The Originkit fetch guard** — the free key is 10 fetches/day; a budget counter surfaced in the References tab + the god flow (the honest "you have N left today").
4. **The first-run verifications** — the Terminal Bridge :3740 + the short-circuit log lighting up on the first instinct gate (the test observations that become fixes if they surface issues).
5. **EDITORS-2 (#171)**: every bridge re-verified against the current editors — the vscode-olympus extension (build, publish, the bridge handshake), Zed/VSCodium/Cursor detection, the Terminal Bridge — plus EDITORS.md re-validated and a store-ready status for each surface.
6. **PAIR-1 phase 1 (#170)**: the probe-first investigation of the OpenCode V2 pair protocol (the auth, the channel, what syncs), the OLYMPUS-side bridge design (the feed + the gates through the pair channel), and the first wired proof: a prompt sent from a second device reaching the campaign.

### v0.1.0 — "THE MILESTONE" (OLYMPUS on every device)

1. **PAIR-1 complete (#170)**: the full remote surface — the campaign feed, the Parthenon + the ETA projection, and the HITL gates answered from the phone (the plan-walk approval remote; the same vault record, no state bifurcation).
2. **The multisession per-god pool** — the B6 proposal (readers first, the per-god session pool deliberately last — the 0.1 milestone asks for it).
3. **The matured candidates** that earn their place in the arc's conversation: voice input (if the user opts in), the short-circuit $ backfill (the resonance loop computing real token deltas), the vendored offline Craft lane (if the size math wins).
4. **#166 (JET) + #140 (BENCH-2)** — enter whichever version the user's decisions land in.

## The standing opportunities (candidates, no dates)

- **The vendored Craft lane — SHIPPED (v0.0.8 W-M)**: the self-hosted WASM web builds download into `~/.olympus/craft-apps/` (7-14 MB each, SHA-256-verified, auto-updated) and the pane serves them from the OLYMPUS origin; the native portable lane + the `olympus-craft` MCP ride alongside. The old "Electron-resources bundling" idea stays retired — the runtime-download lane wins on size honesty.
- **TRELLIS local 3D** — parked (no NVIDIA GPU on the current box; the honest requirements in docs/research/3d-lanes.md).
- **Meshy hosted 3D** — the BYOK candidate, wiring deferred until the user opts in.
- **Voice input** — the app listens (a candidate for v0.1.0 if the user calls it).

**License:** AGPL-3.0-or-later. See [LICENSE](LICENSE).
