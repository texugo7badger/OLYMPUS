# OLYMPUS Token Economy

> How OLYMPUS achieves high quality at low cost — from zero (your own hardware) to the GO plan. 5-layer compression · Hot/Warm/Cold tiers · Instinct short-circuits · Symphony Layer 5 · Zero-cost economics.

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
| **go-max-quality** | DeepSeek V4.1 Flash | Hy3 | Kimi K2.7 Code (backend) · Qwen3.7 Plus (frontend/integrations) · Kimi K3 (security) · MiniMax M3 (DevOps) | DeepSeek V4.1 Flash | Higher |
| **go-balanced** (default) | DeepSeek V4.1 Flash | Hy3 | Qwen3.7 Plus (frontend/QA/integrations) · DeepSeek V4.1 Flash (backend/security/DB) · MiniMax M3 (DevOps) | DeepSeek V4.1 Flash | Moderate |
| **go-budget** | DeepSeek V4.1 Flash | Hy3 | DeepSeek V4.1 Flash (backend/security/DB) · Qwen3.8 Flash (frontend) · MiMo-V2.6-Flash (QA/integrations/DevOps/vault) | MiMo-V2.6-Flash | Low |
| **zen-max-quality** (**ZEN**) | GPT 6.1 Sol | GPT 6.1 Sol | Claude Sonnet 5.5 (backend/integrations) · GPT 6 Sol (frontend) · Claude Opus 5.5 (security) · Gemini 3.1 Pro (DB) · Grok 4.7 (DevOps) | Claude Haiku 5.5 | Higher (pay-as-you-go) |
| **zen-balanced** (**ZEN**) | GPT 6.1 Sol | GPT 6 Luna | Claude Sonnet 5.5 (backend/security) · GPT 6 Luna (frontend/integrations) · Claude Haiku 5.5 (QA) · DeepSeek V4.1 Flash (DB) · Grok Build 0.1 (DevOps) | Claude Haiku 5.5 | Moderate (pay-as-you-go) |
| **zen-budget** (**ZEN**) | GPT 6 Luna | GPT 6 Luna | DeepSeek V4.1 Flash (backend/security/QA/DB) · GLM-5.3-Flash (frontend/DevOps) | Claude Haiku 5.5 | Low (pay-as-you-go) |
| **local** (**Local**) | the probed local model | the probed local model | the probed local model | the probed local model | **$0** |

Apollo rides **DeepSeek V4.1 Flash** in every GO strategy and **GPT 6.1 Sol / GPT 6 Luna** in ZEN — the planner is the quality floor, not a premium-model luxury. Atlas is Hy3 in GO (GO-only) and GPT 6.1 Sol / Luna in ZEN. DeepSeek V4 Pro and the GLM-5.3 planner rule are retired; GLM-5.3-Flash survives only in `zen-budget` frontend/DevOps. The source of truth is `src/lib/model-strategies.ts` — this table is checked against it by `npm run check-strategy-sync`.

### GO plan budget

- **GLM-5.3**: 4,300 requests/month (Apollo alone)
- **DeepSeek V4 Pro / Qwen3.7 Plus**: shared specialist pool
- **DeepSeek V4 Flash**: vault + Callimachus (cheapest, highest volume)

When > 70% of dispatches short-circuit AND average confidence > 0.80, Apollo suggests switching to go-budget (the brain is mature enough to run on cheaper models).

### Zero-cost economics ($0)

The **`local` strategy** runs OLYMPUS entirely on your own hardware — no plan, no key, no network. `olympus apply-strategy local` probes Ollama / LM Studio / vLLM / llama.cpp / any OpenAI-compatible endpoint and wires the full arsenal to it; the apply refuses with the probe table when nothing answers (see LOCAL-LLM.md).

A custom strategy may also use free endpoints from any provider registered in OpenCode (OpenRouter `:free`, NVIDIA Build, etc.). Free endpoints are rate-limited and often much slower — the Strategy Builder warns before saving one. They are useful for experiments, not for a deadline.

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
| **Savings** | — | **89% input / 42% output** [DESIGN-MATH] |

The same project on the **`local` strategy**: **$0 total cost**, same short-circuit rate. A custom strategy using free endpoints is also $0 but is rate-limited and slow. The savings come from: hot/warm/cold tier filtering (81%), instinct short-circuits (97% on 70% of demigod dispatches), and MCP allowlist enforcement (only the god's allowed MCPs load).

---

## Benchmark recording costs

When benchmark recording is enabled (Settings → Benchmark Recording toggle), each finished run is logged to `~/OLYMPUS-VAULT/07_Reviews/benchmarks/dispatches.jsonl` — one row per (session, agent), written when the run goes idle, when recording is toggled off, and best-effort on app shutdown. The writer is app-side (`src/lib/benchmarks.ts`), not a plugin, so it records runs started from Zed and other non-OLYMPUS spawns too. This is **pure file I/O** — zero LLM tokens, < 1KB per row. The file is pruned when it exceeds 50MB (configurable via `maxBenchmarkLogMB` in `~/.olympus/vault-policy.json`). The recording is opt-in and off by default.

---

## Summary

| Mechanism | Reduction | Notes |
|-----------|-----------|-------|
| Hot/Warm/Cold tiers | 81% input [DESIGN-MATH] | Only mastered + stack-relevant skills load — CAL-1 claim #1 |
| Instinct short-circuits | 97% per dispatch [DESIGN-MATH] | Kicks in as brain matures (70%+ hit rate) — claim #2/#5 |
| Symphony latent transport | 70–90% parallel dispatch [DESIGN-MATH] | Pure local code, zero tokens — claim #4 |
| Caveman compression | 65% per god output [DESIGN-MATH] | Terse natural language — claim #3 |
| Strategic-compact | Boundary-gated | Only compacts at logical task edges |
| `local` (your hardware) | 100% cost | $0 — your own LLM server, no network |
| Terminal Bridge | 100% (not applicable) | Local IPC, zero LLM tokens |

> **Read this before quoting a percentage.** Every number in this file is currently `[DESIGN-MATH]` except where tagged otherwise. The v0.0.26 CAL-1 campaign (`research/CAL-1.md`) measures them on a real medium build and replaces or refutes each tag. The cost example above is a projection, not a measurement.

## Hop runtime economics

An architectural task is not one giant prompt: Apollo writes a DAG of small
hops (≤16k output tokens each), the walker dispatches each hop on its god's
lane, and deterministic verification (file-exists / build / lint) costs **0
LLM tokens**. The request shape is deliberately small and bursty, so it fits
**BETWEEN provider peaks** instead of holding one long expensive stream open.

When a lane is exhausted (quota / 429 / no-route), the hop **PARKS on exhaustion** with its artifacts + resume point on disk — the campaign never
dies with a pool burst, and the next resume re-runs only the unfinished hop.
A warm transport (one `opencode serve` per project lane, v0.0.24) removes the
per-hop cold start while keeping the same small-hop economics.
