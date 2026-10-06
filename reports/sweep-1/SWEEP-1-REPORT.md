# MADRUGA-SWEEP-1 — THE LEDGER NIGHT — FINAL REPORT

**Branch:** `night/sweep-1` from main @ `aa16208`. **Commits:** `8631f0c` (S1) + `c220dcd` (S1 completion) + `5cb2db7` (S2+S3) + `97d0e90` (S4) + `f382455` (registers/report) + this report. **R4:** entry snapshot `5d1d5441…` (the standing baseline), cp-restored at close, byte-verified.

## ENTRY (E1–E4, all VERIFIED)
E1: main == origin/main == `aa16208` (log -4 = aa16208/1de784f/269c5da/9e0a7d3); only main + the 5 dependabot remotes. E1b: the live sha `5d1d5441…` snapshotted. E2: guard BOTH surfaces GREEN exit 0 (live 8/8 + generator 16/16); live glm-5.2 = 0. E3: #76 OPEN ×4, #77 OPEN; the release object exists. E4: battery spot green + tsc 0.

## PHASE 2 — AN6 ✅ (capture first, clean second)
`git clean -nd` verbatim listed **FIVE** paths — the three expected (`docs/superpowers/`, `public/landing/`, `testimonial-section.html`) + **two unexpected: `docs/callimachus/` + `src/app/api/olympus/providers/keys/` — BOTH EMPTY DIRS (zero files, July dates — pre-campaign placeholders)**. Per the card: reported, NOT blind-cleaned (register row AN6-extra; texugo's call). The three known paths: captured (tar + per-file sha256 manifest + listing + du — `reports/sweep-1/an6-capture/`) then removed. Done-condition: `git clean -nd` shows only the 2 empty dirs; status shows only ` M opencode.json` ✓.

## PHASE 3 — the debt sweep ✅
- **S1 (AN5) ✓ — with an honest 2-pass:** pass 1 removed the groq block but missed the namespaced plain-nano key (`nvidia/nemotron-3-nano-30b-a3b` — the provider-block keys are namespaced); pass 2 (commit `c220dcd`) removed it. Tracked now 10 lanes, guard green; live restored via cp from the ENTRY snapshot (never stash-pop) — 8/8 re-verified. Tracked pre/post: groq block + 1 nvidia lane gone (10 deletions + 6 deletions).
- **S2 (AN2) ✓ (R12):** the static-map dead pin (callimachus's plain-nano) fixed across the canonical (model-strategies.ts:422 ×3 — the sync checker demanded the canonical first), the generator god map (apply-strategy.js:326), the hooks (:511), the settings-dialog (:242/:372); the stale "GLM-5.2 (best coding)" string (:425) → GLM-5.3 (the GO/Zen strings stay — alive providers, out of scope). **check-strategy-sync 9/9**; **dist rebuilt — the omni lane present, the exact plain-nano grep-zero**.
- **S3 (AN3) ✓:** the refresh script's inert dead-pin override removed; OUTPUT_CAP 2048 → 16384 with the doctrine comments. `node --check` green.
- **S4 (N37) ✓ CLOSED, red-first hermetic:** apply-1 (changes>0) → no marker; apply-2 (no-op) → **`noOp: true`** + the guard-pointer note verbatim. The real state never touched (temp OLYMPUS_HOME/ROOT).
- **S5 (AN1, stretch): NOT STARTED** — the window prioritized the must-ship + the diagnostic; the row stands (the lane-sight slash filter remains a registered stretch).
- **S6 (AN4) ✓:** the errata line under tonight's CHANGELOG entry (17/17 → the real 16/16, pointing at N35).
- **Phase 3 done-condition:** guard GREEN on live AND tracked ✓ · sync 9/9 ✓ · dist grep ✓ · tsc 0 ✓ · battery spot green ✓.

## PHASE 4 — N39: **PINNED** ✅ (the night's headline)
The diagnostic lane (`~/olympus-bench/sweep-1/projects/aurora-b`, hermetic, the live never touched): **Shape B — the skills-trimmed lane** (olympus-skill-registry + olympus-dynamic-context removed from the LANE config copy, 8→6 plugins; the skill tool loaded 1 skill vs the control's 4). Result: **22 step-finishes ALL `reason:'tool-calls'` — ZERO unknown-deaths, ZERO length-cuts — and THE EXIT GATE ALL-7 GREEN, FIRST-TRY** (lockfile, npm ci, build, dev+curl-200, symlinks, imports-deps, composition — verbatim). Swept BEFORE any cleanup (the AN7 law held). Verdict case (a): the mechanism is **pinned to the skill-load storm** (the R2 control's ~31.8k-token skill-dump step vs B's clean 22). The KIT §3 watch extended with the re-try shape. The transcript shipped (`reports/sweep-1/n39/shape-b-transcript.jsonl`, 87 lines).

## PHASE 5 — CLOSE-OUT ✅
CHANGELOG under the single `[Unreleased]` (verified one stands) · registers: SWEEP-1, N39 (pinned), AN6-extra · #76 material-evidence comment (`6006718365`) — **NO close** (the UAT is texugo's call) · battery: agreement-metric ✓, dispatch-spine 27/27 ✓, symphony-cable 11/11 ✓, free-lane-generator 22/22 ✓, budget-guard both-surfaces ✓, tsc 0.

## Taxonomy check
No issues created/closed (the mission's hard out-of-scope); #76 commented with evidence pointers only. Register rows: SWEEP-1, N39-pinned, AN6-extra (+ the AN2/3/4/5/6/7 dispositions inside the SWEEP-1 row). Labels recorded (no creates needed). Dependabot untouched.

## Self-critique (3 weakest)
1. **"The mechanism is pinned"** — n=2 control + n=1 trimmed run; the correlation is strong (31.8k-token dump vs clean completion, same brief/lane/model) but the causal mechanism (stream limit? provider cap? step budget?) is still inferred — the UAT's watch guidance is written for the re-run shape, not a root-cause fix.
2. **The S1 namespaced miss** — the first pass removed only groq and committed; the guard's 11-lane count caught it immediately (the guard earned its keep again), but the 2-commit S1 is the honest cost.
3. **S5 not started** — the stretch was correctly deprioritized for the diagnostic, but the lane-sight slash-filter row stays open into the next night.

## STATE AT END
- Frontier: main @ (this merge). Battery: 19 (+ the S4 no-op marker proven; the sweep script shipped since R2).
- The repo is clean for the tag: AN6 residue gone (the 2 empty pre-campaign dirs remain, texugo's call); the tracked config folded; every dead pin gone from every surface; sync 9/9; guard both-surfaces green.
- **N39: pinned + the mitigation proven** (the trimmed-lane re-run shape in the KIT §3).
- #76: the material live evidence posted (a full kit, gate all-7, zero cuts — under the sized caps); the closure is texugo's UAT call.
- Next: **texugo's MANUAL UAT** (the KIT §0–§4, execution-revised + diagnostic-extended) → v0.0.3 → cert night (N10) → MADRUGA-4. The five decision requests staged untouched.

## `git status --porcelain` (verbatim, at close)
```
 M opencode.json
```
