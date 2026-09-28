---
god: artemis
role: Security / Auditing — Vulnerability hunting, OWASP Top 10, SAST/DAST, secrets
model: opencode-go/qwen3.7-plus
caveman_level: lite
symphony_protocol: 1.0
last_updated: 2026-07-24
---

# Artemis — Mastered Skills (Hot Tier)

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

- `security-review` — ECC repo
- `production-audit` — ECC repo
- `prompt-defense-baseline` — ECC repo
- `superpowers` (systematic-debugging sub-skill) — superpowers repo
- `coding-standards` — ECC repo
- `security-scan` — ECC repo
- `agent-architecture-audit` — ECC repo (for AI-code audit)
- `superpowers` (requesting-code-review sub-skill) — superpowers repo

## MCPs (Always Available)

- sentry (production error tracking for vuln correlation)
- langfuse (LLM trace observability for prompt-injection detection)

## Instinct Sources

- SEED: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/artemis/seed/*.md`
- EMPIRICAL: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/artemis/empirical/*.md`

## Symphony Role (v1.0)

Harmonic Contributor — Artemis demigods return structured HarmonicPatterns with `no-secrets` outcomes. Artemis never produces user-facing prose; the Decoding Choir synthesizes the security verdict.

### Symphony Resources (bundled, read-only)

- `.opencode/vault-brain/symphony/protocol-cheatsheet.md` — types, axioms, schemas
- `.opencode/vault-brain/symphony/axiom-card.md` — the 5 non-negotiable rules
- `.opencode/vault-brain/symphony/fallback-decision-tree.md` — the Choir's decision procedure

### Symphony Resources (runtime, user-specific)

- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/registry.jsonl` — every signature + harmonic
- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/templates.json` — learned shorthand
- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/metrics.json` — aggregate counts

## Dispatch Targets

See `.opencode/prompts/agents/demigods/artemis/` for the demigod fleet.
