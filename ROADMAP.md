# OLYMPUS Roadmap

**v0.0.11 is the current release** (shipped 2026-10-24 — "THE TOOL LOOP": the v2 turn is idle only on a terminal finish (a finished tool-calls wave is the loop, not the answer — the AIME field bug), and Free Hybrid's roster moves to DeepSeek V4.1 Flash as Apollo's planner over Beam's wide window, with a two-pass task-fit resolver. Earlier in the same cycle: "FREE HYBRID": the three free splits become ONE free strategy over every registered free source — OpenCode GO/Zen free, OpenRouter free, NVIDIA Build free — with a per-god roster fitted to each god's task (Beam 1.0 for planning, MiniMax M3.1 Flash for orchestration, DeepSeek V4.1 Flash for code and the vault), load-spread, user pins, and the distributed NVIDIA pantheon as the keyless fallback). See [CHANGELOG.md](CHANGELOG.md) for the full arc.

---

## SHIPPED — v0.0.3 through v0.0.11 (2026-10-17 → 2026-10-24)

- v0.0.3 "the fix-OLYMPUS-itself release": the hop runtime wired end-to-end, the exit gate, the UAT cure (LUMINA walked 14/14).
- v0.0.4 "Mission Control": task timers, the TASKS sheet, the drill-down, the honest Cost screen.
- v0.0.5 "THE ATELIER'S TOOLS": the media vault, the describe lane, semantic search.
- v0.0.6 "THE FORGE COMPLETES" + the premio waves: FORGE-3D, the agentic RAG, GLB ingestion, free+BYOK image generation, every MCP configurable, TOTAL VISIBILITY, electron 44.
- v0.0.7 "THE CRAFT INSIDE": the 13 ArtCraft apps + the Studio embedded, the UI-references lane, the demigod naming law, React 19.3.1, the plugin cure (v2 loads the compiled JS, no more source failures), the originkit MCP, the plain release-title law (CI-enforced).
- v0.0.8 "CRAFT-VENDOR": the Craft Apps move from live-site embeds to DOWNLOADS INSIDE OLYMPUS — the self-hosted WASM web builds (SHA-256-verified, auto-updated, no login) served from the OLYMPUS origin, the native portable lane, the OLYMPUS-built `olympus-craft` MCP (upstream ships none), the 13 official logos, the "Craft apps" menu, the version-stamp badge cure, the docs/version sweep (the v0.0.7 "No changes" release notes retro-filled with the real story).
- v0.0.9 "THE FIELD POLISH + THE EDITORS + THE PAIR FOUNDATION": **SHIPPED 2026-10-23** — the six-wave field campaign (W1 true idle + named aborts, W2 the poll diet, W3a the exact-cost split, W3b the Beam flagship + DeepSeek V4.1 Flash, W4 the dispatch DNA, W5 premium chat UX), **PLUGIN-V2** (the v2 Effect contract, compiled to `.opencode/plugin-dist`, five native-covered plugins retired), the overnight auto-queue + the pinned OpenCode update lane, the **OriginKit 10/day budget** (#198), the **live preview URL bar** (#202), the **premium chat composer + persisted attachments** (#203), **EDITORS-2** re-verified with the packaged vsix (#199), the **first-run proof** (#201), and **PAIR-1 phase 1** probed end-to-end (#200).
- v0.0.11 "THE TOOL LOOP": **SHIPPED 2026-10-24** — the terminal-finish rule (tool-calls ≠ turn end; the AIME field bug, S9) + the DeepSeek-first Free Hybrid roster (Apollo/Hephaestus/Callimachus on DeepSeek V4.1 Flash, Atlas on GO Beam, Athena/Dionysus/Hermes on inkling, Prometheus on flint, Persephone on north-mini) + the two-pass task-fit resolver + the NVIDIA DeepSeek probe (catalogued, aborts at 60s — not wired).
- v0.0.10 "FREE HYBRID": **SHIPPED 2026-10-23** — ONE free strategy over every registered free source (GO/Zen free, OpenRouter free, NVIDIA Build free), a per-god roster fitted to each god's task (Beam 1.0 planning, MiniMax M3.1 Flash orchestration/512k out, Kimi K2.5 QA, DeepSeek V4.1 Flash code + vault, Cat Jam research), load-spread (≤3 gods/lane), user pins (`free-hybrid-overrides.json`), the #106 distributed NVIDIA pantheon as the keyless fallback, legacy free ids as deprecated aliases, and the GO deepseek price correction ($0.15/$0.60 + $0.66/$1.98).

## The ladder to v0.1.0

### v0.0.12 — "THE FREE-FIRST ECONOMY" (COST-2..COST-6)

The plan shipped in v0.0.9 (`docs/research/cost-strategy-remodel.md`); **the preset shipped in v0.0.10/v0.0.11 as Free Hybrid (COST-4 — #216)**; the economy layer is next:

1. **The provider budget ledger** — per-provider daily counters (Zen free / OpenRouter / NVIDIA), local-midnight reset, 80% alert + proactive failover, 100% honest stop (COST-2).
2. **The workload-aware router** — multimodal / long-context / agentic / background classification; free-first lanes with the *paid last resort* under a hard monthly cap (default US$ 5); Apollo stays GLM (COST-3).
3. **Free/paid telemetry** — `cost.jsonl` source labels, free share, per-provider spend, alert rows (COST-5).
4. **The A/B benchmark + 24h UAT** — free vs paid quality/cost report; shadow-mode rollout first, rollback to `go-balanced` documented (COST-6).

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
