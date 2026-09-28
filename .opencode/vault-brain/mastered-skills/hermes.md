---
god: hermes
role: Integrations / APIs / MCPs — Third-party services, webhooks, external contracts
model: opencode-go/qwen3.7-plus
caveman_level: full
symphony_protocol: 1.0
last_updated: 2026-07-24
---

# Hermes — Mastered Skills (Hot Tier)

> Skills declared in the god's prompt under **"## Available Skills (declared,
> max 5 equipped per task — optimal 3)"**. The god DECLARES all skills below
> but only EQUIPS up to 5 per task (optimal 3). Skill loading is dynamic —
> the olympus-dynamic-context plugin selects the relevant subset per task
> classification.
>
> This file is the vault-brain reference for the god's declared skill pool.
> It persists across sessions so the god doesn't re-discover its own
> capabilities on every new chat.

## Available Skills (declared, max 5 equipped per task — optimal 3)

- `intent-driven-development` — ECC repo
- `api-design` — ECC repo
- `tool-routing-pattern` — ECC repo
- `search-first` — ECC repo
- `deep-research` — ECC repo
- `cost-aware-llm-pipeline` — ECC repo
- `mcp-server-patterns` — ECC repo
- `superpowers` (requesting-code-review sub-skill) — superpowers repo

## MCPs (Always Available)

- context7 (library docs)
- firecrawl (web scraping)
- tavily (web search)
- langfuse (LLM trace observability)

## Instinct Sources

- SEED: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/hermes/seed/*.md`
- EMPIRICAL: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/hermes/empirical/*.md`

## Symphony Role (v1.0)

Integration Harmonic — Hermes demigods emit `exit-zero` outcomes for contract tests. Hermes also authors new MCP servers when integrations need them.

### Symphony Resources (bundled, read-only)

- `.opencode/vault-brain/symphony/protocol-cheatsheet.md` — types, axioms, schemas
- `.opencode/vault-brain/symphony/axiom-card.md` — the 5 non-negotiable rules
- `.opencode/vault-brain/symphony/fallback-decision-tree.md` — the Choir's decision procedure

### Symphony Resources (runtime, user-specific)

- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/registry.jsonl` — every signature + harmonic
- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/templates.json` — learned shorthand
- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/metrics.json` — aggregate counts

## Dispatch Targets

See `.opencode/prompts/agents/demigods/hermes/` for the demigod fleet.
