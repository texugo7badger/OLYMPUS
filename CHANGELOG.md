# Changelog

All notable changes to OLYMPUS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## [v0.0.2] — 2026-10-05

Every line carries its evidence pointer. The night's register: `docs/registers/ISSUES.md`;
full reports under `reports/m3r2-p1/`, `reports/m3r2-p2/`, `reports/bench-in-1/`, `reports/fix-1/`.

### Added

- **The dispatch spine, closed end-to-end (L1–L5 dead)** — free-tier configs grant the full 11-tool OLYMPUS overlay to every god (L1); every dispatch self-registers in the dispatch registry with {id, god, target, timestamp, directive hash, status} and an unregistrable dispatch fails loudly, never silently (L2); invoke directives are registry-curated per god — the generic `"apollo"` default is dead (L3); emission records are schema-validated before the directive is emitted (L4); the full chain fires end-to-end — god → `symphony-dispatch` → zero-loss Vault signature (checksum-verified) → live feed event → registry entry → auto-injected demigod (L5). Evidence: commits `83362e9` + `97c6997`; `reports/m3r2-p1/` (27/27 + 22/22 fixtures).
- **Atlas, the single writer** — the sync-map records EVERY prompt the system receives (project via the chat.message hook; dispatch via the tool's entry; broadcast via symphony-resonate) with the full lifecycle (received → routed → done/failed); only Atlas writes the map (unforgeable token + hash-chain tamper evidence); any god queries identical state. Evidence: commit `04c6c2c`; `reports/m3r2-p2/` (16/16 fixture).
- **The generated-project EXIT GATE** — `scripts/project-exit-gate.mjs`: seven deterministic checks (lockfile, `npm ci`, build, dev + `curl /` == 200 on a self-cleaned ephemeral port, zero absolute symlinks, imports-vs-deps, route composition). "A generated project runs on the first try" is now structural. Wired at BOTH points: the generator's done-condition (the delivery contract) and the driver's census — the byte-counting census is retired (D30). The bench estimates this gate would have caught 15/16 failures automatically. Evidence: commit `53b8a27`; `reports/fix-1/` (9/9 RED/GREEN fixture).
- **The delivery contract (prompt layer)** — composition-first, `npm view` version resolution, export-surface validation, lockfile, gate-as-done: `.opencode/rules/common/generated-project-delivery.md` + the campaign driver's prompt verbatim. Evidence: commit `53b8a27`; 35/35 wiring fixture.
- **THE PROOF (the headline)** — one fresh cafeteria-class landing ("Cafeteria Grão & Alma") regenerated end-to-end with the corrected pipeline and **passed the exit gate with zero manual fixes** — all seven checks green (lockfile, ci, build, dev HTTP 200, portable tree, imports declared, composed route). Evidence: `reports/fix-1/` F4 (gate output verbatim); the tree at `~/olympus-bench/fix1/projects/cafeteria-grao-e-alma/`.

### Fixed

- **D18 (dispatch_outcome never fires on one-shot exits)** — process-exit finalize in both gate paths; mid-flight deaths land `failed`, never dangle; a failed finalize write is loud and keeps the entry open. Evidence: `04c6c2c`; `reports/m3r2-p2/` E1 (16/16).
- **D19 (dead model ids break subagent spawns)** — the `nvidia/z-ai/glm-5.2` pin retired → `glm-5.3` (live-verified against the catalogue); apply-time catalogue preflight executes the binary directly, with the catalogue's own suggestions and a loud `--force` escape. Evidence: `83362e9`; fixture G1/G3/G4 22/22.
- **D21 (two vault env vars; the real vault leak class)** — `OLYMPUS_VAULT` is the one canonical variable; `OLYMPUS_VAULT_DIR` deprecated with a loud warning; all 14 overlay call sites migrated; shipped src/lib artifacts now SELF-HEAL (the overlay postcompile syncs them every compile — the D22 stale-artifact class is structurally dead). Evidence: `04c6c2c`; zero direct env reads, grep-proven.
- **P-E harness hygiene (D27)** — the driver's lane scaffold puts ALL harness artifacts (opencode.json, .opencode, transcripts, injection root) at the LANE level; deliverables carry zero absolute symlinks/paths. The F4 deliverable verified: zero absolute paths in source, zero harness artifacts. Evidence: driver.mjs:76-90; `reports/fix-1/` F2.

### Changed

- **D12 verdict (misattribution corrected)** — the repo's cost parser was never broken (`readRealCosts` reads the on-disk snake_case shape); the zero-rows parser was bench-driver-side. rev-1's unverifiable register claim retired. Evidence: `reports/bench-in-1/` E2.
- **D17 struck + re-opened** — the agent-present attribution ladder predates the claimed night; the observed agent-less one-shot rows need session→god linkage at deterministic spawn → Part 5 (with D20). Evidence: `reports/m3r2-p2/` E2.

### Also in this release (landed batch 13, on main since `6694a3f` — cited for completeness)

- **#61** auto-retry on transient provider failures (`{429, 500, 502, 503, 504, provider_overloaded, stream_idle_timeout}`; 2 retries, same warm session, loud #56-style exhaustion guidance). Evidence: commit `3ef01b5`; `reports/13/`.
- **#62** watchdog auto-nudge before kill + permission-pending rendered distinct from stall. Evidence: commit `32d8967`; `reports/13/`.
- **#63/#64/#65** continuation inheritance, round-cap + declared defaults, decision checkpointing. Evidence: `reports/13/BATCH-13-REPORT.md` (146 assertions).

### Release facts

- **Suites: 14 green** (agreement-metric, context-distill, task-classifier, telemetry-slice, autonomy-gate, opencode-session, checkpoint, findings-foldback, dispatch-spine, free-lane-generator, atlas-sync, project-exit-gate, generation-contract + the bench RED/GREEN run) — ~250 deterministic assertions.
- **E4 (live config)** — explicitly ACCEPTED as gated-generator-equivalent: the dry-run reports "No changes needed" (zero diff); `opencode.json` @ sha256 `fcaf7c13…`. Evidence: `reports/m3r2-p2/` E4.
- **D10 cause-(c) CONFIRMED live** — the god prompts' #64 round-cap semantics read as "end the round" in one-shot runs, and turns end at the output-token limit mid-kit (`reason: 'length'` in the transcripts); minimal resumes complete in one shot (the D16 dilution curve held all night). Evidence: `reports/fix-1/` F4 (all strikes verbatim).


### Known Issues

- **D31 — one-shot generation turns can end at the output-token limit mid-kit (`reason: 'length'`) and the #64 round-cap god-prompt semantics read as "end the round" in one-shot runs** (the live-confirmed mechanical twin of D10). Mitigations shipped in this release: the single-turn override clause in the generation contract, minimal-strike automated resumes (the D16 dilution curve's compliant shape), and the exit gate as the deterministic catch-all — but a model/budget sizing fix remains open (Part 4/5 scope). Evidence: `docs/registers/ISSUES.md` D31; `reports/fix-1/` F4 (three `reason: 'length'` cuts verbatim).

## [Unreleased]

### Fixed (MADRUGA-FIX-3 — the generator night)

- **The generator carried the disease (N35, closed)** — `FREE_MODEL_LIMITS` in `scripts/apply-strategy.js` hard-coded output 2048 (1024 nano) + the dead `z-ai/glm-5.2`, with curated-wins-over-refresh merge (refresh immunity BY DESIGN) — so the live apply FALSE-GREENED over a sick config and a healthy live would be re-infected. All table lanes → 16384; the dead pin → `glm-5.3` across ALL mirrors (apply-strategy, model-strategies, olympus-hooks [R12: dist rebuilt + grep-verified], settings-dialog — found by check-strategy-sync). Evidence: `scripts/budget-guard.test.mjs` (the generator case, green 17/17).
- **Preflight lane-blindness (N36, closed)** — `preflightModelCatalogue` collected pinned models only; provider-block LANES were invisible (how glm-5.2 escaped the D19 gate). Lanes now join the id set; a dead lane fails the apply loudly. Plus **F3**: the modelsInUse scope fix (legacy lanes healed to the floor — groq, stale nvidia lanes) + **F3b** dead-residue cleanup (the apply removes lanes the table no longer knows). Cure-path proof: a dry-run over the live tree heals 12 lanes + removes 5 dead/residual lanes + passes the lane-sighted preflight. Evidence: the FIX-3 session log.
- **A second dead table lane found + fixed**: `nvidia/nvidia/nemotron-3-nano-30b-a3b` absent from the live catalogue (verified 2026-10-06, 57 models — only the omni-reasoning variant remains); pickNano's fallback moved to the live variant.

### Fixed

- **#76/D31 — the config-level output budget (the top killer)** — every provider lane in the shipped `opencode.json` declared `limit.output` 1024–2048 while a complete landing kit measures ~9,633 output tokens; turns ended mid-kit with `reason: 'length'` BY CONFIGURATION (three cuts verbatim, 2,015–2,039 tok at death). All 12 lanes now `16384` (floor 8192, derived from the F4 evidence — the derivation is in the guard's header). The **budget-guard** joins the battery (`scripts/budget-guard.test.mjs`, red 12/12 → green 12/12). Evidence: `scripts/budget-guard.test.mjs`; issue #76 progress comment.
- **D19 shipped-config completion** — the dead `z-ai/glm-5.2` pin (tracked `opencode.json:482`) → `z-ai/glm-5.3` (the live catalogue's own suggestion); grep-zero in the tracked config; the L4 apply-time preflight passes through the designed flow. Evidence: the p1 fixture family + the fix-2 dry-run.



### Added

- **Strategy activation gate** — strategies are blocked until the API they need is authorized inside OpenCode (see Changed).
- **10 built-in LLM strategies** (was 6): the Zen plan has the full 3-tier treatment — `zen-max-quality`, `zen-balanced`, `zen-budget` — on OpenCode Zen (`opencode/<id>`, pay-as-you-go, full 128-agent shape). Since the proprietary-API redesign, the ZEN tiers run Claude Sonnet 5 / GPT-5.4 / Gemini 3.5 Flash / Kimi K2.7 Code / MiniMax M2.7 (see the Changed entry).
- **`free-openrouter`** — the OpenRouter-only split of the Free config: primary trio on #1, specialists on #2, Callimachus on a fast background model.
- **`free-nvidia-build`** — NVIDIA Build free endpoints (build.nvidia.com): GLM-5.2 + the Nemotron family for free. Apollo + Atlas on the strongest NVIDIA free model live (Nemotron 3 Ultra 550B), the coding trio (Hephaestus/Athena/Dionysus) on pinned GLM-5.2 (best coding model), other specialists on #2, Callimachus on a nano-class background model. The NVIDIA model list is fetched live (public endpoint, no key needed); requests use a free `nvapi-...` key configured inside OpenCode. Model ids use the `nvidia/<vendor>/<model>` prefix (OpenCode's built-in `nvidia` provider).
- **Real-time free-model refresh across all free strategies** — `scripts/refresh-free-models.js` now fetches OpenRouter + Groq **+ NVIDIA Build** lists; apply-strategy.js routes the Free Groq / Free OpenRouter / Free Big Pickle / Free Nvidia Build strategies to the strongest free models currently live (24-hour TTL, `--refresh-models` to force).

### Changed

- **ZEN strategies redesigned around proprietary APIs** — `zen-max-quality` (Atlas Gemini 3.5 Flash, Athena+Hephaestus Claude Sonnet 5, others GPT-5.4, vault Gemini 3.5 Flash), `zen-balanced` (Athena+Hephaestus Claude Sonnet 5, specialists Kimi K2.7 Code, vault MiniMax M2.7), `zen-budget` (all others MiniMax M2.7). GO stays on the open-weight line (GLM, DeepSeek, Qwen, Hy3); ZEN is now the proprietary-API plan. Apollo stays on GLM-5.2 in both (sacred). All per-god maps updated in `model-strategies.ts`, `apply-strategy.js`, and the hooks mirror.
- **Full Zen catalog in the model picker** — `ZEN_MODEL_CLASSES` now covers every model OpenCode Zen currently supports (verified 2026-07-31, deprecated models excluded): GPT-5.x family, Claude, Gemini, Grok, Qwen-Max/Plus, Kimi, MiniMax, the open-weight line, and the free-on-Zen trials. Custom strategies and per-god overrides can now pin any of them.
- **ZEN branding** — the three Zen strategies display as **ZEN Max Quality** / **ZEN Balanced** / **ZEN Budget** in Settings and the LLM Strategy menu (ids unchanged: `zen-max-quality`, `zen-balanced`, `zen-budget`).
- **FREE badge** — the three free strategies (`free-openrouter`, `free-big-pickle`, `free-nvidia-build`) show **FREE** instead of `cost: low` in the strategy menu (their `estCostPerDay` is `free`).
- `isFreeTierStrategy` / `strategyFamily` now cover every `free-*` strategy id; the Zen family covers all three `zen-*` ids.
- Free-tier prompt char limits are provider-aware: OpenRouter **and NVIDIA** gods get 1000 chars, Groq gods 300.
- Auth status now detects a configured NVIDIA key (`auth.nvidia`, `OLYMPUS_NVIDIA_KEY`, `nvidia_key` in llm-providers.json) and recommends `free-nvidia-build`.
- Per-god overrides accept `nvidia/...` models; provider limits (context/output) are written for NVIDIA Build endpoints.
- **Strategy activation gate** — strategies are now **blocked** until the API they need is authorized inside OpenCode (GO plan for `go-*`, ZEN key for `zen-*`, Groq/OpenRouter/NVIDIA keys for the free strategies). Blocked cards render disabled with a lock + what's missing; the Settings save flow and the providers API (`/api/olympus/providers/gods`, 403 `API_NOT_CONFIGURED`) both reject blocked switches. Auth detection shared via the new server-only `src/lib/llm-auth.ts`; `strategyApiRequirement()` (pure) defines the strategy→API map.

### Removed

- **`go-with-free-fallback` ("Free") strategy removed** — the free tier is provider-specific now: `free-openrouter` (the direct successor — same split, OpenRouter-only), `free-big-pickle`, `free-nvidia-build`. All migration-remap code for a persisted `strategy: "go-with-free-fallback"` in `~/.olympus/llm-providers.json` has also been removed — re-apply a current strategy (`olympus apply-strategy <id>`) if an old value is still persisted.
- **Auto model fallbacks removed** — the `--use-fallbacks` flag, the `FALLBACKS` map (apply-strategy.js), and `GOD_FALLBACK_MODELS` / `getFallbackModel()` (model-strategies.ts) are gone. When a model's cap is hit, switch strategies manually (`go-balanced`, a Zen strategy, or one of the three free strategies).
- **`free-groq` strategy removed** — Groq's free tier (12K TPM window) cannot serve the ~46K-token OLYMPUS system prompt: every request overflowed and opencode's auto-compaction fell into an endless "anchored summary" loop (reproduced on free-groq, free-openrouter and free-big-pickle — all three had been running the same stale groq/gpt-oss-120b config because strategy switches never restarted the warm `opencode serve` server). All `groq/*` model entries and Groq's live-refresh entry were removed too.
- **Strategy switches now restart the warm OpenCode server** — `apply-strategy.js` kills the running `opencode serve` (and clears the conversation→session map) after rewriting opencode.json, so the new per-god models actually take effect instead of the server serving its stale startup config. This was the root cause of "one corrupted session is corrupting others": every strategy test ran the same stale model.

### Fixed

- **Free strategies no longer load cost telemetry** — the free config shape dropped `./.opencode/olympus` (the overlay that writes `~/.olympus/metrics/cost.jsonl`), so the status bar / Cost menu showed no token usage during free sessions. The overlay is back in the free plugin set (now 4 plugins) and cost events flow again.
- **Context indicator always showed 0%** — OpenCode ≥1.18 stores sessions in SQLite (`~/.local/share/opencode/opencode.db`), but `/api/olympus/context-usage` only read legacy JSON session files that no longer exist. The route now reads real usage from the DB (keyed by `conversationId` → warm session, fallback: newest session), so the ctx % + "new session" button work again.
- **"Stop" / reset / new-session didn't actually stop the run** — the terminal's `stop()` only reset client state; the in-flight POST kept streaming for up to 10 minutes (the stuck "anchored summary" loop the user saw, which kept appending events even after reset). `submit()` now uses an AbortController; `stop()`, reset, and new-session abort it, which propagates to `req.signal` and cancels the server-side warm opencode POST.
- **Handoff summaries could poison the next session** — `buildConversationSummary` fed the last 8 messages verbatim; a run of repeated assistant output (e.g. the loop) was replayed into the new session. Consecutive assistant/system/delegation/todo entries now collapse to the last one.

## [0.0.1] — 2026-07-27

The base release — the most complete and alternative way to run OLYMPUS.

### Added

- Initial public release.
- 10 gods (Apollo, Atlas, Artemis, Athena, Dionysus, Hephaestus, Hermes, Persephone, Prometheus, Callimachus) + 118 demigods (128 agents).
- Symphony v1.0 latent dispatch protocol with VibrationalSignatures.
- VaultBrain v3.0 self-curating brain with instinct short-circuits.
- Electron desktop app with Next.js 16 dashboard (localhost:3737).
- 3D Brain Atlas (Three.js / Canvas2D) visualizing gods, instincts, and knowledge.
- Editor Bridge — launchpad for Zed, VSCode, VSCodium, Cursor.
- Terminal Bridge (port 3740) — token-gated WebSocket for IDE extension PTY sharing.
- WebSocket bridge (port 3738) for real-time UI activity feed.
- **Persistent OpenCode session:** every conversation message runs on one warm `opencode serve` instance (`src/lib/opencode-session.ts`, port 3777, env override `OLYMPUS_OPENCODE_PORT`), with context retained across follow-ups. Applies to all strategies.
- 5-layer cascading compression stack (caveman, strategic-compact, Symphony).
- Hot/Warm/Cold skill + MCP tier system (81% input reduction).
- Skill index (sqlite-vec TF-IDF cosine search, 330 skills).
- 8 plugins (dispatch tracker, instinct gate, MCP gate, skill registry, go-cache, dynamic-context, ECC hooks, superpowers).
- 19 MCP servers with 3-layer gating (toggle, API key, god allowlist).
- 6 LLM strategies: go-max-quality, go-balanced, go-budget, **zen-balanced (Zen — OpenCode's pay-as-you-go gateway, full 128-agent shape, no request caps)**, go-with-free-fallback (Free), free-big-pickle (Free Big Pickle).
- 4 LLM providers (OpenCode GO, OpenCode Zen, OpenRouter free, Groq free).
- Eval harness with 5 golden tasks (CI gate via GitHub Actions).
- Benchmark recording (always-on opt-in, local-only).
- Vault backup via isomorphic-git (auto-commit every 5 min).
- AGPL-3.0-or-later license with CLA requirement.

### Changed

- **Free strategy:** `go-with-free-fallback` is labeled **Free** (id kept for back-compat). Primary gods run on the strongest free model currently live (550B / 1M-context flagship), specialists on the second-strongest, Callimachus on a fast background model.
- **Live model refresh:** `scripts/refresh-free-models.js` fetches the current OpenRouter + Groq free model lists, scores them, and writes `~/.olympus/free-models.json`. The Free strategies route gods to the current top models when that file is fresh (≤ 7 days).
- **Free Big Pickle:** all 10 gods — Callimachus included — run on the same best free model (default: `nvidia/nemotron-3-ultra-550b-a55b:free`, 550B params / 1M context). `small_model` + `vaultLlm` stay on Nemotron nano.
- **Groq path upgraded:** Groq-only config uses `groq/openai/gpt-oss-120b` instead of llama-3.3-70b.
- Action route startup timeout raised 45s → 120s with a clearer error message that covers free-tier rate limiting.
- Router plugin hardened: `isMcpTool` / `getMcpServer` guard non-string tool values.
- Action route: prompt/answer/context/new-session messages stream through the warm session; falls back to one-shot `opencode run --format json --session <id>` if the server dies mid-run.
- Settings: per-god model classes are filtered to the active strategy family (GO → `opencode-go/*`, Zen → `opencode/*`, Free → `openrouter/*` + `groq/*`).

### Fixed

- Overlay compile error in `dispatch.ts` (`lastInjectedAt` type missing on the injected tracker).
- Stale per-god overrides no longer silently pin old free models after a strategy default change.
- Auth detection no longer misreads Zen (`opencode`) or free-tier keys as a GO plan.
- Free-tier provider card no longer duplicates the provider list / models in use.

[0.0.1]: https://github.com/texugo7badger/olympus/releases/tag/v0.0.1
