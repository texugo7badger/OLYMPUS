# THE N39 VERDICT — the skill-storm mechanism PINNED (SWEEP-1 Phase 4)

## The diagnostic design
- Control (the R2 shape, n=2 from UAT-R1·R2): the GO lane with ALL 8 plugins — both turns loaded 4 skills in one step (the largest: **31,776 output tokens** on skill dumps), then died `reason:'unknown'` (in/out 0/0) before writing files. Verbatim in the R2 report.
- **Shape B (the re-try shape, this lane):** the SAME lane shape with the two skill-data plugins trimmed from the lane config copy (`olympus-skill-registry` + `olympus-dynamic-context` removed from the plugin array — 8 → 6; the lane config copy, never the live). The skill tool loaded **1 skill** (vs 4) — no dump storm.

## The result (the verdict case (a): B survives where A dies)
- **Shape B COMPLETED**: 22 step-finishes, **ALL reason:'tool-calls'** — **ZERO unknown-deaths, ZERO length-cuts**. The biggest output step: 21,456 tok (a file-write step, clean). 32 tool calls: 12 writes + 4 edits + 13 bash — a full kit.
- **THE EXIT GATE: ALL 7 GREEN, FIRST-TRY, VERBATIM**: lockfile ✓ npm-ci ✓ build ✓ dev-curl-200 ✓ symlinks ✓ imports-deps ✓ composition ✓ — **verdict: PASS**.
- Transcript: `reports/sweep-1/n39/shape-b-transcript.jsonl` (22 lines, swept BEFORE any cleanup per the AN7 law; the sweep output verbatim in the session log).

## The conclusion
The mechanism is **pinned to the skill-load storm**: the 4-skill dump (~31.8k tokens in one step) is what killed the R2 turns (reason:'unknown'); with the skill-data plugins trimmed, the same brief, the same lane shape, the same model (GO glm-5.3-flash) completes end-to-end and passes the gate first-try. The KIT §3 watch line is extended: `unknown-death → re-run the lane with the skill-data plugins trimmed (evidence: reports/sweep-1/n39/N39-VERDICT.md)`.

## The #76-relevant consequence (material; NOT closing tonight — the bar is texugo's)
Shape B IS a live full-kit generation under the sized 16384 caps with **zero length-cuts** — the #76 resume-instruction bar's shape, executed live. The evidence is posted to #76 (comment, no close — the UAT is texugo's call per the mission's out-of-scope rule).
