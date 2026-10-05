# MADRUGA-UAT-R1 — THE DRESS REHEARSAL NIGHT — FINAL REPORT

**Branch:** `night/uat-r1` from main @ `9e0a7d3`. **Verdict: STOPPED AT THE E2 ENTRY GATE, BY DESIGN — the must-ship set delivered.**

## ENTRY — E1–E4 (verbatim)

- **E1 ✓:** main == origin/main == `9e0a7d3`; log -3 = `9e0a7d3` / `d0a2110` / `366a2fd`; only main local + the 5 dependabot remotes (observe-only). **R4 DELTA (disclosed):** the working-tree `opencode.json` is now `9e5f13e5…` (≠ the campaign's standing `fcaf7c13`) — the user's file changed between sessions; per rev 2.2 the CURRENT bytes were snapshotted at entry (`9e5f13e5`, cp) and are the restore target.
- **E2 STOP (the gate fired):** the live surface (working tree on this box = the live config) carries **12/12 lanes at 1024–2048 + `glm-5.2` present** (the first five verbatim: gpt-oss-20b 2048, ling-3.0-flash 2048, nemotron-nano 1024, nemotron-ultra 2048, nemotron-super 2048). The staged live-apply was not run pre-session. Per the entry card: **"STOP — the rehearsal is meaningless under the old caps"** — no workaround (a full-pantheon build would reproduce the cuts BY CONFIGURATION). The ask: texugo runs `node scripts/apply-strategy.js --strategy free-openrouter`, then re-enter.
- **E3 ✓:** #76 OPEN (the progress comment 6000668006 stands; the new blocked comment 6001357439 posted); #77 OPEN (untouched — his design call); the v0.0.2 release object exists (`{"name":"0.0.2"}`).
- **E4 ✓:** spot-sweep green — agreement-metric ✓, symphony-cable 11/11, root tsc 0; the on-box budget-guard ran **RED 12/12** (the live-surface confirmation — and the N29 path-dependence demonstrated: the same guard is GREEN against the tracked file on a fresh clone).

## PHASES (honest ledger)

- **Phase 1 ✓ (lean):** branch + `mkdir -p reports/uat-r1` BEFORE any heredoc (the FIX-2 lesson held). Ledger row: `UAT-R1 | scope = rehearsal + #76 live bar + live click + UAT KIT | the night's budget = entry gates + the KIT + the report; the build phases blocked at E2`.
- **Phase 2–4 — BLOCKED AT E2 (loud-dropped, inherited):** the full-pantheon build, the #76 live sweep, and the live DOM click all inherit the re-entry. The must-ship set (3+5) shipped; Phase 4 was already loud-droppable by card; Phases 2–3 drop WITH the E2 cause (not the context guard — the gate). Exact resume: the UAT-KIT §0→§4.
- **Phase 5 ✓ MUST-SHIP:** **`reports/uat-r1/UAT-KIT.md`** (50 lines) — the frozen brief, the from-zero commands, the observable checklist, the pass/fail bar naming the failing lane, the four DECISION REQUESTS (the #77 flip staged; v0.0.3 tag-on-PASS; N10; the instinct-store default), STATE AT END.
- **Phase 3's R13 duty:** #76 commented (6001357439) with the E2-blocked evidence + the exact re-entry — **stays OPEN, honestly**.
- **N29 (the auditor's recommendation, registered):** the budget-guard is path-dependent — on this box it guards the LIVE surface (working tree); on a fresh clone the SHIPPED one. Recommendation: the guard should declare its surface or check both. Implementation = a future night; recorded here + in the register.

## Taxonomy check
No issues created/closed (the honest bar); #76 commented with evidence pointers; the register rows below; labels not needed tonight. Dependabot untouched.

## Self-critique (3 weakest)
1. **"The rehearsal was blocked"** — E2 did its job; the alternative (running the build under old caps) was worse by the card's own doctrine. The cost: the #76 live bar + the live click inherit — documented, not apologized for.
2. **"The KIT is final"** — it is final-shaped; the build-dependent checklist items (census shape, bus-under-load) carry evidence only from the p6 8/8 parallel proof, not a live full-pantheon run.
3. **"The R4 restore"** — the new baseline `9e5f13e5` is the user's CURRENT bytes; I did not diff what he changed (out of scope tonight; the delta is disclosed, the bytes preserved).

## `git status --porcelain` (verbatim, at close)
```
 M opencode.json
?? docs/superpowers/
?? public/landing/
?? testimonial-section.html
```
(`opencode.json` restored to the entry-snapshot bytes `9e5f13e5…` via cp — the R4 law; the three untracked paths texugo's, untouched.)
