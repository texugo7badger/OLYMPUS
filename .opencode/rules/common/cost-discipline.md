# Common Rules — Cost Discipline (GO Plan)

> Detailed cost rules. See `operating-principles.md` for the summary.
> Zen and free-tier strategies are covered in [MODEL-STRATEGIES.md](../../../MODEL-STRATEGIES.md) and [TOKEN-ECONOMY.md](../../../TOKEN-ECONOMY.md).

## GO Plan Limits

- **5-hour rolling**: $12 of usage
- **Weekly**: $30 of usage
- **Monthly**: $60 of usage
- When limits are hit, GO blocks requests. There are **no automatic fallbacks** — switch strategies instead: a Zen strategy (`zen-max-quality` / `zen-balanced` / `zen-budget` — pay-as-you-go, no request caps) or one of the three free strategies (`free-openrouter` / `free-big-pickle` / `free-nvidia-build`).

## Per-Model Request Budgets (GO plan)

| Model | req/5hr | req/week | req/month |
|-------|---------|----------|-----------|
| GLM-5.2 (Apollo only) | 880 | 2,150 | 4,300 |
| Kimi K2.7 Code | 1,350 | 4,630 | 9,250 |
| DeepSeek V4 Pro | 3,450 | 8,550 | 17,150 |
| Qwen3.7 Plus | 4,300 | 10,800 | 21,600 |
| DeepSeek V4 Flash | 31,650 | 79,050 | 158,150 |

## Strategy Allocation (go-balanced, the default)

- **Apollo**: GLM-5.2 — protected by 80/20 fast-path discipline. 80% of prompts cost ~few hundred output tokens (single DISPATCH line). 20% cost 5-15K tokens (spec-interview + plan).
- **Specialist gods (backend/QA/DB)**: DeepSeek V4 Pro — 17,150 req/month, enough for autonomous loops.
- **Specialist gods (security/frontend/integrations/devops)**: Qwen3.7 Plus — 21,600 req/month.
- **Callimachus**: DeepSeek V4 Flash — 158,150 req/month, effectively unlimited for background vault curation.
- **ECC heavy agents** (21 agents): DeepSeek V4 Pro.
- **ECC light agents** (5 agents): DeepSeek V4 Flash.
- **small_model** (session titles, etc.): DeepSeek V4 Flash.

## Token Savings Techniques

1. **Caveman output** (per god's level): ~65% output token reduction (benchmarked).
2. **Short-circuit**: skip deliberation when instinct confidence ≥ 0.85.
3. **ECC strategic-compact**: compacts at logical task boundaries (ECC standard, untouched).
4. **context7 MCP**: fetch only the docs needed (not entire libraries).
5. **tamp MCP**: compress long sessions.
6. **serena MCP**: edit by symbol, not by line (fewer failed edits = fewer retries).

## Forbidden

- GLM-5.2 for any agent other than Apollo.
- Free-tier ZEN models (Big Pickle, DeepSeek V4 Flash Free, MiMo-V2.5 Free, etc.) — data-retention risk during their trial period; the zero-retention exception on Zen does not cover them. Want free models? Use the dedicated free strategies (`free-openrouter` / `free-big-pickle` / `free-nvidia-build`) — never mix free-tier ZEN models into a GO config.
- Zen pay-as-you-go models — Zen models belong in Zen strategies (`zen-max-quality` / `zen-balanced` / `zen-budget`). Don't mix them into a GO config; switch to a Zen strategy instead.
- BYO-key providers (OpenAI, Anthropic direct) — Olympus runs on OpenCode providers only (GO plan, OpenCode Zen, or the free-tier providers).
