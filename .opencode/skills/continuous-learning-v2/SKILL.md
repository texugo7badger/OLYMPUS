---
name: continuous-learning-v2
description: VaultBrain reference — the unified, OpenCode-native learning system that captures every god dispatch in real time, computes outcome-driven confidence, and short-circuits faster as the brain matures. v3.0 supersedes the Claude Code-centric v2.1 Python/shell hooks (now removed).
metadata:
  origin: Olympus
  architecture: vaultbrain
  supersedes: continuous-learning-v2.1
version: 3.0.0
---

# VaultBrain — Continuous Learning v3.0 (OpenCode-Native)

> This skill is a **documentation reference**. It describes how the Olympus
> brain actually learns. There is no Python CLI, no shell hook, no Claude
> Code shim — those were removed in v3.0 because they never fired inside
> OpenCode and lived outside the vault where Callimachus could not curate
> them. The brain now runs entirely inside the Olympus overlay plugin
> (`.opencode/olympus/`) and the vault (`~/OLYMPUS-VAULT/`).

## When to Load This Skill

Load this skill when you need to reason about:

- How gods query their instincts before acting (`olympus-instinct-query`).
- How short-circuits are decided (confidence threshold, verification sampling, failure penalty).
- How dispatch outcomes flow back into the brain (capture → recalibrate → patterns).
- How Callimachus's 7-stage lifecycle keeps instincts calibrated against reality.
- How Apollo picks a strategy based on brain maturity (self-optimization).
- What the God Intelligence Dashboard is showing you.

This is **not** an executable skill. It exists so any god, ECC sub-agent, or
human reading the vault can understand the learning loop without grepping
TypeScript.

## The Two-Legacy Problem (Why v3.0 Exists)

Olympus inherited two parallel learning systems that never talked to each
other. v3.0 merges them.

### Legacy A — ECC's continuous-learning-v2.1 (Claude Code-centric)

- Storage: `~/.local/share/ecc-homunculus/` (outside the vault).
- Capture: Python CLI (`instinct-cli.py`) + shell hooks (`observe.sh`)
  wired to Claude Code's `PreToolUse`/`PostToolUse` events.
- Scope: Per-project (git remote URL hash) + global.
- Instinct model: Atomic, confidence 0.3–0.9, domain-tagged, evidence-backed.

Why it was dead weight inside Olympus:

- The hooks never fired (OpenCode does not emit `PreToolUse`/`PostToolUse`).
- The Python CLI was never invoked by any Olympus component.
- The data lived outside the vault, so Callimachus could not curate it.
- Confidence was set subjectively by the observer agent, not by measured
  outcomes — patterns looked strong without actually being strong.

v3.0 removes `hooks/`, `scripts/`, and `agents/` from this skill entirely.
The SKILL.md remains as a reference; the executable logic lives in the
overlay plugin.

### Legacy B — Olympus's instinct system (Callimachus-curated, capture-blind)

- Storage: `~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/{seed,empirical,_archive}/`.
- Capture: Callimachus INTAKE stage reading raw thoughts from `00_Inbox/`.
- Tools: `olympus-instinct-query`, `olympus-shortcircuit`, `olympus-dispatch`.
- Instinct model: Seed (immutable, 1.0) + empirical (mutable, capped 0.95, time-decaying).

Why it was deaf:

- The brain only learned from after-the-fact Callimachus curation of inbox notes.
- It did not capture tool calls, dispatches, successes, or failures in real time.
- Confidence never went UP based on actual success — only down via time decay.
- The gods queried instincts before acting, but nothing fed instincts during action.

### The Merge — VaultBrain

The unified brain captures every god → ECC dispatch in real time, learns
from outcomes, and short-circuits faster as confidence grows. System A's
"capture everything" promise meets System B's "vault-curated, OpenCode-native"
architecture.

