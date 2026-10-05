# MADRUGA-UAT-R1·R2 — THE DRESS REHEARSAL, ROUND 2 — FINAL REPORT

**Branch:** `night/uat-r1-r2` from main @ `1de784f`. **R4:** entry snapshot `5d1d5441…` (the moved baseline, N32 — the curative apply changed the live file; expected). **Verdict: the convergence signal MET and re-verified; the rehearsal body EXECUTED for real; the #76 bar honestly NOT met (a new class found); the must-ship set shipped.**

## ENTRY (E1–E4, all VERIFIED)
E1: main == origin/main == `1de784f` (log -4 = 1de784f/269c5da/9e0a7d3/d0a2110); only main + the 5 dependabot remotes ✓. E1b: the live sha `5d1d5441…` cp-snapshotted (the new standing baseline) ✓. E2: **guard BOTH surfaces GREEN, exit 0** (live 8/8 + generator 16/16) + `grep -c glm-5.2 opencode.json` = 0 ✓ (rev 2.3's reconciled 8/8 — NOT a regression). E3: #76 OPEN ×3 comments; #77 OPEN untouched; the release object exists ✓. E4: agreement-metric ✓ dispatch-spine 27/27 ✓ tsc 0 ✓.

## PHASE 2 — the build (2-strikes, R1 BLOCKED — the honest core)
The lane: `~/olympus-bench/uat-r1/projects/aurora-studio` — GO apply (128 agents, the full pantheon loaded; every free-provider lane 16384, the F3/F3b work visible). The exact invocation recorded → **`reports/uat-r1/SPAWN-INVOCATION.sh`** (N34). Strike 1 (283s): the model chose plain HTML per the round-1 brief → the gate correctly refused (no lockfile, no app/page.tsx) — **FINDING R2-F1: the brief and the gate disagree structurally**; corrected in the KIT + the strike-2 prompt. Strike 2 (607s): the turn loaded 4 skills (one step: **in/out 53299/31776**), one read, one bash — then **`reason: 'unknown'`, in/out 0/0** — turn-death before writing. **2-strikes → BLOCKED.** Both transcripts verbatim in the session log.

## PHASE 3 — the #76 sweep (must-ship, honest)
`length-cut-sweep.mjs` shipped; `#76-sweep.md` written. **ZERO length cuts** in both strikes (the sized budget held everywhere exercised — including the 31,776-token skill step). **The closure bar NOT met** (no full kit live) → **#76 STAYS OPEN** with the sweep evidence (comment `6004400948`). **N39 registered**: the skill-storm turn-death — a class DISTINCT from #76's (unknown, not length).

## PHASE 4 — loud-dropped (R3)
No built page → nothing to serve; the context guard prioritized the must-ship set. Registered; the live rung inherits to the UAT (his real click) — unchanged from the KIT's plan.

## PHASE 5 — the KIT revised by execution ✅
3 `[rev: executed R2]` marks: §1 the brief-gate mismatch corrected (Next-shaped scaffold — or a static-HTML gate mode, texugo's call); §2 the N34 single-invocation script; §3 the unknown-death watch added to the checklist. The four DECISION REQUESTS untouched.

## Taxonomy check
#76 commented (evidence pointers; no close — the bar). Registers: UAT-R1-R2, N39. Labels from the repo set (no new issues needed). Dependabot untouched. One `[Unreleased]` header verified; the entry added under it.

## Self-critique (3 weakest)
1. **"The rehearsal body executed"** — 2 real strikes with real transcripts, but no full kit: the largest parallel load (10-god live fan-out) was NOT reached (the 2-strike block hit first) — texugo's UAT remains the true full-load test.
2. **The N39 diagnosis is observational** — the skill-storm correlation is from 2 samples; the mechanism (stream limit? step cap?) needs a dedicated lane.
3. **Strike 1's transcript was deleted before strike 2** — its finish reasons live in the session log verbatim (tool-calls ×2 + unknown ×1), not in a file; the sweep file covers strike 2 only. Disclosed.

## STATE AT END
- Frontier: main @ (this merge). Battery: 19 + the sweep script. New R4 baseline: **`5d1d5441…`** (N32).
- #76: OPEN (zero-cut proof strong; the live clean-kit run still owed). N39: the re-try shape (a skills-trimmed lane or the UAT itself). The KIT: execution-revised, texugo's to run.
- The UAT inheritance: the Next-shape brief (or the gate-mode call), the unknown-death watch, the SPAWN-INVOCATION.sh.

## `git status --porcelain` (verbatim, at close)
```
 M opencode.json
?? docs/superpowers/
?? public/landing/
?? testimonial-section.html
```
