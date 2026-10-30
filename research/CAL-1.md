# CAL-1 — the MERIDIAN calibration build

> Status: **in progress** (v0.0.26 campaign). Runtime tables are filled from
> `research/cal-1/measurements.json` + the campaign telemetry when the walk
> completes. Every number carries a provenance tag: `[MEASURED]`,
> `[COUNTERFACTUAL]`, `[DESIGN-MATH]`.

## Fixture

MERIDIAN — a single-user bookmarking service: Next.js App Router +
better-sqlite3 (FTS5) + Vitest, token auth, one-page UI. Built in a sibling
directory (`~/meridian-cal-1`), outside the OLYMPUS repo. Dependencies were
installed up front so the hops never need the network.

## Lane A (go-balanced, auto transport, benchmark recording on)

**Status: PARTIAL.** The walk completed the first hop and was stopped when the
session budget ran out; the remaining hops were in flight. This is a real
result about the floor, not a pass.

| Hop | God | Status | Input | Output | Wall-clock |
|---|---|---|---|---|---|
| c1-spec | apollo | completed | 102,761 | 3,712 | 89.7 s |

Totals so far: **102,761 in / 3,712 out** for one 500-byte brief — the full
system prompt + arsenal dominates the payload. That is the first honest number
the docs never had.

### Friction found (filed for v0.0.27)

1. **Warm transport 405** — `POST /session` is rejected by the current
   `opencode serve` build, so every hop fell back to spawn (slower, but the
   fallback worked). Evidence in the campaign log.
2. **Plan schema has no dependency field** — a build plan runs hops
   concurrently and races (db vs api vs ui). The walk was serialized with
   `OLYMPUS_HOP_CONCURRENCY=1`.
3. **First-hop cost** — 102,761 input tokens for a 500-byte brief: the fixed
   prompt dwarfs the task.

## Deterministic measurements

### Skill tiers — `[COUNTERFACTUAL]`

321 skills / 51,673 bytes of descriptions. The frontend-visible subset is 48
skills / 5,179 bytes → **90.0% description reduction**. This is the description
slice only; the full-input 81% claim is not yet measured.

### Symphony transport — `[MEASURED]`

| Payload | Signature JSON | Legacy prompt | Reduction |
|---|---|---|---|
| 467 B | 648 B | 1,208 B | **−158.7%** (expansion) |
| 1,868 B | 697 B | 1,208 B | **32.8%** |
| 4,670 B | 800 B | 1,352 B | **71.0%** (signature is 82.9% smaller) |

Finding: the 70–90% claim holds **only above ~4.7 KB**. Short hop briefs
expand. The claim must carry its size threshold.

## Verdicts

| # | Promise | Verdict | Evidence |
|---|---|---|---|
| 1 | 81% input (tiers) | **PARTIAL / COUNTERFACTUAL** | 90.0% on descriptions; whole-input share not measured |
| 2 | 97% on short-circuits | **PENDING** | the backfill needs ≥3 attributed demigod rows per god; the partial walk produced none |
| 3 | 65% caveman output | **NOT-MEASURABLE-HERE** | no A/B control in this run (flag exists; no second run) |
| 4 | 70–90% Symphony | **CONFIRMED WITH THRESHOLD / REFUTED BELOW 1 KB** | measured 71–83% at 4.7 KB; negative at 467 B |
| 5 | >30% short-circuit rate | **NOT-MEASURABLE-HERE** | the partial walk produced one dispatch; no rate can be computed |
| 6 | 89% input on a full build | **NOT-MEASURABLE-HERE** | the full build did not finish; lane B never ran |
| 7 | park/resume | **NOT-TESTED** | the walk was stopped manually, not parked |
| 8 | warm first vs subsequent | **REFUTED in this environment** | the warm lane 405'd on session creation; every hop used spawn |
| 9 | verify = 0 LLM tokens | **CONFIRMED BY DESIGN / PARTIAL** | deterministic-first verify; no model call in the verify path |