## The VaultBrain Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenCode Session                             │
│                                                                  │
│  Apollo dispatches → Specialist God acts → ECC sub-agent executes│
│       │                    │                    │                │
│       ▼                    ▼                    ▼                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Olympus Overlay Plugin — tool.execute.after hook        │   │
│  │  (fires AFTER every tool call, 100% reliable)            │   │
│  │  Captures: { god, task_signature, dispatch_target,       │   │
│  │              skill_equipped, mcp_enabled, outcome,       │   │
│  │              duration_ms, tokens_used, stack, project }  │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                        │
│                         ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl               │   │
│  │  (append-only, one JSON line per action)                  │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                        │
│            ┌────────────┼────────────┐                           │
│            ▼            ▼            ▼                           │
│     Real-time       Callimachus     Short-circuit                 │
│     feedback        heartbeat      verification                  │
│     (immediate)     (session.idle)  (1-in-10)                   │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VaultBrain (unified)                          │
│                                                                  │
│  ~/OLYMPUS-VAULT/05_Auto_Learning/                                │
│  ├── instincts/<god>/                                            │
│  │   ├── seed/          ← immutable hand-authored baselines      │
│  │   ├── empirical/     ← learned from real outcomes             │
│  │   └── _archive/      ← pruned (recoverable)                   │
│  ├── episodes/<god>/    ← chronological action log per god       │
│  ├── patterns/          ← cross-god patterns (emergent)          │
│  └── metrics/<god>.json ← per-god stats (accuracy, speed, cost)  │
└─────────────────────────────────────────────────────────────────┘
```

## Design Principles

1. **Capture everything, learn lazily.** The `tool.execute.after` hook writes
   to `live.jsonl` synchronously (target <2ms per call). Callimachus
   processes it asynchronously on `session.idle`. No latency on the hot path.

2. **Outcome-driven confidence.** An empirical instinct's confidence is NOT
   set by Callimachus's judgment. It is computed from the **actual success
   rate** of dispatches that matched the instinct's trigger:
   ```
   confidence = clamp(0.0, 0.95, success_rate * sqrt(samples) / (1 + sqrt(samples)))
   ```
   This replaces subjective "0.3 tentative, 0.7 strong" labels with measured
   reality. The Bayesian-ish `sqrt(samples) / (1 + sqrt(samples))` factor
   shrinks the confidence toward zero when the sample size is small, so a
   one-shot success never produces a high-confidence instinct.

3. **God-scoped + project-scoped.** Each instinct has both `god` AND
   `scope`/`projects`/`stacks` frontmatter. A Hephaestus instinct for
   "Rust build error → dispatch to ecc-rust-build-resolver" can be
   `scope: global` (applies everywhere) or `scope: project` (only in
   `my-rust-app`). The short-circuit filter checks both.

4. **Short-circuit with verification.** When `confidence >= 0.85`, the god
   short-circuits (skips deliberation). But 1-in-10 short-circuits are
   randomly forced to re-deliberate. The outcome is compared against the
   short-circuit prediction. If the re-deliberation would have picked a
   different ECC sub-agent AND that sub-agent would have succeeded, the
   instinct's confidence is penalized. This catches pattern drift.

5. **Failure penalty is immediate.** If a dispatch fails (the ECC sub-agent
   returns an error, or the user manually corrects the result), the matching
   instinct's `confidence -= 0.3` right away — not waiting for Callimachus.
   The `tool.execute.after` hook calls `penalizeInstinct()` in real time.

6. **Cross-god pattern emergence.** Callimachus's LINK stage also looks
   for cross-god patterns: "When Apollo dispatches to Hephaestus AND
   Hephaestus dispatches to ecc-rust-build-resolver, the success rate is
   94%" becomes a **pattern** in `05_Auto_Learning/patterns/` that Apollo
   can query directly. This lets Apollo learn which god→ECC chains work
   best for which task types.

## Instinct Frontmatter Schema

```yaml
---
god: hephaestus                    # which god this instinct belongs to
confidence: 0.87                   # 0.0–0.95 (empirical) or 1.0 (seed)
scope: stack                       # global | stack | project
stacks: [rust]                     # which stacks this applies to
projects: []                       # which projects (scope=project only)
last_used: 2026-07-17T10:30:00Z    # last time this instinct was applied
samples: 14                        # how many dispatches matched this instinct
successes: 12                      # how many of those succeeded
failures: 2                        # how many of those failed
source: empirical                  # seed | empirical
immutable: false                   # true for seed, false for empirical
trigger: "Rust build error: E0277 trait bound not satisfied"
action: "dispatch to ecc-rust-build-resolver with caveman skill + serena MCP"
skill: caveman
mcp: serena
ecc_agent: ecc-rust-build-resolver
id: rust-e0277-trait-bound-resolver
---
```

The `successes` and `failures` fields are v3.0 additions. Callimachus's
RECALIBRATE stage updates them from `live.jsonl` every heartbeat.

## Short-Circuit Mechanism

When a specialist god receives a task:

1. **Query**: The god calls `olympus-instinct-query` with the task signature
   (keywords, active stacks, project slug).
2. **Filter**: The tool runs `instinct-scope.filterInstincts()` against
   `empirical/*.md` + `seed/*.md`.
3. **Match**: If any empirical instinct has `confidence >= 0.85` AND scope
   matches, the god short-circuits:
   - Read `ecc_agent` → which ECC sub-agent to dispatch to.
   - Read `skill` → which skill to equip.
   - Read `mcp` → which MCP to enable.
   - Dispatch immediately via `olympus-dispatch` (no deliberation tokens spent).
4. **Verification sampling**: 1-in-10 short-circuits are randomly forced to
   re-deliberate. The outcome is compared against the short-circuit
   prediction. If re-deliberation picks a different sub-agent AND that
   sub-agent would have succeeded, the instinct's confidence is penalized.
5. **No match**: The god deliberates normally, dispatches to the ECC
   sub-agent it judges best. Callimachus extracts a candidate empirical
   instinct for next time.

## Anti-Addiction Guardrails

| Rule | Mechanism | Why |
|------|-----------|-----|
| Confidence cap | Empirical max 0.95 (never 1.0) | Forces re-evaluation; nothing is ever "certain" |
| Time decay | -0.1 at 90d, -0.2 at 180d, PRUNE at 180d | Stale patterns fade; god re-deliberates |
| Short-circuit threshold | confidence >= 0.85 to fire | Only well-proven patterns skip deliberation |
| Verification sampling | 1-in-10 short-circuits forced to re-deliberate | Catches pattern drift early |
| Failure penalty | Task fails → confidence -= 0.3 (immediate, in hook) | Broken patterns get demoted fast |
| Seed immutability | Seed cannot be overwritten by empirical | God's identity/baseline preserved |
| Cross-stack promotion | Cross-stack visible only if confidence >= 0.85 | Prevents stack-mismatched patterns from leaking |

## Callimachus's 7-Stage Lifecycle (v3.0)

1. **INTAKE** — Pull raw thoughts from `00_Inbox/` + new dispatch events
   from `06_Activity_Feed/live.jsonl` since the last heartbeat.
2. **CLASSIFY** — Categorize by god / stack / project / action_type.
3. **EXTRACT** — For each new dispatch pattern, extract a candidate
   instinct `{trigger, action, confidence: 0.0, samples: 0, successes: 0,
   failures: 0}`. Initial confidence is 0.0 — RECALIBRATE raises it from
   real outcomes.
4. **SCOPE** — Tag each new empirical instinct with `scope`/`stacks`/
   `projects` frontmatter based on where the pattern was observed.
5. **LINK** — Create wikilinks between related instincts + knowledge nodes.
   **ALSO** detect cross-god dispatch chains with high success rates
   (>=0.85 over >=10 samples) and write **pattern files** to
   `05_Auto_Learning/patterns/`.
6. **RECALIBRATE** (replaces DECAY) — For each empirical instinct, read
   all dispatch events matching its `id` or `trigger` from `live.jsonl`
   since the last heartbeat. Compute the success rate. Set:
   ```
   confidence = clamp(0.0, 0.95, success_rate * sqrt(samples) / (1 + sqrt(samples)))
   ```
   Apply time-decay on top: -0.1 if `last_used` > 90 days, -0.2 if > 180
   days. Update `samples`, `successes`, `failures`, `last_used` frontmatter.
7. **PRUNE** — Archive instincts with `confidence < 0.3` after recalibration
   OR `last_used > 180 days`. Never prune seed instincts. Archived
   instincts are recoverable.

Compact-brain button (deep mode) adds: **COMPLETE ALIASES** + **MERGE
DUPLICATES** (deep compaction).

## The Real-Time Capture Pipeline

Every god → ECC dispatch produces this event shape in `live.jsonl`:

```json
{
  "ts": "2026-07-17T10:30:00Z",
  "god": "hephaestus",
  "action": "dispatch",
  "task_signature": "rust build error: E0277 trait bound not satisfied",
  "ecc_agent": "ecc-rust-build-resolver",
  "skill_equipped": "caveman",
  "mcp_enabled": "serena",
  "instinct_id": "rust-e0277-trait-bound-resolver",
  "short_circuited": true,
  "outcome": "success",
  "duration_ms": 12450,
  "tokens_used": { "input": 3200, "output": 1800 },
  "stack": "rust",
  "project": "my-rust-app"
}
```

Three consumers read this stream:

- **Real-time feedback** (immediate): failure penalty fires the instant a
  short-circuited dispatch produces an error event.
- **Callimachus heartbeat** (session.idle): RECALIBRATE aggregates the
  window into per-instinct confidence updates.
- **Short-circuit verification** (1-in-10): re-deliberation outcomes are
  compared against the original short-circuit's prediction.

## God Intelligence Dashboard

The brain health dashboard includes a God Intelligence panel that shows
per-god:

- Short-circuit hit rate (% of dispatches that skipped deliberation).
- Average confidence (mean confidence across all empirical instincts).
- Instinct count (seed vs empirical vs archived).
- Success rate (7d / 30d / all-time).
- Top 5 instincts by samples (the most-proven patterns).
- Top 5 instincts by confidence (the most-trusted patterns).
- Learning velocity (new instincts per week).

The key visual is the short-circuit hit rate sparkline trending upward —
it should rise from 0% on day 1 to >50% by month 1 as the brain matures.

## Self-Optimizing Strategy

Apollo checks `/api/olympus/brain-stats` on `session.created` and
recommends a strategy change if the brain's maturity warrants it:

- Short-circuit hit rate > 70% AND avg confidence > 0.8 → suggest `go-budget`
  (the gods are smart enough to use cheaper models).
- Short-circuit hit rate < 30% AND avg confidence < 0.5 → suggest `go-max-quality`
  (the gods are still learning, use the best models).
- Otherwise → suggest `go-balanced` (the default).

The suggestion is **non-blocking** — Apollo mentions it in natural language
and the user decides. The brain never silently changes its own strategy.

## File Locations (OpenCode-Native)

| Component | Path |
|-----------|------|
| Overlay plugin entry | `.opencode/olympus/olympus-hooks.ts` |
| Active-agent tracker | `.opencode/olympus/lib/active-agent-tracker.ts` |
| Dispatch tracker (v3.0) | `.opencode/olympus/lib/dispatch-tracker.ts` |
| Instinct mutations (v3.0) | `.opencode/olympus/lib/instinct-mutations.ts` |
| instinct-query tool | `.opencode/olympus/tools/instinct-query.ts` |
| shortcircuit tool | `.opencode/olympus/tools/shortcircuit.ts` |
| dispatch tool | `.opencode/olympus/tools/dispatch.ts` |
| patterns tool (v3.0) | `.opencode/olympus/tools/patterns.ts` |
| God prompts | `.opencode/prompts/agents/Olympus/*.txt` |
| God-specific rules | `.opencode/rules/god-specific/*.md` |
| Common rules | `.opencode/rules/common/*.md` |
| Callimachus heartbeat cmd | `.opencode/commands/Olympus/callimachus-heartbeat.md` |
| Vault seed script | `scripts/seed-vault.py` |
| Brain stats API (v3.0) | `src/app/api/olympus/brain-stats/route.ts` |
| Brain health dashboard | `src/components/olympus/brain-health-dashboard.tsx` |
| Model strategies | `src/lib/model-strategies.ts` |
| Activity feed lib | `src/lib/activity-feed.ts` |
| Instinct scope lib | `src/lib/instinct-scope.ts` |

## Research Notes

This design was informed by research into:

- Bayesian reinforcement learning for binary outcomes — the
  `sqrt(samples) / (1 + sqrt(samples))` shrinkage factor is a
  computationally cheap approximation of a Beta(1,1) posterior's mean
  lower credible bound, which prevents one-shot lucky dispatches from
  gaining high confidence.
- OpenCode's `tool.execute.after` hook contract — the hook fires
  synchronously after every tool call with the full input + output
  context, making it the right place for capture.
- Cross-agent learning in multi-agent systems — emergent patterns are
  best discovered at the LINK stage (after individual instincts have
  stabilized), not at the EXTRACT stage (where they would create
  noisy duplicate instincts).
- Token cost optimization via caching/short-circuit — production systems
  (Anthropic's contextual retrieval, OpenAI's prompt caching) report
  30–70% token savings when confidence-gated skip-deliberation is in
  place. Olympus targets 30% by week 1, 60% by month 1, 80%+ by month 3.
- Obsidian/Logseq knowledge graph patterns — wikilinks + frontmatter
  scope tags give the vault PKM-grade queryability without any external
  database.

## Backward Compatibility

v3.0 is **not** backward-compatible with v2.1's data layout. Existing
`~/.local/share/ecc-homunculus/` data is orphaned (the user can delete
it). The Olympus vault layout is unchanged — existing seed instincts
remain valid. Empirical instincts gain the `successes` and `failures`
fields via a one-time migration in Callimachus's first RECALIBRATE
run (the fields default to 0 if absent).

## Related

- `~/OLYMPUS-VAULT/04_Knowledge/references/brain/` — deep research notes.
- `.opencode/rules/common/instinct-lifecycle.md` — hard rules.
- `.opencode/rules/common/operating-principles.md` — operating principles.
- `TOKEN-ECONOMY.md` — cost discipline + GO plan budget.

---

*VaultBrain: the brain that learns from outcomes, not from judgments.*
