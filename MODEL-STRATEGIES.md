# OLYMPUS Model Strategies

> How OLYMPUS picks which LLM each god uses — and how to run OLYMPUS for free.

> **Source of truth:** Model IDs are canonical in `src/lib/model-strategies.ts`.
> Other files (`apply-strategy.js`, `olympus-hooks.ts`, `olympus.ts`,
> `route.ts`, `settings-dialog.tsx`) mirror that data. `npm run check-strategy-sync`
> enforces parity and runs in CI. Docs below are updated manually when the
> canonical file changes.

**Version:** v0.0.9
**License:** AGPL-3.0-or-later

## TL;DR

| Strategy | Plan required | Cost | Quality | Daily req budget | When to use |
|---|---|---|---|---|---|
| `go-max-quality` | GO plan | $ | Best | ~20-30 (GLM-5.3 tight) | Production — Apollo on GLM-5.3, Atlas on Hy3, Hephaestus/Hermes on Kimi K2.7 Code, Athena/Dionysus/Persephone on GLM-5.3, Artemis on Kimi K3, Prometheus on MiniMax M3, Callimachus on GLM-5.3-Flash |
| `go-balanced` (default) | GO plan | $ | Great | ~500-1,000 | **Day-to-day 5h/day (cap-aware)** — Apollo on FULL GLM-5.3 (the 2026-10-16 upgrade — the planner is the quality bottleneck; when the rolling cap blows, go-budget keeps Apollo on Flash), Atlas on Hy3, Hephaestus/Hermes on Kimi K2.7 Code, Athena/Persephone on Qwen3.7 Plus, Prometheus on MiniMax M3, Dionysus/Artemis/Callimachus on GLM-5.3-Flash |
| `go-budget` | GO plan | ¢ | Good | ~1,000+ | Maximum savings (cap-aware 8h/day) — Apollo on GLM-5.3-Flash, Atlas on Hy3 (orchestration), all others on GLM-5.3-Flash |
| `zen-max-quality` (**Zen**) | **Zen plan** | $$ | Best | **No caps** (pay-as-you-go) | Best quality on Zen — Apollo on GLM-5.3, Atlas on GPT 6 Sol, Hephaestus/Artemis/Hermes on Claude Sonnet 5, Athena on GPT 5.6 Terra, Dionysus on GPT 5.6 Luna, Persephone on Gemini 3.1 Pro, Prometheus on Grok Build 0.1, Callimachus on Claude Haiku 4.5, vault on GLM-5.3 |
| `zen-balanced` (**Zen**) | **Zen plan** | $ | Great | **No caps** (pay-as-you-go) | Full 128-agent OLYMPUS without a GO plan — Apollo on GLM-5.3, Atlas on GPT 6 Sol, Hephaestus/Artemis on Claude Sonnet 5, Athena on GPT 5.6 Terra, Dionysus on GPT 5.6 Luna, Hermes on GPT 5.4 Mini, Persephone on Gemini 3.1 Pro, Prometheus on Grok Build 0.1, Callimachus on Claude Haiku 4.5, vault on GLM-5.3-Flash. Proprietary APIs, charged per request |
| `zen-budget` (**Zen**) | **Zen plan** | ¢ | Good | **No caps** (pay-as-you-go) | Lowest cost on Zen — Apollo on GLM-5.3, Atlas on GPT 6 Luna, all others on GLM-5.3-Flash, Callimachus on Claude Haiku 4.5 |
| `byok-deepseek` (BYOK) | Your OpenRouter key — DeepSeek V4.1 Flash (1M ctx / 393k out) | same lane | same lane | same lane |
| `local` (**Local**) | Your hardware — Ollama / LM Studio / vLLM / llama.cpp / any OpenAI-compatible endpoint | same lane | same lane | same lane |

Switch strategies at any time:
```bash
olympus apply-strategy local
# or: Settings → LLM strategy in the app
```

