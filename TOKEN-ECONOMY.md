# OLYMPUS Token Economy

> How OLYMPUS achieves high quality at low cost — from zero (free tier) to the GO plan ($10/mo flat). 5-layer compression · Hot/Warm/Cold tiers · Instinct short-circuits · Symphony Layer 5 · Free economics.

## 5-layer compression stack

| Layer | Path | Compression | Tool |
|-------|------|-------------|------|
| 1 | User ↔ Apollo | None (full prose) | — |
| 2 | Apollo ↔ Gods | Caveman (65% reduction) | caveman skill |
| 3 | Gods ↔ Demigods | Strategic-compact (at logical boundaries) | strategic-compact skill |
| 4 | Demigods ↔ Tools | None (no LLM — raw tool I/O) | — |
| 5 | Gods ↔ Demigods (latent) | Symphony (70–90% transport reduction) | VibrationalSignature |

### MCP-level compression

- **mcp-compressor** — wraps the 3 heaviest MCP servers (github, context7, serena). Compresses tool descriptions/schemas. 70–97% reduction (benchmarked by Atlassian). Apache-2.0.
- **tamp** — compresses MCP tool output (what comes back from a tool call). Orthogonal to mcp-compressor. Lossless.

### God-level compression

- **Caveman** — compresses god output (natural language → terse caveman). 65% reduction. Per-god level.
- **Strategic-compact** — manages WHEN to compact (at logical task boundaries). OLYMPUS standard.

---

## Hot/Warm/Cold tier system

The `olympus-dynamic-context` plugin filters which skills load into a god's system prompt:

| Tier | What | Token cost | Count |
|------|------|------------|-------|
| **Hot** | Mastered skills (in `mastered-skills/<god>.md`) | ~1,400 | ~5–10 per god |
| **Warm** | Stack-relevant skills (tags match active stack) | ~4,000 | Up to 20 |
| **Cold** | All other skills | 0 (not loaded) | ~330 |

Without tiering, all 330 skill descriptions would load (~72,000 tokens per request). With tiering, a non-trivial request loads ~22,000 tokens — an **81% input reduction**.

MCPs are also tiered: hot MCPs always load, warm MCPs load for domain-relevant tasks, and cold MCPs require explicit equip. This prevents unused MCP tool schemas from inflating the system prompt.

---

## Instinct gate (short-circuit)

When a god's instinct matches the task with confidence ≥ 0.85, the dispatch **short-circuits**:

| Component | Normal dispatch | Short-circuit |
|-----------|----------------|---------------|
| Task text + context | ~22,000 tokens | ~500 tokens |
| Instinct body | 0 | ~200 tokens |
| **Total input** | **~22,000** | **~700 tokens** |

That's a **97% input reduction** on short-circuited dispatches. As the brain matures (more empirical instincts), the short-circuit rate climbs from 0% (cold start) toward 70%+.

---

## Skill index

The skill index (`~/OLYMPUS-VAULT/03_Index/skill-vec.db`) provides sub-millisecond TF-IDF cosine search across all 330 skills. When the instinct gate doesn't short-circuit, the router searches the index for the top-5 relevant skills and surfaces them as hints — without loading all 330 skill descriptions.

Build: `node scripts/build-skill-index.js`

---

## Arsenal Resonance (feedback loop)

Every dispatch outcome is logged to `~/OLYMPUS-VAULT/03_Index/arsenal-resonance.jsonl`:

```json
{
  "ts": "2026-07-25T...",
  "task_signature": "build nextjs postgres project",
  "god": "apollo",
  "skill": "writing-plans",
  "mcp": null,
  "demigod": "planner",
  "outcome": "success"
}
```

The Symphony Arsenal Resolver reads this log to compute per-skill/per-mcp/per-demigod confidence scores. When a similar task comes in (Jaccard similarity ≥ 0.4), the resolver returns the proven arsenal as hints. If coherence ≥ 0.85, a quick-circuit fires.

This is the feedback loop that makes OLYMPUS more efficient over time — every dispatch outcome makes future dispatches smarter.

---

## LLM strategies

