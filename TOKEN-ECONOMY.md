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
| **go-max-quality** | GLM-5.3 | Hy3 | Kimi K3 / K2.7 Code | DeepSeek V4 Flash | Higher |
| **go-balanced** (default) | GLM-5.3 | Hy3 | DeepSeek V4 Pro / Qwen3.7 Plus | DeepSeek V4 Flash | Moderate |
| **go-budget** | GLM-5.3 (sacred) | Hy3 | DeepSeek V4 Flash | DeepSeek V4 Flash | Low |
| **zen-max-quality** (**ZEN**) | GLM-5.3 | Gemini 3.5 Flash | Claude Sonnet 5 / GPT-5.4 | Gemini 3.5 Flash | Higher (pay-as-you-go) |
| **zen-balanced** (**ZEN**) | GLM-5.3 | Gemini 3.5 Flash | Claude Sonnet 5 / Kimi K2.7 Code | MiniMax M2.7 | Moderate (pay-as-you-go) |
| **zen-budget** (**ZEN**) | GLM-5.3 | Gemini 3.5 Flash | MiniMax M2.7 | MiniMax M2.7 | Low (pay-as-you-go) |
| **local** (**Local**) | the probed local model | the probed local model | the probed local model | the probed local model | **$0** |

Apollo is always on GLM-5.3 in the GO + ZEN strategies. Atlas is on Hy3 in all GO strategies and on Gemini 3.5 Flash in the ZEN strategies (Hy3 is GO-plan-only). In the budget strategies, all gods except Apollo and Atlas drop to DeepSeek V4 Flash (GO) / MiniMax M2.7 (ZEN) for maximum savings.

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
| **Savings** | — | **89% input / 42% output** |

The same project on the **`local` strategy**: **$0 total cost**, same short-circuit rate. A custom strategy using free endpoints is also $0 but is rate-limited and slow. The savings come from: hot/warm/cold tier filtering (81%), instinct short-circuits (97% on 70% of demigod dispatches), and MCP allowlist enforcement (only the god's allowed MCPs load).

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
| `local` (your hardware) | 100% cost | $0 — your own LLM server, no network |
| Terminal Bridge | 100% (not applicable) | Local IPC, zero LLM tokens |

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
