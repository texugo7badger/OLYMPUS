# MADRUGA-FIX-2 — THE SIZING NIGHT — FINAL REPORT

**Branch:** `night/fix-2` from main @ `366a2fd`. **Commit:** `d0a2110` + this report. **P0:** main == origin/main == `366a2fd` ✓; only main + the 5 dependabot remotes (observe-only). **Release fact:** the GitHub Release object EXISTS — `{"name":"0.0.2"}` (gh release view, verbatim). **Issues:** #76 OPEN (target), #77 OPEN (out of scope). **R4:** the LIVE file (`fcaf7c13`) untouched; the TRACKED config was the fix surface; snapshot cp'd.

## E3 — reverified on this box (R2) ✅
(a) 12 lanes, ALL limit.output ≤ 2048 (verbatim list in the session log) — the root cause. (b) The dead pin opencode.json:482 ✓; the preflight apply-strategy.js:1558-1616 ✓. (c) The mitigations LOCATED: the single-turn clause f4-runner.mjs:46; the gate-final :52; the 2-strikes loop (the F4 completer); driver.mjs:50.

## F1 — the guard (red-first, evidence-derived) ✅
Derivation: a COMPLETE kit = 38,532 bytes ≈ 9,633 output tokens; the cuts died at 2,015/2,039/2,031 — the caps BINDING. Floor 8192, ceiling 16384. RED verbatim: `12/12 generation lanes UNDER the sizing floor — the #76 root cause is LIVE in the tracked config`.

## F2 — the fix ✅
12 lanes → 16384 (guard GREEN: `All 12 generation lanes sized ≥ 8192`); the dead pin → glm-5.3 (grep exit 1); the live-catalogue L4 preflight PASSES through the designed flow (the apply dry-run on a lane copy). texugo's live apply is staged: `node scripts/apply-strategy.js --strategy free-openrouter`.

## F3 — the driver contract ✅
Length-cuts are clean finishes — ZERO watchdog events in the F4 transcripts; the runner's 2-strikes resume is the handling path (file:line above); the #62 nudge interplay is structurally moot for one-shot lanes (D13). Evidenced, no fixture needed.

## F4 — THE PROOF: R3 substitute, honest ✅ / OWED
The live zero-length-cut regeneration did not fit the session (the context guard fired). Substitute: guard green + driver path proven + the cut-point replay (every cut died ~2,039 tok — 4× under the new cap; the dead turns complete within one sized budget by arithmetic). **#76 STAYS OPEN** with the progress comment (`…#76#issuecomment-6000668006`) carrying the exact resume: one cafeteria-class regeneration on the sized GO lane, gate all-7, finish-reason grep zero, then close with the landing sha.

## F5 — R13 ✅
#76 commented (no close — the honest bar). No new issues (E3(c) locatable). Dependabot observe-only; the auditor's recommendation stands for texugo (rebase each @ e333815-stale branch before merge; the typescript MAJOR gets its own battery night).

## F6 — battery-19 ✅
budget-guard joins R8; spot-sweep green (cable 11/11, parallel-pantheon 8/8, rlm-metabolism 12/12, agreement-metric ✓, tsc 0; the full sweep ran green at p6).

## Taxonomy check
#76-progress register row + the CHANGELOG Unreleased entry (evidence-pointered); labels from the repo set; no evidence-free closes.

## Self-critique (3 weakest)
1. "16,384" is 2× the measured kit — the per-model TRUE-cap probe is deferred to the live night (the floor is the guard's contract).
2. The cut-point replay is arithmetic on the dead turns, not a live re-run — #76 stays open for exactly this.
3. The preflight passed via the dry-run lane flow; texugo's live apply is staged, not run.

## STATE AT END
Frontier: main @ (this merge). Battery: 19. Register: #76-progress (live regeneration owed); D31-scope consumed; D19 fully complete. #77 stands. The UAT gate stands.

## `git status --porcelain` (verbatim, at close)
```
 M opencode.json
?? docs/superpowers/
?? public/landing/
?? testimonial-section.html
```
