# OLYMPUS Model Strategies

> How OLYMPUS picks which LLM each god uses — and how to run OLYMPUS for free.

> **Source of truth:** Model IDs are canonical in `src/lib/model-strategies.ts`.
> Other files (`apply-strategy.js`, `olympus-hooks.ts`, `olympus.ts`,
> `route.ts`, `settings-dialog.tsx`) mirror that data. `npm run check-strategy-sync`
> enforces parity and runs in CI. Docs below are updated manually when the
> canonical file changes.

**Version:** v0.0.2
**License:** AGPL-3.0-or-later

## TL;DR

| Strategy | Plan required | Cost | Quality | Daily req budget | When to use |
|---|---|---|---|---|---|
| `go-max-quality` | GO plan | $ | Best | ~20-30 (GLM-5.3 tight) | Production — Apollo on GLM-5.3, Atlas on Hy3, Hephaestus/Hermes on Kimi K2.7 Code, Athena/Dionysus/Persephone/Callimachus on GLM-5.3-Flash, Artemis on GLM-5.3, Prometheus on MiniMax M3 |
| `go-balanced` (default) | GO plan | $ | Great | ~500-1,000 | **Day-to-day 5h/day (cap-aware)** — Apollo on GLM-5.3-Flash, Atlas on Hy3, Hephaestus/Hermes on Kimi K2.7 Code, Athena/Persephone on Qwen3.7 Plus, Prometheus on MiniMax M3, Dionysus/Artemis/Callimachus on GLM-5.3-Flash |
| `go-budget` | GO plan | ¢ | Good | ~1,000+ | Maximum savings (cap-aware 8h/day) — Apollo on GLM-5.3-Flash, Atlas on Hy3 (orchestration), all others on GLM-5.3-Flash |
| `zen-max-quality` (**Zen**) | **Zen plan** | $$ | Best | **No caps** (pay-as-you-go) | Best quality on Zen — Apollo on GLM-5.3, Atlas on GPT 6 Sol, Hephaestus/Artemis/Hermes on Claude Sonnet 5, Athena on GPT 5.6 Terra, Dionysus on GPT 5.6 Luna, Persephone on Gemini 3.1 Pro, Prometheus on Grok Build 0.1, Callimachus on Claude Haiku 4.5, vault on GLM-5.3 |
| `zen-balanced` (**Zen**) | **Zen plan** | $ | Great | **No caps** (pay-as-you-go) | Full 128-agent OLYMPUS without a GO plan — Apollo on GLM-5.3, Atlas on GPT 6 Sol, Hephaestus/Artemis on Claude Sonnet 5, Athena on GPT 5.6 Terra, Dionysus on GPT 5.6 Luna, Hermes on GPT 5.4 Mini, Persephone on Gemini 3.1 Pro, Prometheus on Grok Build 0.1, Callimachus on Claude Haiku 4.5, vault on GLM-5.3-Flash. Proprietary APIs, charged per request |
| `zen-budget` (**Zen**) | **Zen plan** | ¢ | Good | **No caps** (pay-as-you-go) | Lowest cost on Zen — Apollo on GLM-5.3, Atlas on GPT 6 Luna, all others on GLM-5.3-Flash, Callimachus on Claude Haiku 4.5 |
| `free-openrouter` (**Free OpenRouter**) | **None** | **Free** | Lower | Unlimited (rate-limited) | The OpenRouter-only split — primary trio on #1, specialists on #2, Callimachus on a fast background model. Refreshes automatically |
| `free-big-pickle` (**Free Big Pickle**) | **None** | **Free** | Lower | Unlimited (rate-limited) | All 10 gods (Callimachus included) on one free model — the strongest currently live, refreshed automatically |
| `free-nvidia-build` (**Free Nvidia Build**) | **None** | **Free** | Lower | Unlimited (rate-limited) | NVIDIA Build free endpoints (build.nvidia.com) — Apollo + Atlas on the strongest NVIDIA free model live (Nemotron 3 Ultra 550B, 1M ctx), coding gods on pinned GLM-5.2, other specialists on #2, Callimachus on a fast background model. Refreshes automatically |
| `custom-*` | User-defined | User-defined | User-defined | Custom | Advanced — define your own per-god model map |

Switch strategies at any time:
```bash
olympus apply-strategy free-openrouter   # or free-big-pickle / free-nvidia-build
# or: Settings → LLM strategy in the app
```