| Strategy | Apollo | Atlas | Specialists | Vault | Est. cost/day |
|----------|--------|-------|-------------|-------|---------------|
| **go-max-quality** | GLM-5.2 | Hy3 | Kimi K3 / K2.7 Code | DeepSeek V4 Flash | Higher |
| **go-balanced** (default) | GLM-5.2 | Hy3 | DeepSeek V4 Pro / Qwen3.7 Plus | DeepSeek V4 Flash | Moderate |
| **go-budget** | GLM-5.2 (sacred) | Hy3 | DeepSeek V4 Flash | DeepSeek V4 Flash | Low |
| **zen-max-quality** (**ZEN**) | GLM-5.2 | Gemini 3.5 Flash | Claude Sonnet 5 / GPT-5.4 | Gemini 3.5 Flash | Higher (pay-as-you-go) |
| **zen-balanced** (**ZEN**) | GLM-5.2 | Gemini 3.5 Flash | Claude Sonnet 5 / Kimi K2.7 Code | MiniMax M2.7 | Moderate (pay-as-you-go) |
| **zen-budget** (**ZEN**) | GLM-5.2 | Gemini 3.5 Flash | MiniMax M2.7 | MiniMax M2.7 | Low (pay-as-you-go) |
| **free-openrouter** (**Free OpenRouter**) | strongest OpenRouter free model live | strongest OpenRouter free model live | second-strongest OpenRouter free model live | Nemotron 3 Nano (free) | **$0** |
| **free-big-pickle** (**Free Big Pickle**) | one free flagship — all 10 gods incl. Callimachus | one free flagship | one free flagship | Nemotron 3 Nano (free) | **$0** |
| **free-nvidia-build** (**Free Nvidia Build**) | **the distributed pantheon (#106)** — GLM-5.3 (753B) | GLM-5.3-Flash | Kimi K3 (2.8T) | GLM-5.3-Flash (the volume lane) | **$0** |

Apollo is always on GLM-5.2 in the GO + ZEN strategies. Atlas is on Hy3 in all GO strategies and on Gemini 3.5 Flash in the ZEN strategies (Hy3 is GO-plan-only). In the budget strategies, all gods except Apollo and Atlas drop to DeepSeek V4 Flash (GO) / MiniMax M2.7 (ZEN) for maximum savings.

### GO plan budget

- **GLM-5.2**: 4,300 requests/month (Apollo alone)
- **DeepSeek V4 Pro / Qwen3.7 Plus**: shared specialist pool
- **DeepSeek V4 Flash**: vault + Callimachus (cheapest, highest volume)

When > 70% of dispatches short-circuit AND average confidence > 0.80, Apollo suggests switching to go-budget (the brain is mature enough to run on cheaper models).

### Free economics ($0)

The **free strategies** run OLYMPUS entirely on free-tier providers — no plan required. `free-openrouter` / `free-big-pickle` refresh their picks automatically from the live provider lists (`scripts/refresh-free-models.js`); `free-nvidia-build` is the **distributed pantheon (#106)** — a USER-PINNED anchor set (probe-verified 2026-10-08):

| Provider | Model lane | Role | Cost |
|----------|-------|------|------|
| **OpenRouter** (free) | nvidia/nemotron-3-ultra-550b-a55b:free (550B, 1M ctx) | Apollo, Atlas, Hephaestus (the `free-openrouter` primary trio) | $0 |
| **OpenRouter** (free) | nvidia/nemotron-3-super-120b-a12b:free (or ling-3.0-flash:free) | Artemis, Athena, Dionysus, Hermes, Persephone, Prometheus | $0 |
| **OpenRouter** (free) | nvidia/nemotron-3-nano-30b-a3b:free | Callimachus + small_model (titles, compaction) | $0 |
| **NVIDIA Build** (free, `free-nvidia-build`) | `nvidia-glm/z-ai/glm-5.3` (753B, 1M ctx) | Apollo, Dionysus, Persephone — the entry/reasoning lane | $0 |
| **NVIDIA Build** (free, `free-nvidia-build`) | `nvidia-glm/z-ai/glm-5.3-flash` (320B/18B-active, 1M ctx) | Atlas, Athena, Callimachus + vaultLlm + small_model — the fast/volume lane | $0 |
| **NVIDIA Build** (free, `free-nvidia-build`) | `nvidia-kimi/moonshotai/kimi-k3` (2.8T MoE, 104B active, 1,048,576 ctx) | Hephaestus, Artemis, Prometheus — the long-horizon coding lane | $0 |
| **NVIDIA Build** (free, `free-nvidia-build`) | `nvidia-meta/meta/muse-glimmer-30b` (29.6B, 131,072 ctx) | Hermes — the alternate fast lane | $0 |
| **NVIDIA Build** (free, `free-nvidia-build`) | `nvidia-deepseek/deepseek-ai/deepseek-v4.1-flash` (552B MoE, 8B active, 1M ctx) | (unassigned — the pool timed out 3× at the 2026-10-08 probe, disclosed) | $0 |

**NO Nemotron in the NVIDIA strategy — the user's ban, forever** (low effective context + the
observed contention pool). The anchor set is USER-PINNED: the refresh verifies availability +
carries renames, NEVER replaces an anchor with "the strongest live"; a dead anchor surfaces
loudly, never silently swapped. Per-family provider entries (`nvidia-glm` / `nvidia-deepseek` /
`nvidia-kimi` / `nvidia-meta`) give each lane its own client pool — same base URL, same key.

NVIDIA Build's model list is **public** — `scripts/refresh-free-models.js` fetches it without any key, so the `free-nvidia-build` strategy always has a live model list. Requests still need a free NVIDIA API key (`nvapi-...`) configured inside OpenCode.

The output caps are set by apply-strategy.js (`provider.<id>.models.<model>.limit.output`) — opencode 1.18 sends `max_tokens=32000` by default, which alone would blow the free rate windows.

**Quality tradeoff:** Free-tier models are not GO-plan quality. Apollo's planning is weaker than GLM-5.2 and Hephaestus's code is below DeepSeek V4 Pro. But the instinct gate's short-circuit path mitigates this — short-circuited dispatches don't make LLM calls at all, so a mature brain (70%+ short-circuit rate) incurs zero token cost on 70% of dispatches regardless of strategy.

**Rate limits — the free-tier shape (#106's finding):** NVIDIA Build's free tier allows
**40 requests/minute per API key** — an AGGREGATE ceiling across ALL models on the key
(that limit returns 429). The user's observed `Service temporarily overloaded` was NOT the
key limit — it was **per-model serving-pool contention (503-class)**: the single most-loaded
lane (Apollo's entry lane) sat on the most-contended pool, so one overloaded pool killed the
whole terminal. The distributed pantheon is the cure: four anchors = four serving pools
(per-family client pools on top), the three heaviest paths never share a pool, ≤3 gods per
anchor. OpenRouter's free tier is ~20 req/min per key.

**How 9 gods + the vault fit in 40 RPM — the Symphony compression math:** gods share context
through the Symphony bus (`~/.olympus/symphony-bus.jsonl`), MODEL-INDEPENDENT — models are
lanes, not silos. The 5-layer compression (caveman/strategic-compact classes, 70–90%
transport reduction) keeps inter-god context round-trips at ~200-400 tokens instead of
full-knowledge payloads; a dispatch wave's LLM calls are the gods' own turns, not context
broadcasts. At the observed free-tier cadence (single-turn contracts + the instinct gate
short-circuiting 70%+ of dispatches in a mature brain — each short-circuit is one fewer LLM
call), a 9-god pantheon with the volume work (heartbeat, vault writes, titles/compaction) on
the flash lane stays comfortably inside the aggregate window: the heartbeat + vault lanes
are low-token calls, the heavy three are spread across three pools, and the request-per-minute
ceiling is shared across four serving pools' worth of latency isolation. Heavy parallel
dispatch may still hit the ceiling — the honest failure card (#98) reports it; the
short-circuit path is the pressure valve.

**Sessions are lanes; the disk carries the campaign — the hop runtime (#109's shape):** an
architectural task is no longer ONE long god-session (the 150k-token monolith needed the
pool healthy for its FULL length — the user's 2026-10-09 run died at ~80%, ~5.5 min lost).
It is a DETERMINISTIC SPINE (a script, zero LLM tokens) walking SMALL LLM HOPS
(`src/lib/hop-runtime/`): Apollo emits `dispatch-plan.json` (a DAG of ≤16,384-output-token
hops, one god each, artifacts on disk), the walker dispatches per hop on the god's own lane
(concurrency ≤ 3, the #106 law), verifies DETERMINISTIC-FIRST (file-exists / build / lint —
0 tokens, 0 pools), and PARKS on exhaustion with `--resume` (the session id + artifacts
preserved). Why this wins on free: a ≤16k hop needs ~30–60s of pool availability — bursts
fit BETWEEN peaks; monoliths don't. Blast radius shrinks from "lose a 5.5-minute run" to
"lose one hop — resume costs one prompt". The retry crescendo (#107) absorbs the bursts
that fit; the park survives the ones that don't. Per-hop telemetry (tokensIn/out, lane,
duration, retries absorbed — `<lane>/.olympus-hop-telemetry.jsonl`) is the measured
free-token economy the #83 sizing matrix will cite.

Requirements: at least one free-tier key — OpenRouter and/or NVIDIA — added inside OpenCode (`olympus opencode` → Settings → Providers), or legacy `OLYMPUS_OPENROUTER_KEY` / `OLYMPUS_NVIDIA_KEY` env vars. **One key is enough** (NVIDIA recommended for the distributed pantheon). Keys are configured inside OpenCode, never injected by OLYMPUS (see [MODEL-STRATEGIES.md](MODEL-STRATEGIES.md)).

### Zen economics (pay-as-you-go)

The **ZEN** strategy (`zen-balanced`) runs the full 128-agent OLYMPUS on OpenCode Zen — no request caps, zero-retention, charged per request. Representative per-1M rates (verified 2026-07-31): GLM 5.2 $1.40/$4.40 · Gemini 3.5 Flash $1.50/$9.00 · Claude Sonnet 5 $2.00/$10.00 · Kimi K2.7 Code $0.95/$4.00 · GPT-5.4 $2.50/$15.00 · MiniMax M2.7 $0.30/$1.20 · DeepSeek V4 Pro $1.74/$3.48 · DeepSeek V4 Flash $0.14/$0.28 · Qwen3.7 Plus $0.40/$1.60. Authorize via `olympus opencode` → `/connect` → OpenCode Zen. See [MODEL-STRATEGIES.md](MODEL-STRATEGIES.md).

---

## Terminal Bridge — zero-token IPC

The Terminal Bridge (port 3740) and WebSocket bridge (port 3738) are pure local IPC pathways between the OLYMPUS Electron app and external IDE extensions (VSCode, Zed, Cursor). They consume **zero LLM tokens** — all communication is local JSON over WebSocket (`ws://127.0.0.1`, token-gated). The bridge reduces context-switching overhead (no need to alt-tab between OLYMPUS and your editor) without adding a single token to the budget.

---

## Cost example: full project build

"Build a Next.js + Postgres project from scratch" (complexity: architectural)

| Stage | Without OLYMPUS | With OLYMPUS (go-balanced) |
|-------|----------------|--------------|
| Apollo (plan) | ~115K in / 3K out | ~22K in / 3K out |
| 5 specialist gods | ~575K in / 15K out | ~110K in / 15K out |
| 10 demigods (70% short-circuit) | ~1,150K in / 30K out | ~71K in / 10K out |
| **Total** | **1,840K in / 48K out** | **203K in / 28K out** |
| **Savings** | — | **89% input / 42% output** |

The same project on a **free strategy** (e.g. `free-openrouter`): **$0 total cost**, ~80% quality, same short-circuit rate. The savings come from: hot/warm/cold tier filtering (81%), instinct short-circuits (97% on 70% of demigod dispatches), and MCP allowlist enforcement (only the god's allowed MCPs load).

---

## Benchmark recording costs

When benchmark recording is enabled (Settings → Benchmark Recording toggle), each finished run is logged to `~/OLYMPUS-VAULT/07_Reviews/benchmarks/dispatches.jsonl` — one row per (session, agent), written when the run goes idle, when recording is toggled off, and best-effort on app shutdown. The writer is app-side (`src/lib/benchmarks.ts`), not a plugin, so it records runs started from Zed and other non-OLYMPUS spawns too. This is **pure file I/O** — zero LLM tokens, < 1KB per row. The file is pruned when it exceeds 50MB (configurable via `maxBenchmarkLogMB` in `~/.olympus/vault-policy.json`). The recording is opt-in and off by default.

---

## Summary

| Mechanism | Reduction | Notes |
|-----------|-----------|-------|
| Hot/Warm/Cold tiers | 81% input | Only mastered + stack-relevant skills load |
| Instinct short-circuits | 97% per dispatch | Kicks in as brain matures (70%+ hit rate) |
| Symphony latent transport | 70–90% parallel dispatch | Pure local code, zero tokens |
| Caveman compression | 65% per god output | Terse natural language |
| Strategic-compact | Boundary-gated | Only compacts at logical task edges |
| Free strategies | 100% cost | $0 — runs on OpenRouter + Groq + NVIDIA Build free tiers |
| Terminal Bridge | 100% (not applicable) | Local IPC, zero LLM tokens |
