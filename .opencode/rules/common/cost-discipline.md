# Common Rules — Cost Discipline (GO Plan)

> Detailed cost rules. See `operating-principles.md` for the summary.
> Zen and free-tier strategies are covered in [MODEL-STRATEGIES.md](../../../MODEL-STRATEGIES.md) and [TOKEN-ECONOMY.md](../../../TOKEN-ECONOMY.md).

## GO Plan Limits

- **5-hour rolling**: $12 of usage
- **Weekly**: $30 of usage
- **Monthly**: $60 of usage
- When limits are hit, GO blocks requests. There are **no automatic fallbacks** — switch strategies instead: a Zen strategy (`zen-max-quality` / `zen-balanced` / `zen-budget` — pay-as-you-go, no request caps) or **Local** (your own hardware, $0). The free tier was retired in v0.0.22.

## Per-Model Request Budgets (GO plan)

| Model | req/5hr | req/week | req/month |
|-------|---------|----------|-----------|
| DeepSeek V4.1 Flash (1017) | 34,670 | 86,670 | 173,330 |
| Hy3 | 4,300 | 10,750 | 21,500 |
| Qwen3.7 Plus | 4,300 | 10,800 | 21,600 |
| Kimi K2.7 Code | 1,350 | 3,380 | 6,750 |
| MiniMax M3 | 3,200 | 8,000 | 16,000 |
| Qwen3.8 Flash | 5,400 | 13,500 | 27,000 |
| MiMo-V2.6-Flash | 30,100 | 75,200 | 150,400 |
| Kimi K3 (max-quality only) | 110 | 250 | 490 |

> Verified against https://opencode.ai/v2/docs/console/go/ on 2026-10-29 (Go plan, $10/mo).

## Strategy Allocation (go-balanced, the default)

- **Apollo**: DeepSeek V4.1 Flash (1M ctx / 384k out) — the 1017 benchmark leader; 173,330 req/month makes planning effectively uncapped.
- **Atlas**: Hy3 — orchestration at $0.14/$0.58.
- **Specialist gods (backend/security/DB/vault)**: DeepSeek V4.1 Flash.
- **Specialist gods (frontend/QA/integrations)**: Qwen3.7 Plus.
- **DevOps**: MiniMax M3.
- **Volume tier (go-budget)**: MiMo-V2.6-Flash — $0.14/$0.28, 150,400 req/month.
- **small_model** (session titles, etc.): DeepSeek V4.1 Flash.
- **Retired**: DeepSeek V4 Pro (V4.1 Flash 1017 is better and cheaper), GLM-5.3-Flash on quality roles, and the free tier.

## Token Savings Techniques

1. **Caveman output** (per god's level): ~65% output token reduction (benchmarked).
2. **Short-circuit**: skip deliberation when instinct confidence ≥ 0.85.
3. **ECC strategic-compact**: compacts at logical task boundaries (ECC standard, untouched).
4. **context7 MCP**: fetch only the docs needed (not entire libraries).
5. **tamp MCP**: compress long sessions.
6. **serena MCP**: edit by symbol, not by line (fewer failed edits = fewer retries).

## Forbidden

- GLM-5.3 for any agent other than Apollo.
- Free-tier ZEN models (Big Pickle, DeepSeek V4 Flash Free, MiMo-V2.5 Free, etc.) — data-retention risk during their trial period; the zero-retention exception on Zen does not cover them. Want free models? Use the dedicated free strategies (`free-openrouter` / `free-big-pickle` / `free-nvidia-build`) — never mix free-tier ZEN models into a GO config.
- Zen pay-as-you-go models — Zen models belong in Zen strategies (`zen-max-quality` / `zen-balanced` / `zen-budget`). Don't mix them into a GO config; switch to a Zen strategy instead.
- BYO-key providers (OpenAI, Anthropic direct) — Olympus runs on OpenCode providers only (GO plan, OpenCode Zen, or the free-tier providers).
