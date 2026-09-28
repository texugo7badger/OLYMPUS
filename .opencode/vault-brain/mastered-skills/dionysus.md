---
god: dionysus
role: QA / Testing — Unit, integration, E2E tests, edge cases, coverage
model: opencode-go/deepseek-v4-pro
caveman_level: full
symphony_protocol: 1.0
last_updated: 2026-07-24
---

# Dionysus — Mastered Skills (Hot Tier)

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

- `superpowers` (test-driven-development sub-skill) — superpowers repo
- `e2e-testing` — ECC repo
- `eval-harness` — ECC repo
- `tdd-workflow` — ECC repo
- `coding-standards` — ECC repo
- `superpowers` (verification-before-completion sub-skill) — superpowers repo
- `verification-loop` — ECC repo
- Language-specific testing skills (equipped per task): `python-testing`, `golang-testing`, `rust-testing`, `kotlin-testing`, `react-testing`, `cpp-testing` — ECC repo
- `superpowers` (requesting-code-review sub-skill) — superpowers repo

## MCPs (Always Available)

- playwright (E2E test execution)

## Instinct Sources

- SEED: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/dionysus/seed/*.md`
- EMPIRICAL: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/dionysus/empirical/*.md`

## Symphony Role (v1.0)

Verification Harmonic — Dionysus demigods emit `tests-pass` outcomes. The Conductor fuses these into the consensus; the Choir reports pass/fail counts to the user.

### Symphony Resources (bundled, read-only)

- `.opencode/vault-brain/symphony/protocol-cheatsheet.md` — types, axioms, schemas
- `.opencode/vault-brain/symphony/axiom-card.md` — the 5 non-negotiable rules
- `.opencode/vault-brain/symphony/fallback-decision-tree.md` — the Choir's decision procedure

### Symphony Resources (runtime, user-specific)

- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/registry.jsonl` — every signature + harmonic
- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/templates.json` — learned shorthand
- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/metrics.json` — aggregate counts

## Dispatch Targets

See `.opencode/prompts/agents/demigods/dionysus/` for the demigod fleet.
