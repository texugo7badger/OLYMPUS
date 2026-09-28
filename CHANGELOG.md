# Changelog

All notable changes to OLYMPUS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## [Unreleased]

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
