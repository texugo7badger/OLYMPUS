# Common Rules — Instinct Lifecycle (v3.0 VaultBrain)

> Detailed instinct rules. See `operating-principles.md` for the summary.
> v3.0: confidence is now outcome-driven (RECALIBRATE replaces DECAY).
> v3.0: cross-god dispatch chain patterns emerge at the LINK stage.

## Instinct Frontmatter Schema

```yaml
---
god: <god_id>                    # apollo, artemis, athena, dionysus, hephaestus, hermes, persephone, prometheus
confidence: <0.0-0.95>           # capped at 0.95 for empirical, 1.0 for seed; v3.0: computed from outcomes
scope: <global|stack|project>    # visibility filter
stacks: [<stack_id>, ...]        # which stacks this applies to (empty = all)
projects: [<slug>, ...]          # which projects this is bound to (scope=project only)
last_used: <ISO 8601>            # last time this instinct was applied (updated in real time by the hook)
samples: <integer>               # how many dispatches matched this instinct (successes + failures)
successes: <integer>             # v3.0: how many of those succeeded
failures: <integer>              # v3.0: how many of those failed
source: <seed|empirical>         # seed = hand-authored, empirical = learned
immutable: <true|false>          # true for seed, false for empirical
trigger: <string>                # what situation triggers this instinct
action: <string>                 # what to do (e.g., "dispatch to build-resolver")
skill: <string>                  # which skill to equip
mcp: <string>                    # which MCP to enable
demigod: <string>              # which demigod to dispatch to
---
```

## Scope Filter Rules

The `instinct-scope.filterInstincts()` function applies these 6 rules:

1. **UNIVERSAL**: `scope=global, stacks=[]` → always visible
2. **STACK-BOUND**: `scope=global, stacks=[a,b]` → visible if `activeStacks ∩ [a,b]` OR `effectiveConfidence ≥ 0.85` (cross-stack promotion)
3. **STACK-SCOPED**: `scope=stack` → visible only if `stacks ∩ activeStacks`
4. **PROJECT-BOUND**: `scope=project` → visible only if `projects ∋ activeSlug`
5. **TIME DECAY**: `last_used > 90 days` → `confidence -0.1`; `> 180 days` → `confidence -0.2` + PRUNE-eligible
6. **BROWSING MODE**: no active project → `scope=project` HIDDEN, `scope=stack/global` visible (with cross-stack tint)

## Short-Circuit Mechanism (v3.0)

When a specialist god receives a task:

1. **Query**: God calls `olympus-instinct-query` with the task signature (keywords, stack, project slug). Apollo may set `includePatterns: true` to also query cross-god dispatch chain patterns.
2. **Filter**: The tool runs `instinct-scope.filterInstincts()` against `empirical/*.md` + `seed/*.md`.
3. **Match**: If any empirical instinct has `confidence ≥ 0.85` AND `scope` matches → **short-circuit**:
   - Read `demigod` → which demigod to dispatch to
   - Read `skill` → which skill to equip
   - Read `mcp` → which MCP to enable
   - Dispatch immediately via `olympus-dispatch` (no deliberation tokens spent)
   - Call `olympus-shortcircuit` to record the short-circuit (updates `samples` + `last_used` in real time)
4. **Verification sampling**: 1-in-10 short-circuits are randomly forced to re-deliberate. The outcome is compared against the short-circuit prediction. If re-deliberation picks a different sub-agent AND that sub-agent would have succeeded, the instinct's confidence is penalized.
5. **Outcome capture (v3.0)**: The `tool.execute.after` hook tracks the open dispatch. When the active agent changes (or `session.idle` fires), the dispatch is finalized with `outcome` (success/failure/unknown), `duration_ms`, `tokens_used`. The hook immediately rewards (successes++) or penalizes (failures++, confidence -= 0.3) the matching instinct.
6. **No match**: The god deliberates normally, dispatches to the demigod it judges best. Callimachus extracts a candidate empirical instinct for next time.

## Anti-Addiction Guardrails (v3.0)

| Rule | Mechanism | Why |
|------|-----------|-----|
| Confidence cap | Empirical max 0.95 (never 1.0) | Forces re-evaluation; nothing is ever "certain" |
| Outcome-driven confidence (v3.0) | `confidence = success_rate * sqrt(samples)/(1+sqrt(samples)) - time_decay` | Grounded in measured reality, not subjective judgment |
| Time decay | -0.1 at 90d, -0.2 at 180d, PRUNE at 180d | Stale patterns fade; god re-deliberates |
| Short-circuit threshold | confidence ≥ 0.85 to fire | Only well-proven patterns skip deliberation |
| Verification sampling | 1-in-10 short-circuits forced to re-deliberate | Catches pattern drift early |
| Failure penalty (v3.0) | Task fails → confidence -= 0.3 IMMEDIATELY (in hook, not Callimachus) | Broken patterns get demoted fast — no waiting for the next heartbeat |
| Seed immutability | Seed cannot be overwritten by empirical | God's identity/baseline preserved |
| Cross-stack promotion | Cross-stack visible only if confidence ≥ 0.85 | Prevents stack-mismatched patterns from leaking |
| Shrinkage factor (v3.0) | `sqrt(samples)/(1+sqrt(samples))` shrinks confidence toward zero when samples are few | One-shot lucky dispatches can't gain high confidence |

## Callimachus's 7-Stage Lifecycle (v3.0)

