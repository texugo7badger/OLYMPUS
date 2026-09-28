---
description: Show short-circuit hit rate from the activity feed (v3.0 also from the brain-stats API). Displays how often gods skipped deliberation based on high-confidence instincts.
---

# Short-Circuit Report (v3.0 VaultBrain)

Show the short-circuit hit rate from the activity feed.

## Output

- Total dispatches (last 7 days)
- Short-circuit dispatches (last 7 days)
- Hit rate percentage
- Per-god breakdown
- Top 5 most-used instincts (by samples)
- v3.0: 14-day sparkline of short-circuit hit rate
- v3.0: Current vs recommended LLM strategy

## Implementation

v3.0: This command fetches `/api/olympus/brain-stats` (which reads `~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl` and computes per-god metrics) and renders the aggregate stats + sparkline. The v3.0 capture pipeline writes `dispatch_outcome` events with `short_circuited: true` for short-circuit dispatches (the old `meta.short_circuit: true` field on `delegation` events is still written for backward-compat).

If the brain-stats API is unavailable (e.g., the Next.js server isn't running), fall back to reading `live.jsonl` directly and filtering for `action: "dispatch_outcome"` and `short_circuited: true`. This does NOT invoke an LLM — pure data analysis.

$ARGUMENTS
