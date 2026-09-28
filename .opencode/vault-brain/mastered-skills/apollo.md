---
god: apollo
role: Master Planner — Architecture, Planning, Spec Interview, DAG Design
model: opencode-go/glm-5.2
caveman_level: NEVER
symphony_protocol: 1.0
last_updated: 2026-07-24
---

# Apollo — Mastered Skills (Hot Tier)

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

- `superpowers` (dispatching-parallel-agents sub-skill) — superpowers repo
- `superpowers` (subagent-driven-development sub-skill) — superpowers repo
- `superpowers` (writing-plans sub-skill) — superpowers repo
- `superpowers` (brainstorming sub-skill) — superpowers repo
- `continuous-learning-v2` — Olympus native (VaultBrain reference)
- `intent-driven-development` — ECC repo (latent; equip when scoping ambiguous asks)
- `superpowers` (writing-skills sub-skill) — superpowers repo (latent; equip when crystallising a quick circuit)

## MCPs (Always Available)

- github (PR/issue/workflow sync)
- sequential-thinking (multi-step reasoning)

## Instinct Sources

- SEED: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/apollo/seed/*.md`
- EMPIRICAL: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/apollo/empirical/*.md`

## Symphony Role (v1.0)

Primary Composer — Apollo emits VibrationalSignatures to demigods in parallel and invokes the Decoding Choir at cycle close. Apollo is the only god whose output reaches the user, so Apollo alone decides when to call symphony-decode.

### Symphony Resources (bundled, read-only)

- `.opencode/vault-brain/symphony/protocol-cheatsheet.md` — types, axioms, schemas
- `.opencode/vault-brain/symphony/axiom-card.md` — the 5 non-negotiable rules
- `.opencode/vault-brain/symphony/fallback-decision-tree.md` — the Choir's decision procedure

### Symphony Resources (runtime, user-specific)

- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/registry.jsonl` — every signature + harmonic
- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/templates.json` — learned shorthand
- `~/OLYMPUS-VAULT/05_Auto_Learning/vibrations/metrics.json` — aggregate counts

## Dispatch Targets

See `.opencode/prompts/agents/demigods/apollo/` for the demigod fleet.
