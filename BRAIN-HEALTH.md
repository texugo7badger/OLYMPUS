# Brain health, Compact Brain and the recycler

> The brain is not a junk drawer. This page defines what each maintenance
> action does, what it never touches, and how the effect is measured. The
> claim is the benchmark in `reports/brain-bench-latest.md`, not a feeling.

## The four pools

| Pool | Where | Counts as brain? | Used how |
|---|---|---|---|
| **Seed** | `05_Auto_Learning/instincts/<god>/seed/` | yes (active) | immutable baseline, always visible |
| **Empirical** | `.../<god>/empirical/` | yes (active) | learned global/stack patterns |
| **Project memory** | `05_Auto_Learning/project-instincts/<project>/<god>/` | **no** | visible only when that project is active; never a shortcut |
| **Archive** | `09_Archive/instincts-<date>/` | **no** | memory for audit/restore; not loaded into the prompt |

A **quick circuit** is only a cross-project proven shortcut: `quick_circuit:
true` in active seed/empirical, with ≥20 samples, ≥90% success, confidence
≥0.82 and **two distinct projects**. A project pattern is a **hint**
(`project_hint: true`), never a short-circuit. Synthetic `olympus-smoke`
fixtures are rejected by the curation vocabulary and moved out by the v0.1.7
reset.

## What each action does

### Compact Brain (Callimachus deep pass)

- completes aliases, merges duplicates, repairs dead links, links orphans,
  expands empty pages;
- runs deterministic first (zero tokens), then at most one model pass/hour;
- writes a snapshot and keeps a **5-minute undo**;
- never modifies seed instincts and never deletes project memory.

### Recycler (Vault Policy)

- rolls oversized logs (activity, short-circuit, vibrations, benchmarks);
- archives instincts older than `instinctMaxAgeDays`;
- deletes archive files older than `archiveOlderThanDays` **only** when the
  policy is live and the user confirms;
- is a dry run by default (`dryRun: true`), with a preview of actions and
  bytes;
- never touches seeds or the project-memory lane.

**Recycle is not "delete the brain".** It applies an explicit TTL policy to
derived data. The archive manifest and the pre-reset backup are the undo
trail.

## Health score

`score = 100 - min(35, archive_ratio × 15) - (curation_age > 7d ? 15 : 0)`

- `archive_ratio = archived / max(1, active)`
- A high ratio means the active base is buried in old memories.
- A stale curation age means duplicates/links may have drifted.
- Quick circuits are reported separately; **0 is honest**, not a failure.

Recommendation thresholds:

| Condition | Recommendation |
|---|---|
| archive/active > 2 and archived > 20 | recycle |
| last curation > 7 days | compact |
| quick = 0 | say "none earned yet"; keep project hints scoped |
| otherwise | healthy |

The card in Settings → Brain health only recommends. The user confirms every
live action.

## The measurement

`npm run brain:bench` snapshots the pools, context weight (bytes / ~tokens),
knowledge freshness and retrieval P@5/MRR via the 15-query local eval. Run it
before and after a compact/recycle:

```bash
npm run brain:bench
# ... run Compact Brain or the recycler ...
npm run brain:bench -- --compare reports/brain-bench-latest.json
```

### v0.1.7 reset — measured

| Metric | Before | After |
|---|---:|---:|
| Active instincts | 242 | 79 |
| Project memory | 0 | 187 |
| Archived | 1,157 | 0 |
| Quick circuits | 0 | 0 |
| Knowledge notes | 41 | 51 |
| Active context | ~89,900 tok | ~15,100 tok (+ ~17,100 knowledge) |
| Retrieval P@5 (FTS / hybrid) | 73% / 73% | 73% / 73% |
| Retrieval MRR@5 | 0.733 / 0.733 | 0.733 / 0.733 |

The reset cut the active instinct context by **83%** and removed the false "quick
circuit" population while keeping retrieval precision unchanged. The AIME
memory was not lost: it moved to the project lane and stays visible when AIME
is active.

## Honest limits

- The retrieval eval is a 15-query local set, not a universal benchmark; it
  catches regressions, not model quality.
- Dense retrieval needs Ollama; when it is down the hybrid column equals FTS.
  The bench reports that instead of inventing a number.
- A model-task quality suite (does the answer improve?) is a separate eval and
  is not claimed here.
- Auto-recycle is opt-in. `dryRun` is the default; a live prune requires an
  explicit user action.