> **Activation gate:** strategies are **blocked** until the API they need is authorized inside OpenCode — you can't switch to a plan you can't call. `go-*` needs the **GO plan** (`opencode-go` provider), `zen-*` needs the **ZEN key** (`opencode` provider), `free-openrouter` / `free-big-pickle` need an **OpenRouter key**, `free-nvidia-build` needs an **NVIDIA Build key** (`nvapi-...`). The Settings cards show a lock + what's missing; the providers API rejects blocked switches. Custom (`custom-*`) strategies have no static requirement.

When a free provider's rate limit runs out, pick another free strategy (`free-openrouter`, `free-big-pickle`, `free-nvidia-build`) and continue — no plan needed, models refresh automatically from the live provider lists.



## GO Plan Limits & Sustainable Usage

The OpenCode GO plan costs **$10/month** and includes:
- **5-hour limit:** $12 of usage
- **Weekly limit:** $30 of usage  
- **Monthly limit:** $60 of usage

These are dollar-value caps, not request counts. Different models consume the budget at different rates. **Per-model dollar limits: 5h = 20%, weekly = 50%, monthly = 100% of each model's own cap** — a model's 5h budget is one fifth of its monthly dollar cap, NOT of the global $12 (cross-checked against https://opencode.ai/docs/go/, page updated 2026-10-03; refreshed in BATCH 13 per #66).

The table below shows estimated monthly request counts per model within the $60 plan:

| Model | Requests/month | Best for | Cost per request |
|---|---|---|---|
| MiMo V2.5 | **150,400** | Ultra-cheap bulk tasks | Lowest |
| DeepSeek V4 Flash | **65,000** (was 158,150 — limit now $30) | Mechanical tasks (testing, DB migrations, vault) | Very low |
| GLM-5.3-Flash | **31,580** | Workhorse — specialists, vault, background | Very low |
| Qwen3.7 Plus | **21,600** | Reasoning, security, frontend, integration | Low-Medium |
| DeepSeek V4 Pro | **5,200** (was 17,150 — limit now $15) | Code generation, backend logic | Low |
| Kimi K2.7 Code | **6,750** | Specialist coding tasks | Medium |
| GLM-5.3 | **1,080** | Apollo + Artemis (sacred, reserved) | Medium |
| Kimi K3 | **490** | Highest-quality reasoning (Athena, Hephaestus) | High |
| Grok 4.7 / 4.6 | **845** each (replaces defunct Grok 4.5) | Specialized reasoning | High |
| LongCat-2.0 | **57,200** ($60 tier) | Bulk long-context | Very low |
| Space Bunny Free | **Unlimited** (limited-time, zero limit consumption) | Bulk work while offered | Free |
| LongCat 2.5 Preview Free | **Unlimited** (limited-time, zero limit consumption) | Bulk work while offered | Free |

> **Expiry caveat:** the two Free rows are promotional, limited-time
> offerings — they consume none of the plan's per-model dollar caps while
> active but may disappear without notice; do not build a sustainable-load
> plan on them. Also available per the 2026-10-03 docs: Qwen3.8 generation,
> DeepSeek V4.1 Flash, MiMo V2.6 generation, GPT 6 Luna / GPT 5.6 Luna,
> Hy4 preview, Kimi K2.6, MiniMax M2.7, and GLM-5.2 at the $60 tier
> (4,300 req/mo; GLM-5.2 request counts confirmed still correct).

> **DeepSeek peak windows:** DeepSeek models bill their caps against
> peak/off-peak pricing — peak is Mon–Fri 01:00–04:00 and 06:00–10:00 UTC.
> Mechanical DeepSeek work (vault, migrations, bulk testing) is cheapest
> outside those windows; the 5h/weekly/monthly percentages consume fastest
> inside them.

### Sustainable 8h/day Coding

**`go-balanced`** is designed for 8 hours/day of active coding without hitting limits. At ~500-1,000 requests per day across all gods:

| God | Model | Requests/day | Monthly | % of cap |
|---|---|---|---|---|
| Apollo (balanced) | GLM-5.3-Flash | ~20 (planning) | 400 | 1% |
| Atlas | Hy3 | ~20 (orchestration) | ~400 | Very low |
| 2 reasoning gods | Qwen3.7 Plus | ~40 each | 800 each | 4% |
| 2 code gods | Kimi K2.7 Code | ~40 each | 800 each | 12% |
| 1 orchestration god | MiniMax M3 | ~40 | 800 | 5% |
| 1 security god | GLM-5.3-Flash | ~30 | 600 | <2% |
| 3 mechanical gods | GLM-5.3-Flash | ~30 each | 600 each | <2% |

> Note: cap-aware mapping. The daily strategies keep Apollo + Artemis on
> GLM-5.3-Flash ($60/mo → $12/5h rolling, 31,580 req/mo). GLM-5.3
> ($15/mo → $3/5h rolling, 1,080 req/mo) is reserved for go-max-quality
> (occasional premium use). At 5h/day Apollo alone would burn ~$46.86/mo
> on GLM-5.3 vs ~$5.28/mo on Flash — Flash survives the month comfortably.

**Total monthly spend:** ~$15-20 (well within the $60 plan). Headroom for spikes.

### Dispatch Optimization

OLYMPUS minimizes unnecessary API calls through:

1. **Symphony parallel dispatch** — independent sub-tasks are dispatched in parallel, not serially. A single planning call from Apollo fans out to multiple specialists simultaneously.

2. **Instinct gate short-circuit** — high-confidence instincts (confidence >= 0.85) skip LLM deliberation entirely. The god dispatches directly per the instinct. This saves **~97% of tokens** for repeated patterns.

3. **VibrationalSignature deduplication** — if two dispatch signatures match within a configurable similarity threshold, only one LLM call is made. The result is shared.

4. **Cascading compression** — 5 layers of context compression reduce token costs by **~90%+** on parallel dispatches.

### When you hit the cap

Despite optimization, you may hit a model's monthly cap during heavy usage:

- **GLM-5.2 (Apollo):** Never downgraded. Apollo is sacred — if the 4,300 req/month cap is hit, Apollo stops planning until the monthly reset. This prevents silent quality degradation.
- **Kimi K3 (Athena, Hephaestus):** Tightest cap at 490/month. Switch to `go-balanced` (Qwen3.7 Plus / DeepSeek V4 Pro) or to a Zen strategy — Zen is pay-as-you-go with no request caps.
- **Any model:** Switch to a free strategy (`free-openrouter`, `free-big-pickle`, `free-nvidia-build`) in Settings to continue working with free-tier models (lower quality, zero cost, no cap). When one free provider's rate limit runs out, pick another free strategy and keep going.

See [opencode.ai/docs/go](https://opencode.ai/docs/go) for the latest plan details.


## The 10 gods

OLYMPUS now has **10 gods** (9 original + Atlas):

| God | Role | Model (balanced) |
|-----|------|------------------|
| Apollo | Planning & architecture | GLM-5.3-Flash |
| **Atlas** | Orchestration & dispatch execution | Hy3 |
| Hephaestus | Backend code | Kimi K2.7 Code |
| Athena | Frontend | Qwen3.7 Plus |
| Hermes | Integrations | Kimi K2.7 Code |
| Artemis | Security | GLM-5.3-Flash |
| Dionysus | QA | GLM-5.3-Flash |
| Persephone | Database | Qwen3.7 Plus |
| Prometheus | DevOps | MiniMax M3 |
| Callimachus | Vault curation | GLM-5.3-Flash |

## The nine built-in strategies

### `go-max-quality` — best models, highest cost

Apollo gets GLM-5.3 (sacred — shared only with Artemis). Atlas keeps Hy3 (sacred, $12/5h rolling). Hephaestus + Hermes get Kimi K2.7 Code (6,750 req/month). Athena, Dionysus, Persephone and Callimachus get GLM-5.3-Flash ($12/5h rolling, 31,580 req/month). Prometheus gets MiniMax M3. No god runs on the tight-cap flagships (Kimi K3 / Grok 4.7 / GLM-5.3 beyond Apollo+Artemis).

**When to use:** Production work where quality matters more than cost. Watch the GLM-5.3 cap (1,080 req/month, shared Apollo+Artemis) — when it's exhausted, switch to `go-balanced` (or a Zen strategy — no request caps).

### `go-balanced` (default) — great models, moderate cost

Apollo gets GLM-5.3-Flash (cap-aware — GLM-5.3's $3/5h rolling cap is reserved for go-max-quality). Specialists get Kimi K2.7 Code (backend/integrations), Qwen3.7 Plus (frontend/data), MiniMax M3 (DevOps), and GLM-5.3-Flash (QA/security/vault).

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

### `free-groq` — removed (Groq free tier cannot serve OLYMPUS)

Groq's free tier was removed from OLYMPUS. Its **12K TPM window** (prompt + max_tokens counted together) cannot serve the ~46K-token OLYMPUS system prompt (AGENTS.md + god prompts + instructions) — every request overflows, opencode auto-compacts, and the session falls into an endless compaction loop. The `free-groq` strategy, all `groq/*` model entries, and Groq's entry in the live-refresh list have been removed. Use `free-openrouter`, `free-big-pickle`, or `free-nvidia-build` instead.

### `free-openrouter` — the OpenRouter-only split

The provider-specific OpenRouter split: primary trio (Apollo, Atlas, Hephaestus) on the strongest OpenRouter free model currently live, specialists on the second-strongest, and Callimachus on a fast background model (`openrouter/nvidia/nemotron-3-nano-30b-a3b:free`). Live-refreshed from the OpenRouter provider list.

**Requirements:** an OpenRouter API key configured inside OpenCode (Settings → add OpenRouter). Get one free at https://openrouter.ai/keys.

**When to use:** You have an OpenRouter key and want the provider-specific split.

### `free-big-pickle` — every god (including Callimachus) on one free model

All **10 gods** — Apollo through Callimachus — run on a single model: the strongest free model currently live (as of 2026-07-31: `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` — 550B params, 1M context). "Free: Big Pickle" is the user's session model; it is **not** a public OpenRouter slug, so the strategy defaults to the strongest verified live free model and reads the `OLYMPUS_BIG_PICKLE_MODEL` env var so you can point it at the real provider once its slug is known. `small_model` and `vaultLlm` stay on `openrouter/nvidia/nemotron-3-nano-30b-a3b:free` — they are background workers (title generation, vault writes), not gods, and would burn the flagship's shared pool.

```bash
# Point at your real Big Pickle provider once you have the slug:
export OLYMPUS_BIG_PICKLE_MODEL=openrouter/<your-big-pickle-slug>
node scripts/apply-strategy.js --strategy free-big-pickle
```

### `free-nvidia-build` — NVIDIA Build free endpoints (build.nvidia.com)

NVIDIA hosts **GLM-5.2** and the Nemotron family (plus DeepSeek, Kimi, Mistral, etc.) on free endpoints at [build.nvidia.com](https://build.nvidia.com/models) — the same scheme as the other free strategies:

- **Primary roles** (Apollo, Atlas) → the strongest NVIDIA free model currently live (curated default: `nvidia/nvidia/nemotron-3-ultra-550b-a55b` — 550B params, 1M context).
- **Coding trio** (Hephaestus, Athena, Dionysus) → **pinned** `nvidia/z-ai/glm-5.2` — the best coding model on the platform (1M context), pinned so a list reshuffle never bumps the coding gods onto a general-purpose model.
- **Specialists** (Artemis, Hermes, Persephone, Prometheus) → the second-strongest live model (fallback: `nvidia/z-ai/glm-5.2`).
- **Callimachus** → a fast nano-class background model from the live list (curated default: `nvidia/nvidia/nemotron-3-nano-30b-a3b`).

Model ids use the **`nvidia/<vendor>/<model>`** prefix (OpenCode's built-in `nvidia` provider) — **no `:free` suffix**; every NVIDIA Build endpoint is free with a key. The model list is fetched live from `https://integrate.api.nvidia.com/v1/models` (public, no key needed) and refreshed automatically with the same 24-hour TTL as OpenRouter/Groq.

**Requirements:** a free NVIDIA API key (`nvapi-...`) configured inside OpenCode (`olympus opencode` → Settings → add NVIDIA). Get one at https://build.nvidia.com (Sign In → API). The config still applies without the key, but model requests fail until it is added — apply-strategy.js warns about this.

**When to use:** You want GLM-5.2 or the Nemotron family for free through NVIDIA's direct endpoints (no OpenRouter/Groq key needed).

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

- **Kimi K3 / Grok 4.7 not used in any strategy:** their GO caps ($15/mo → $3/5h rolling) are too tight for multi-god duty. GLM-5.3 is reserved for go-max-quality (Apollo + Artemis) only. Switch to `go-balanced` for more headroom, or a **Zen** strategy (`zen-max-quality` keeps frontier quality with Claude Sonnet 5 / GPT 6 Sol; `zen-balanced`/`zen-budget` use GPT 5.6 Terra/Luna / GLM-5.3-Flash — pay-as-you-go, **no request caps**).
- **GLM-5.3 (go-max-quality only) capped (1,080 req/month, shared Apollo + Artemis):** the daily strategies are unaffected — they run Apollo on GLM-5.3-Flash. If GLM-5.3 runs out on go-max-quality, switch to `go-balanced`, a Zen strategy (Apollo stays on `opencode/glm-5.3`, pay-as-you-go) or a free strategy.
- **Any GO model capped:** switch to a free strategy in Settings (`free-openrouter`, `free-big-pickle`, `free-nvidia-build`) and keep working at zero cost. When one free provider's rate limit runs out, pick another free strategy and continue.

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

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE) in the OLYMPUS root.
