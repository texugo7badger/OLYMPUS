---
description: Run Callimachus's 7-stage brain lifecycle (INTAKE → CLASSIFY → EXTRACT → SCOPE → LINK → RECALIBRATE → PRUNE). v3.0: RECALIBRATE replaces DECAY with outcome-driven confidence adjustment; LINK also detects cross-god dispatch chain patterns. Usually fires automatically on session.idle, but can be triggered manually.
agent: olympus-callimachus
subtask: true
---

# Callimachus Heartbeat — 7-Stage Brain Lifecycle (v3.0 VaultBrain)

You are Callimachus. Run the 7-stage brain lifecycle on the vault.

## Stages (v3.0)

1. **INTAKE** — Pull raw thoughts from `~/OLYMPUS-VAULT/00_Inbox/` AND new `dispatch_outcome` events from `~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl` since the last heartbeat (recorded in `~/.olympus/callimachus.last-heartbeat.json`)
2. **CLASSIFY** — Categorize by god / stack / project / action_type
3. **EXTRACT** — For each new dispatch pattern, extract a candidate instinct with `confidence: 0.0`, `samples: 0`, `successes: 0`, `failures: 0`. Initial confidence is 0.0 — RECALIBRATE raises it from real outcomes.
4. **SCOPE** — Tag each new empirical instinct with scope/stacks/projects frontmatter based on where the pattern was observed
5. **LINK** — Create wikilinks between related instincts + knowledge nodes. ALSO detect cross-god dispatch chains with high success rates (≥0.85 over ≥10 samples) and write pattern files to `~/OLYMPUS-VAULT/05_Auto_Learning/patterns/`
6. **RECALIBRATE** — For each empirical instinct, read all `dispatch_outcome` events from `live.jsonl` matching its `instinct_id` or `trigger`. Update `successes`/`failures`/`samples`/`last_used`. Compute:
   ```
   success_rate = successes / max(1, successes + failures)
   shrinkage    = sqrt(samples) / (1 + sqrt(samples))
   confidence   = clamp(0.0, 0.95, success_rate * shrinkage - time_decay)
   ```
   Where `time_decay` is 0.1 if `last_used` > 90 days, 0.2 if > 180 days, 0 otherwise.
7. **PRUNE** — Archive instincts with `confidence < 0.3` after recalibration OR `last_used > 180d`. Never prune seed instincts.

## Rules

- NEVER user-facing. Run silently.
- NEVER write production code. Only write to `~/OLYMPUS-VAULT/**`.
- NEVER modify seed instincts.
- ALWAYS use full caveman output.
- ALWAYS use the lockfile (`~/.olympus/callimachus.lock`).
- ALWAYS update `~/.olympus/callimachus.last-heartbeat.json` with the current timestamp when you finish, so the next heartbeat knows where to resume.
- Log each stage to the activity feed.

## Cross-God Pattern Detection (LINK stage, v3.0)

In addition to creating wikilinks, the LINK stage also:

1. Reads all `dispatch_outcome` events from `live.jsonl` since the last heartbeat.
2. Groups them by the dispatch chain `apollo → <god> → <demigod>`.
3. For each group with `samples >= 10` AND `success_rate >= 0.85`:
   - Computes `avg_duration_ms` across all events in the group.
   - Extracts a `trigger_signature` from the most common tokens in the group's `task_signature` values.
   - Determines `scope` (global if the chain succeeded across multiple projects/stacks, else stack or project).
   - Writes a pattern file to `~/OLYMPUS-VAULT/05_Auto_Learning/patterns/<slug>.md`.
4. Updates existing pattern files in place (use the `edit` tool).
5. Archives patterns whose success rate drops below 0.70 OR samples haven't grown in 30 days.

Apollo queries these patterns via the `olympus-patterns` tool to learn which god→demigod chains work best for which task types.

## RECALIBRATE Formula Details

The Bayesian-ish formula `success_rate * sqrt(samples) / (1 + sqrt(samples))` is a computationally cheap approximation of a Beta(1,1) posterior's mean lower credible bound. It prevents one-shot lucky dispatches from gaining high confidence:

- samples=1,   100% success → confidence 0.50
- samples=4,   100% success → confidence 0.67
- samples=10,  100% success → confidence 0.76
- samples=25,   90% success → confidence 0.75
- samples=100,  90% success → confidence 0.82

The cap at 0.95 ensures empirical instincts can never reach 1.0 (reserved for seed instincts).

## Deep Mode (Compact-Brain Button)

If invoked with `--deep`, also run:
- **COMPLETE ALIASES** — merge duplicate instincts (similarity > 0.85)
- **MERGE DUPLICATES** — deduplicate by trigger similarity within same demigod + skill

$ARGUMENTS
