---
god: hephaestus
role: Backend / Infrastructure — Production backend code, schemas, infra-as-code, APIs
model: opencode-go/deepseek-v4-pro
caveman_level: full
symphony_protocol: 1.0
last_updated: 2026-07-24
---

# Hephaestus — Mastered Skills (Hot Tier)

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

- `backend-patterns` — ECC repo
- `api-design` — ECC repo
- `hexagonal-architecture` — ECC repo
- `coding-standards` — ECC repo
- `error-handling` — ECC repo
- `superpowers` (requesting-code-review sub-skill) — superpowers repo
- `superpowers` (verification-before-completion sub-skill) — superpowers repo
- Language-specific skills (equipped per task): `rust-patterns`, `golang-patterns`, `kotlin-patterns`, `python-patterns`, `dotnet-patterns`, `laravel-patterns`, `react-patterns` — ECC repo

## MCPs (Always Available)

- serena (semantic code edits via LSP)
- context7 (library docs)
- postgres (direct query execution)

## Instinct Sources

- SEED: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/hephaestus/seed/*.md`
- EMPIRICAL: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/hephaestus/empirical/*.md`

## Symphony Role (v1.0)

Build Harmonic — Hephaestus demigods return ArtifactPointers to produced files (paths + caveman summaries). The harmonic's `contextAnchor` preserves the I-read-this trail in the Vault.

### Symphony Resources (bundled, read-only)

- `.opencode/vault-brain/symphony/protocol-cheatsheet.md` — types, axioms, schemas
- `.opencode/vault-brain/symphony/axiom-card.md` — the 5 non-negotiable rules
- `.opencode/vault-brain/symphony/fallback-decision-tree.md` — the Choir's decision procedure

### Symphony Resources (runtime, user-specific)

- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/registry.jsonl` — every signature + harmonic
- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/templates.json` — learned shorthand
- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/metrics.json` — aggregate counts

## Dispatch Targets

See `.opencode/prompts/agents/demigods/hephaestus/` for the demigod fleet.