1. **INTAKE** — Pull raw thoughts from `00_Inbox/` AND new `dispatch_outcome` events from `06_Activity_Feed/live.jsonl` since last heartbeat
2. **CLASSIFY** — Categorize by god / stack / project / action_type
3. **EXTRACT** — For each new dispatch pattern, extract candidate `{trigger, action, confidence: 0.0, samples: 0, successes: 0, failures: 0}`. Initial confidence is 0.0 — RECALIBRATE raises it from real outcomes.
4. **SCOPE** — Tag each new empirical instinct with scope/stacks/projects frontmatter
5. **LINK** — Create wikilinks between related instincts + knowledge nodes. ALSO detect cross-god dispatch chains with high success rates (≥0.85 over ≥10 samples) and write pattern files to `05_Auto_Learning/patterns/`.
6. **RECALIBRATE** (replaces DECAY) — For each empirical instinct, read all `dispatch_outcome` events from `live.jsonl` matching its `instinct_id` or `trigger`. Update `successes`/`failures`/`samples`/`last_used`. Compute `confidence = clamp(0.0, 0.95, success_rate * sqrt(samples) / (1 + sqrt(samples)) - time_decay)`.
7. **PRUNE** — Archive instincts with `confidence < 0.3` after recalibration OR `last_used > 180 days`. Never prune seed instincts.

Compact-brain button adds: **COMPLETE ALIASES** + **MERGE DUPLICATES** (deep compaction).

## v3.0 Capture Pipeline

Every god → ECC dispatch produces this event shape in `06_Activity_Feed/live.jsonl`:

```json
{
  "ts": "2026-07-17T10:30:00Z",
  "god": "hephaestus",
  "action": "dispatch_outcome",
  "task_signature": "rust build error: E0277 trait bound not satisfied",
  "demigod": "build-resolver",
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

The `tool.execute.after` hook writes this event when a dispatch is finalized (active agent changes, or session.idle). The hook also applies the immediate failure penalty (`confidence -= 0.3`) for short-circuited dispatches that fail.

---

## v0.0.1 Verification Sampling Implementation

> This section documents the IMPLEMENTATION of the verification sampling
> rule, which was previously documented but not implemented in v3.0.

### Implementation

The verification sampling rule ("1-in-10 short-circuits are randomly forced
to re-deliberate") is now implemented in `olympus-hooks.ts` with the
following design:

**Module:** `.opencode/olympus/lib/verification-sampling-state.ts`

**State file:** `~/.olympus/verification-sampling-state.json`

**Hook integration:**

1. **`tool.execute.after` (olympus-shortcircuit block):**
   When a god calls `olympus-shortcircuit`, the hook computes a
   deterministic hash of the dispatch ID (`input.callID`). If
   `hash % 10 === 0`, the dispatch is flagged for forced re-deliberation:
   - The instinct is marked via `markForcedRedeliberation(dispatchId, instinctId, god, originalAgent)`
   - A `verification_sample` event is emitted to the activity feed
   - The god's prompt instructs it to check this state before dispatching —
     if the instinct is flagged, the god skips the short-circuit and
     deliberates normally

2. **`tool.execute.before` (agent-transition block):**
   When the re-deliberated dispatch completes (agent transition or
   `session.idle`), the hook checks if the instinct was force-re-deliberated
   via `checkForcedRedeliberation(instinctId)`. If yes:
   - Records the outcome via `recordRedeliberationOutcome(instinctId, pickedDifferentAgent, succeeded)`
   - If the re-deliberation picked a DIFFERENT agent AND succeeded, applies
     the 0.15 drift penalty via `penalizeInstinct(instinctId, god, 0.15)`
   - All wrapped in try/catch — never throws

### Design decisions

#### Deterministic PRNG (not `Math.random`)

The spec showed `Math.random() < 0.1`. The implementation uses a
deterministic hash of the dispatch ID instead.

**Rationale:** Reproducible. The same dispatch always gets the same verdict,
which is critical for debugging. Statistically equivalent over a large
number of dispatches.

#### Softer penalty (0.15, not 0.3)

The standard failure penalty is 0.3. The drift penalty is 0.15 — softer.

**Rationale:** The original instinct may still be valid — the re-deliberation
just found a better fit for this specific case. A 0.3 penalty would be too
aggressive. 0.15 is enough to gradually lower the instinct's confidence if
the drift is consistent (over ~5-6 drift penalties, the instinct drops
below the 0.85 short-circuit threshold and stops being recommended).

#### Persistent state (not in-memory)

State is persisted to `~/.olympus/verification-sampling-state.json`.

**Rationale:** The re-deliberation happens in a DIFFERENT agent step than
the original short-circuit. The hook needs to correlate the two steps —
persistent state is the cleanest way. The state file is also useful for
the brain-stats API (verification sampling stats are surfaced in the
dashboard).

#### No new `penalizeInstinctPartial` function

The existing `penalizeInstinct` function already accepts a `penalty`
argument with a default of 0.3. The implementation just calls it with 0.15
for the drift penalty. No new function needed.

### Module API

```typescript
// Constants
export const SAMPLE_RATIO = 10;              // 1-in-10
export const VERIFICATION_DRIFT_PENALTY = 0.15;

// Functions
shouldForceRedeliberation(dispatchId: string): boolean
markForcedRedeliberation(dispatchId: string, instinctId: string, god: string, originalAgent: string): void
checkForcedRedeliberation(instinctId: string): ForcedRedeliberationEntry | null
recordRedeliberationOutcome(instinctId: string, pickedDifferentAgent: boolean, succeeded: boolean): { applyDriftPenalty: boolean; god: string | null }
getVerificationStats(): { total_forced: number; total_drift_penalties: number; in_progress_count: number }
```

### Stats

The `getVerificationStats()` function returns:
- `total_forced` — total number of forced re-deliberations (cumulative)
- `total_drift_penalties` — total number of drift penalties applied (cumulative)
- `in_progress_count` — number of currently-in-progress forced re-deliberations

These stats are surfaced in the brain-stats API and the cost dashboard.
