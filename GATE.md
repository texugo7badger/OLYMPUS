# The instinct gate — go/no-go (v0.0.66)

> Measured 2026-11-03: **4,754 gate evaluations, 0 short-circuits.**
> Decision: **NO-GO.** The "short-circuit" claim is retired from the product
> narrative; the gate stays in the code as a logged experiment, not a promise.

## What was measured

`~/OLYMPUS-VAULT/05_Auto_Learning/shortcircuit-log.jsonl` — every gate
evaluation the dispatch path performs, with the task tags, the instinct tags,
the coverage and the resulting confidence. Across **4,754 rows** (the 4,477
in the v0.0.30 census plus the campaign since), **not one** crossed the
threshold. The gate has never fired in production.

## Why it does not fire

- The instinct triggers and the task tags rarely share enough tokens; the
  overlap stays below the threshold even for tasks the instincts were written
  for.
- The confidence values of the seed instincts were authored, not learned; the
  empirical pool is small relative to the trigger surface.
- The gate is a **prompt-level** heuristic, not a retrieval over the actual
  skill/knowledge index.

## The decision (go/no-go)

**No-go.** OLYMPUS stops claiming a short-circuit gate as a cost lever. The
honest cost levers are the ones with measured evidence:

1. **The curated MCP baseline** (39 tools, not 107) — measured in the run
   manifest.
2. **The lean hop agent** (file/shell tools only) — measured in the hop
   prompts.
3. **The deterministic spine** (0 tokens for plan validation, verify and
   progress) — measured by construction.
4. **The instinct RAG** — proven instincts as prompt context (a quality
   lever), not a dispatch skip.

## What would revive it

A gate that fires needs a retrieval join, not a tag overlap: query the skill
index (`03_Index/skill-vec.db`) for the task, take the top-k proven skills,
and skip the deliberation only when the retrieved action matches the task's
own verify contract. That is a v0.0.71+ experiment; it is not claimed today.

## Where the number lives

The God Intelligence Dashboard's Short-Circuit Health panel reads the same
log; it now labels the rate **0 / N (retired)** instead of a green promise.