> **Activation gate:** strategies are **blocked** until the API they need is authorized inside OpenCode — you can't switch to a plan you can't call. `go-*` needs the **GO plan** (`opencode-go` provider), `zen-*` needs the **ZEN key** (`opencode` provider), `local` needs a running local LLM server (the apply probes it and refuses with the exact reason otherwise). The Settings cards show a lock + what's missing; the providers API rejects blocked switches. Custom (`custom-*`) strategies have no static requirement.

The **Local** strategy (`local`) is the zero-cost path in v0.0.22: it probes the machine for a local LLM server and wires the full arsenal to it, refusing with the exact probe result when nothing answers. Requirements: tool calling + ≥32KB context. See [docs/LOCAL-LLM.md](docs/LOCAL-LLM.md).

The free tier (and its three aliases) is **retired** in v0.0.22 — the endpoint refuses `free-*` with the working alternatives.



## GO Plan Limits & Sustainable Usage

The OpenCode Go plan costs **$10/month** (Go) or **$40/month** (Go Plus — every per-model limit below roughly 3-4x higher). There is no single global cap: **usage limits are monthly DOLLAR amounts PER MODEL**, and each model's own limit rolls as **5-hour = 20%, weekly = 50%, monthly = 100%** of that model's monthly cap. A cheap model's cap goes a very long way; a premium model's cap is precious (cross-checked against https://opencode.ai/v2/docs/console/go/, page current 2026-10-17).

The table below shows estimated monthly request counts per model on the **Go plan ($10/mo)** (the provider's own estimates — typical coding-agent request shapes, cache-heavy):

| Model | Requests/month | Best for | Cost per request |
|---|---|---|---|
| DeepSeek V4.1 Flash | **173,330** ($80 cap) | Mechanical bulk — testing, DB migrations, vault | Lowest (off-peak) |
| MiMo V2.5 / V2.6-Flash | **150,400** ($60 cap) | Ultra-cheap bulk tasks | Lowest |
| LongCat-2.0 | **57,200** ($60 cap) | Bulk long-context | Very low |
| GLM-5.3-Flash | **31,580** ($60 cap) | Workhorse — specialists, vault, background | Very low |
| Qwen3.8 Flash | **27,000** ($30 cap) | Fast reasoning lanes | Very low |
| Hy3 | **21,500** ($60 cap) | Atlas (sacred — orchestration) | Very low |
| Qwen3.7 Plus | **21,600** ($60 cap) | Reasoning, security, frontend, integration | Low-Medium |
| GPT 6 Luna | **21,130** ($15 cap) | Cheap near-frontier reasoning | Very low |
| Claude Haiku 5.5 | **19,230** ($15 cap) | Sharp lightweight reasoning | Very low |
| MiniMax M3 | **16,000** ($60 cap) | DevOps + search-heavy roles | Very low |
| Kimi K2.7 Code | **6,750** ($60 cap) | Specialist coding tasks | Medium |
| DeepSeek V4 Pro | **5,200** ($15 cap) | Code generation, backend logic | Low |
| Step 5 Preview | **8,520** ($60 cap, 4x promo) | Code + reasoning while the boost lasts | Low |
| GLM-5.3 | **1,080** ($15 cap) | Apollo (sacred) + Athena/Dionysus/Persephone in go-max-quality | Medium |
| Kimi K3 | **490** ($15 cap) | Artemis in go-max-quality (security reasoning) | High |
| Grok 4.7 | **845** ($15 cap) | Specialized reasoning | High |
| Space Bunny | **Unlimited** (limited-time, zero cap consumption) | Bulk work while offered | Free |
| LongCat 2.5 Preview Free | **Unlimited** (limited-time, zero cap consumption) | Bulk work while offered | Free |
| Beam Free | **Unlimited** (limited-time, zero cap consumption; region-limited) | Bulk work while offered | Free |

> **Expiry caveat:** the three Free rows are promotional, limited-time
> offerings — they consume none of the plan's per-model dollar caps while
> active but may disappear without notice; do not build a sustainable-load
> plan on them. Step 5 Preview's 4x cap is also a limited-time boost.

> **Privacy matrix (2026-10-17 docs — your code rides these prompts):**
> zero-day retention (nothing stored) — GLM, Kimi, DeepSeek, Qwen, MiMo,
> Hy3/Hy4, MiniMax M3, Space Bunny, Step 5, LongCat; 30-day retention —
> Grok 4.7, GPT 6/5.6 Luna, Claude Haiku 5.5, Beam Free; **trains on your
> prompts** — Gemini 4 Argon Contributor + the Muse Spark Contributor tiers
> (heavily discounted in exchange; avoid for private code).

> **DeepSeek peak windows:** DeepSeek models bill their caps against
> peak/off-peak pricing — peak is Mon–Fri 01:00–04:00 and 06:00–10:00 UTC.
> Mechanical DeepSeek work (vault, migrations, bulk testing) is cheapest
> outside those windows; the 5h/weekly/monthly percentages consume fastest
> inside them.

### Sustainable 8h/day Coding

**`go-balanced`** is designed for 8 hours/day of active coding without hitting limits. At ~500-1,000 requests per day across all gods:

| God | Model | Requests/day | Monthly | % of cap |
|---|---|---|---|---|
| Apollo (balanced) | GLM-5.3 (FULL — the 2026-10-16 upgrade) | ~20 (planning, small bursts) | 400-600 | 40-55% of 1,080 (cap-aware) |
| Atlas | Hy3 | ~20 (orchestration) | ~400 | ~2% of 21,500 |
| 2 reasoning gods | Qwen3.7 Plus | ~40 each | 800 each | 4% |
| 2 code gods | Kimi K2.7 Code | ~40 each | 800 each | 12% |
| 1 orchestration god | MiniMax M3 | ~40 | 800 | 5% |
| 1 security god | GLM-5.3-Flash | ~30 | 600 | <2% |
| 3 mechanical gods | GLM-5.3-Flash | ~30 each | 600 each | <2% |

> Note: cap-aware mapping (the 2026-10-16 doctrine). Apollo rides FULL
> GLM-5.3 even in go-balanced — the planner is the quality bottleneck, and
> the hop runtime's small-burst request shape (~20 planning calls/day,
> reasoning_effort=low on the wire) keeps the burn far under the 1,080
> req/mo cap that killed the old interactive-turn economics (the 20.6-min
> at-cap specimen went 20.6min/output=0 → 2min33s with the full 9-hop plan
> after PLANNER-1). The old math — "at 5h/day Apollo would burn ~$46.86/mo
> on full GLM-5.3" — assumed giant interactive turns; small hops + prompt
> caching (cached reads at $0.26/M vs $1.40/M fresh input) changed the
> shape. When the rolling cap still blows, go-budget keeps Apollo on
> GLM-5.3-Flash ($60/mo cap, 31,580 req/mo) — the fallback is a strategy
> switch, never a silent downgrade.

**Total monthly spend:** ~$15-20 of metered usage inside the per-model caps. Headroom for spikes.

### Dispatch Optimization

OLYMPUS minimizes unnecessary API calls through:

1. **Symphony parallel dispatch** — independent sub-tasks are dispatched in parallel, not serially. A single planning call from Apollo fans out to multiple specialists simultaneously.

2. **Instinct gate short-circuit** — high-confidence instincts (confidence >= 0.85) skip LLM deliberation entirely. The god dispatches directly per the instinct. This saves **~97% of tokens** for repeated patterns.

3. **VibrationalSignature deduplication** — if two dispatch signatures match within a configurable similarity threshold, only one LLM call is made. The result is shared.

4. **Cascading compression** — 5 layers of context compression reduce token costs by **~90%+** on parallel dispatches.

### When you hit the cap

Despite optimization, you may hit a model's monthly cap during heavy usage:

- **GLM-5.3 (Apollo):** Never downgraded. Apollo is sacred — if the rolling/monthly cap is hit, Apollo stops planning until the reset. This prevents silent quality degradation.
- **Kimi K3 (Artemis, go-max-quality):** Tightest cap at 490/month. Switch to `go-balanced` (GLM-5.3-Flash) or to a Zen strategy — Zen is pay-as-you-go with no request caps.
- **Any model:** Switch to **Local** in Settings to run the full arsenal on your own hardware at zero cost (no cap, no data leaving the machine). The local probe reports exactly what it found.

See [opencode.ai/docs/go](https://opencode.ai/docs/go) for the latest plan details.


## The 10 gods

OLYMPUS now has **10 gods** (9 original + Atlas):

| God | Role | Model (balanced) |
|-----|------|------------------|
| Apollo | Planning & architecture | GLM-5.3 |
| **Atlas** | Orchestration & dispatch execution | Hy3 |
| Hephaestus | Backend code | Kimi K2.7 Code |
| Athena | Frontend | Qwen3.7 Plus |
| Hermes | Integrations | Kimi K2.7 Code |
| Artemis | Security | GLM-5.3-Flash |
| Dionysus | QA | GLM-5.3-Flash |
| Persephone | Database | Qwen3.7 Plus |
| Prometheus | DevOps | MiniMax M3 |
| Callimachus | Vault curation | GLM-5.3-Flash |

## The ten built-in strategies

### `go-max-quality` — best models, highest cost

The 2026-10-16 upgrade: Apollo gets GLM-5.3 (sacred). Atlas keeps Hy3 (sacred, $12/5h rolling). Artemis gets Kimi K3 (490 req/month — security reasoning). Athena, Dionysus and Persephone get GLM-5.3 (the $3/5h rolling cap is now shared by FOUR gods — this tier deliberately burns caps for quality). Hephaestus + Hermes get Kimi K2.7 Code (6,750 req/month). Prometheus gets MiniMax M3. Callimachus gets GLM-5.3-Flash.

**When to use:** Production work where quality matters more than cost. Watch the GLM-5.3 cap (1,080 req/month, shared Apollo+Artemis) — when it's exhausted, switch to `go-balanced` (or a Zen strategy — no request caps).

### `go-balanced` (default) — great models, moderate cost

Apollo rides FULL GLM-5.3 (the 2026-10-16 upgrade — the planner is the quality bottleneck, and the hop runtime's small-burst request shape stretches the $3/5h rolling cap far past the old interactive-turn economics; when the cap blows, go-budget keeps Apollo on Flash). Specialists get Kimi K2.7 Code (backend/integrations), Qwen3.7 Plus (frontend/data), MiniMax M3 (DevOps), and GLM-5.3-Flash (QA/security/vault).

**When to use:** Day-to-day work. This is the right default for 90% of users.

### `go-budget` — lowest cost on the GO plan

**Apollo runs on GLM-5.3-Flash** (cap-aware daily default — the GLM family stays sacred; GLM-5.3 itself is reserved for go-max-quality). Atlas uses **Hy3** — a model specialized for agent orchestration and search tasks. All other gods are on **GLM-5.3-Flash** — $12/5h rolling, ~31,580 requests/month per god. Sustainable at 8h/day (~$8.45/mo for Apollo).

**When to use:** High-volume work where you want maximum throughput and minimum GO plan consumption.

### `zen-max-quality` — frontier proprietary quality on OpenCode Zen (pay-as-you-go)

The frontier tier on OpenCode Zen, built around **proprietary APIs** — the whole point of Zen vs the GO plan (which runs the open-weight line). Apollo on GLM-5.3 (sacred), Atlas on GPT 6 Sol (Hy3 is GO-only), Hephaestus + Artemis + Hermes on Claude Sonnet 5 (best-in-class coding), Athena on GPT 5.6 Terra (frontend), Dionysus on GPT 5.6 Luna (QA), Persephone on Gemini 3.1 Pro (data/schemas), Prometheus on Grok Build 0.1, and Callimachus on Claude Haiku 4.5 (vault on GLM-5.3). Model ids use the `opencode/<id>` prefix. No request caps — charged per request.

**When to use:** You want frontier proprietary quality (Claude + GPT) without a GO plan, and don't mind pay-as-you-go pricing. NOTE: OpenAI/Anthropic requests are retained 30 days per their data policies.

### `zen-balanced` — full OLYMPUS on OpenCode Zen (pay-as-you-go)

OpenCode Zen is OpenCode's curated AI gateway: a tested list of models, **no request caps** — you pay per request. Zen's differentiator is **proprietary APIs**: the ZEN strategies route gods to closed frontier models (Claude, GPT, Gemini, Kimi, MiniMax) that the GO plan's open-weight lineup can't match. This makes it a great middle path between the GO plan and the free tier: the **full 128-agent OLYMPUS** (10 gods + 118 demigods, `{file:...}` prompt references, all 8 plugins) without a GO subscription.

Model IDs use the **`opencode/<model-id>`** prefix — distinct from the GO plan's `opencode-go/<id>`. The per-god map:

| God | Zen model | Notes |
|---|---|---|
| Apollo | `opencode/glm-5.3` | Sacred — never downgraded ($1.40 / $4.40 per 1M tokens) |
| Atlas | `opencode/gpt-6-sol` | Orchestration — fast tool-calling ($2.00 / $10.00 per 1M) |
| Hephaestus / Artemis | `opencode/claude-sonnet-5` | Best-in-class proprietary coding ($2.00 / $10.00 per 1M) |
| Athena | `opencode/gpt-5.6-terra` | Frontend ($2.00 / $12.00 per 1M) |
| Dionysus | `opencode/gpt-5.6-luna` | QA — near-free ($0.20 / $1.20 per 1M) |
| Hermes | `opencode/gpt-5.4-mini` | Integrations ($0.75 / $4.50 per 1M) |
| Persephone | `opencode/gemini-3.1-pro` | Data / schemas ($2.00 / $12.00 per 1M) |
| Prometheus | `opencode/grok-build-0.1` | Build ($1.00 / $2.00 per 1M) |
| Callimachus | `opencode/claude-haiku-4-5` | Background vault work ($1.00 / $5.00 per 1M) |

`small_model` uses `opencode/deepseek-v4-flash`; `vaultLlm` uses `opencode/glm-5.3-flash`. Demigods inherit their parent god's model with the same overrides as the GO strategies (using `opencode/` ids).

**Authorization:** run `olympus opencode`, then `/connect` → select **OpenCode Zen** → paste your API key (from [opencode.ai/zen](https://opencode.ai/zen)). The key is stored in OpenCode's own auth.json under the `opencode` provider (env override: `OPENCODE_API_KEY`) — OLYMPUS detects it automatically and recommends `zen-balanced`.

**Auto-reload:** when your balance drops below $5, Zen auto-reloads $20 (configurable / can be disabled). Optional monthly limits exist for cost control.

**When to use:**
- You don't have a GO plan but want the full 128-agent experience.
- You want the best-tested models for coding without a flat monthly plan.
- The free tier's rate limits are too tight for your workflow.

<!-- TODO(post-v0.0.2): refresh Zen pricing + cap table — verified 2026-09-28 -->
**Pricing:** per-1M-token rates (input/output, verified 2026-07-31): GLM 5.2 $1.40/$4.40 · Gemini 3.5 Flash $1.50/$9.00 · Claude Sonnet 5 $2.00/$10.00 · Kimi K2.7 Code $0.95/$4.00 · GPT-5.4 $2.50/$15.00 · MiniMax M2.7 $0.30/$1.20 · MiniMax M3 $0.30/$1.20 · Qwen3.7 Max $2.50/$7.50 · Grok 4.5 $2/$6 · DeepSeek V4 Flash $0.14/$0.28. See [https://opencode.ai/docs/zen/](https://opencode.ai/docs/zen/) for the current list.

**Privacy:** Zen's providers follow a zero-retention policy with two exceptions that matter for the proprietary lineup — **OpenAI and Anthropic retain requests for 30 days** per their data policies (GPT-5.4, Claude Sonnet 5), and the free-on-Zen trial models (Big Pickle, DeepSeek V4 Flash Free, etc.) may use data during their trial period. Gemini, Kimi, MiniMax, Qwen-Max and the open-weight models are zero-retention.

### `zen-budget` — lowest cost on OpenCode Zen (pay-as-you-go)

The lowest-cost tier on OpenCode Zen, still on proprietary APIs: Apollo on GLM-5.3 (sacred), Atlas on GPT 6 Luna (orchestration), every other god on GLM-5.3-Flash ($0.15/$0.50 per 1M — the cheapest workhorse class on Zen), and Callimachus on Claude Haiku 4.5. Model ids use the `opencode/<id>` prefix.

**When to use:** Maximum throughput on Zen at minimum cost — without leaving the proprietary-API world.

### `local` — your own hardware (the zero-cost path in v0.0.22)

The free tier is **retired**. The zero-cost path is now a local LLM server on your own machine.

| Runtime | Default endpoint |
|---|---|
| Ollama | `http://localhost:11434` |
| LM Studio | `http://localhost:1234` |
| vLLM | `http://localhost:8000` |
| llama.cpp server | `http://localhost:8080` |
| Any OpenAI-compatible | user-entered `baseURL` |

**How it works:** `olympus apply-strategy local` runs `scripts/local-llm-probe.js` (5 endpoints,
3s each), picks the best answering endpoint, reads its first model, writes the `local` provider
block into `opencode.json` and pins every god to `local/<model>` — the full 10-god + 122-demigod
arsenal, full prompts, all plugins. **With no endpoint answering, the apply refuses** with the
probe table and the fix — never a config that cannot serve a request.

**Requirements:** tool calling + ≥32k context. See [docs/LOCAL-LLM.md](docs/LOCAL-LLM.md) for the
honest hardware table (S/A/B/C tiers). Cost: $0. Data: never leaves the machine.

**Probe only:** `node scripts/local-llm-probe.js` (JSON report, exit 0 when an endpoint answers).

### `byok-deepseek` — your own OpenRouter key, every god on one strong lane

Added 2026-10-24 after the **GO monthly quota was spent** and every `go-*` strategy died with
`GoUsageLimitError` (retry in ~4.5 days). If you already pay for a provider outside the GO/Zen
plans, this strategy points all ten gods at that lane.

| | |
|---|---|
| Lane | `openrouter/deepseek/deepseek-v4.1-flash-1017` |
| Window | **1,048,576** context / **393,216** output |
| Price | **$0.15** in / **$0.60** out per 1M (cache read $0.003) |
| Volume lane | `openrouter/cohere/north-mini-code:free` (titles + compaction — never bills your key) |
| Demigods | inherit their parent god's model (one lane, one bill) |

Why a dedicated family instead of `custom-*`: custom strategies are **free-only by a
money-safety guard**, and pointing OLYMPUS at a key you already pay for is a deliberate
choice, not an accident. `byok-*` is that deliberate lane; the guard still blocks silent
downgrades everywhere else.

**One lane means one point of failure — which is why the runtime failover exists.** If this
lane rate-limits or the credit runs out, `src/lib/lane-health.ts` records the provider's class
and `retryAfterMs`, and the hop re-posts on the next healthy lane of that god's
`FREE_HYBRID_ROSTER` chain instead of parking. Check the bill: `/api/olympus/run-state` and the
StatusBar pill show dead lanes.

```bash
node scripts/apply-strategy.js --strategy byok-deepseek
```

## Custom strategies

Advanced users can define their own strategy in `~/.olympus/custom-strategies.json`:

```json
{
  "custom-mine": {
    "gods": {
      "apollo":      "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
      "atlas":       "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
      "artemis":     "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
      "athena":      "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
      "dionysus":    "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
      "hephaestus":  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
      "hermes":      "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
      "persephone":  "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
      "prometheus":  "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
      "callimachus": "openrouter/nvidia/nemotron-3-nano-30b-a3b:free"
    }
  }
}
```

Apply it:
```bash
olympus apply-strategy custom-mine
```

The strategy ID must start with `custom-`. The `gods` map must include all 10 god IDs.

> **MONEY SAFETY — custom strategies are FREE-ONLY.** They may use any model from the free catalog (OpenRouter `:free` variants, Groq, NVIDIA Build) — never a paid GO/ZEN model: a paid model in a custom strategy could silently burn credits. The Settings per-god dropdown shows **Free models (all providers)** when a custom strategy is selected, and apply-strategy.js rejects any paid model at apply time. Paid models stay where they belong: **GO** (the open-weight plan) and **ZEN** (the proprietary-API plan).

## Demigod model inheritance

Demigods don't have their own model assignment — they inherit from their parent god with these overrides (GO strategies only):

| Demigod type | Example demigods | Model |
|---|---|---|
| Simple (mechanical) | `evidence-collector`, `researcher`, `secrets-scanner`, `brain-backup`, `docs-verifier` | Always DeepSeek V4 Flash |
| Apollo's planning | `planner`, `architect`, `spec-author`, `risk-assessor` | Always DeepSeek V4 Pro |
| Athena's UI (impeccable upgrade) | `frontend-reviewer`, `ui-designer`, `visual-verifier` | Kimi K3 when Athena is on K3 |
| All others | (most demigods) | Inherit parent god's model |

For free-tier strategies, **all overrides are disabled** — every demigod inherits its parent god's model. The hardcoded overrides assume GO/Zen-plan models which don't exist on the free tier. On the Zen strategy the same overrides apply as GO (Flash for mechanical demigods, Pro for Apollo's planners, K3 for Athena's UI demigods when applicable) but with `opencode/` prefixed ids.

Per-god overrides set in the Settings dialog **do route** for free strategies: apply-strategy.js reads `per_god_overrides` from `~/.olympus/llm-providers.json` and merges them into the model map. Overrides naming a model outside the verified free list (or the GO list) are dropped in favor of the strategy default, so stale entries (e.g. the removed `deepseek-chat-v3-0324:free`) can never point a god at a dead endpoint.

## When you hit the cap: switch strategies

There are **no automatic model fallbacks** — OLYMPUS never silently downgrades a god's model. When a model's monthly cap is exhausted, you switch strategies:

- **Kimi K3 (Artemis in go-max-quality only):** its GO cap ($15/mo → $3/5h rolling, 490/month) is too tight for multi-god duty — that is why only ONE god rides it. Grok 4.7 stays unused. Switch to `go-balanced` for more headroom, or a **Zen** strategy (`zen-max-quality` keeps frontier quality with Claude Sonnet 5 / GPT 6 Sol; `zen-balanced`/`zen-budget` use GPT 5.6 Terra/Luna / GLM-5.3-Flash — pay-as-you-go, **no request caps**).
- **GLM-5.3 capped (1,080 req/month; four gods in go-max-quality, Apollo in go-balanced):** the hop runtime's small-burst shape stretches the cap, but when it runs out switch to `go-budget` (Apollo on Flash), a Zen strategy (Apollo stays on `opencode/glm-5.3`, pay-as-you-go) or a free strategy.
- **Any GO model capped:** switch to **Zen** (pay-as-you-go), **BYOK** (your own key), or **Local** (your own hardware) in Settings.

## Why no OpenAI/Anthropic direct providers?

OLYMPUS does not wire OpenAI or Anthropic as direct providers — and it doesn't need to. **OpenCode Zen is the gateway to those proprietary APIs**: the ZEN strategies route gods to `opencode/gpt-6-sol` and `opencode/claude-sonnet-5` (plus Gemini, Grok, Kimi, MiniMax, Qwen-Max) pay-as-you-go with no request caps, through OpenCode's curated, benchmarked serving. The GO plan covers the open-weight line (GLM, DeepSeek, Qwen, Hy3); the free tier covers zero-cost providers (OpenRouter free, NVIDIA Build). BYO-key OpenAI/Anthropic (via those vendors' own CLIs or direct API keys) is out of scope — OLYMPUS runs on OpenCode providers only.

The free-tier providers (OpenRouter free, NVIDIA Build free) are different — they let users without any paid plan try OLYMPUS end-to-end. That's the "Always free" promise from the README.

## Configuration files

| File | Purpose |
|---|---|
| `~/.olympus/llm-providers.json` | Active strategy ID |
| `~/.olympus/.env` | Encrypted API keys (OpenRouter, NVIDIA Build), managed via UI |
| `~/.olympus/custom-strategies.json` | User-defined `custom-*` strategies |
| `~/.local/share/opencode/auth.json` | OpenCode's own auth — GO (`opencode-go`), Zen (`opencode`), Groq, OpenRouter keys |
| `opencode.json` (in the project root) | Per-god model assignments — rewritten by `apply-strategy.js` |
| `src/lib/model-strategies.ts` | Canonical strategy definitions (TypeScript source) |
| `scripts/apply-strategy.js` | CLI that rewrites `opencode.json`'s agent models |

## Switching strategies

Three ways:

1. **CLI:** `olympus apply-strategy <id>` (writes `~/.olympus/llm-providers.json` + rewrites `opencode.json`)
2. **Settings UI:** Settings → LLM strategy → pick a card → Save
3. **API:** `POST /api/olympus/strategy { "strategy": "<id>" }` (server-side equivalent of the CLI)

The switch is idempotent — running twice with the same strategy is a no-op.

## Verifying the active strategy

```bash
olympus doctor | grep -A2 "Strategy"
```

Or check the file directly:
```bash
cat ~/.olympus/llm-providers.json
```

The `strategy` field is the active strategy ID. The per-god model assignments are materialized in `opencode.json`'s `agent.<god>.model` fields.

## Cost remodel (COST-1, proposed for v0.0.10)

The v0.0.9 release ships **`docs/research/cost-strategy-remodel.md`** — the free-first multi-provider cost architecture (Zen free / NVIDIA NIM / OpenRouter `:free` / DeepSeek V4.1 Flash paid as last resort), with the workload matrix, the SE/ENTÃO failover tree, the financial scenarios, the risks, and the implementation plan. Key constraints recorded there:

- **Probe-first:** the briefing's NVIDIA `deepseek-v4.1-flash` lane is **dead** in the 2026-10-23 probes (20s timeouts); the verified anchors are GLM-5.3, MiniMax M3.1 Flash, Muse Glimmer 30B and GPT-OSS-20B.
- **Apollo stays GLM** (the sacred law) — a `cost-first` mode that moves Apollo to DeepSeek requires an explicit accept.
- **Free tier is capacity, not contract:** a hard paid cap (default US$ 5/month) plus a provider budget ledger are prerequisites for any automatic fallback.

Tracked by the COST-1 issues: the budget ledger, the workload router, the local-lane telemetry, and the A/B benchmark. Until those land, the manual strategy switch remains the only routing surface.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE) in the OLYMPUS root.
