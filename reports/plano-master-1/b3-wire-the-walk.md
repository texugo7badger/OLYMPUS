# PLANO-MASTER-1 / B3 — wire-the-walk CURED (RED-first): the plan is walked, the completion line tells the truth

**Closes #117.** The CONTEXT symptom's cure — the architectural task stops dying on paper.

## The RED (the defect named, before the cure)

Four FAILs, verbatim:
- `B3: the post-run walk module exported (src/lib/hop-runtime/post-run.ts)` — **absent — the plan
  is still the turn's deliverable; 19 hops die on paper**
- `B3: the route walks the plan post-run (await maybeWalkThePlan…)` — **the plan is still the
  turn's deliverable — the UAT's 19 hops died on paper**
- `B3: the client renders the walk live (walk_summary + hop events handled)` — **the walk is
  invisible in the terminal**
- `B3: THE INVARIANT — a walked/parked plan NEVER reports the bare "Task completed" census` —
  **the census line still masks the walk's truth**

The live specimen (s0): telemetry = 2 hops attempted, both `parked-dispatch-failed` on
hephaestus's dead deepseek lane, `walker-local.ts` improvised INSIDE the project because the
product had no walk path — then "Task completed. writes 1" (the 1 write WAS the plan file).

## The cure (4 pieces)

1. **`src/lib/hop-runtime/walker.ts`** — the optional `onEvent` narration bridge
   (`HopWalkEvent`: hop_start / hop_done / hop_parked — WHO the god, WHERE the lane, what
   happened). The walker's laws untouched: concurrency ≤ 3, deterministic verify, park +
   resume, telemetry per attempt. The battery fixtures omit the callback — zero effect on
   the existing 46 pins.
2. **`src/lib/hop-runtime/post-run.ts` (NEW)** — `maybeWalkThePlan({slug, laneRoot, send,
   dispatcher?})`: the honest skip when no plan exists (most turns are not planning turns —
   no invented narration); the unparseable/invalid plan = the honest refusal, never a crash
   into the close path; the resume doctrine (`.olympus-hop-state.json` on disk → resume) —
   **the next successful prompt in the project resumes the walk**; the events bridged to the
   SSE stream; and `buildWalkSummaryLine` — the honest completion line:
   - walked: `The plan is walked: N/M hops GREEN — the deliverables are on disk at <lane>.`
   - parked: `Plan parked at hop '<id>' (<reason>) — C/M hops done. RESUME: send any prompt
     in '<slug>' — the walk resumes from disk (.olympus-hop-state.json); nothing is lost.`
   It never says "Task completed" over unwalked hops — that line was the UAT's lie.
3. **`src/app/api/olympus/action/route.ts`** — the post-run block: trigger (unchanged,
   quick) → `await maybeWalkThePlan({slug, laneRoot, send})` → `finish(0)`. The walk runs
   INSIDE the stream — the terminal narrates the hops live while the preview can already be
   up (the trigger fires first). Non-fatal both: a walk failure never breaks the close.
4. **`src/components/olympus/interactive-terminal.tsx`** — the `hop_start`/`hop_done`/
   `hop_parked` events render as live narration; `walk_summary` renders the honest line AND
   sets `runWalkSummary`; the `action_done` census gate: **when the walk's truth rendered,
   the bare "Task completed. Census: …" verdict is suppressed** — the invariant, enforced
   client-side.

## GREEN (the evidence)

- hop-runtime FULL: the 4 new pins + the behavioral fixture — a 2-hop plan where hop-1 GREEN
  and hop-2 dies exhausted → **the park is honest (b3-2, retry-exhausted)**, **the summary
  line names the park + prints the RESUME contract** (and contains no "Task completed"), the
  hops narrated live in the stream; then **the RESUME walk completes 2/2** with the healed
  dispatcher (the state carried on disk); then **the no-plan lane = the honest skip**.
- **Battery 30/30 + tsc 0** with the walk wired (the full sweep).
- R4 untouched; frozen pair zero-diff; 0 CJK.

## What this buys the campaign

- **The CONTEXT symptom dies structurally**: an architectural task is a deterministic spine
  walking ≤16k-token hops; the session never carries the campaign — the disk does. A pool
  burst parks one hop, never a 5-minute monolith.
- **B7's acceptance test is now possible**: Lumina's 19-hop plan gets WALKED by the machine,
  never hand-run.
- **The honest parks** (the E8 window: flash + deepseek dead in the afternoon) ride the
  walker's per-hop retry crescendo + the park line — the user sees exactly where it stopped
  and how to resume.
- **B6's where/who narration has its foundation**: the hop events already carry god + lane.

**Merge trail after this merge: 7 of the 12 cap.** Next at the user's gate: **B4 — dev-server
dignity** (deps before spawn + growing patience; the s0 `next: not found` log is the RED
specimen).
