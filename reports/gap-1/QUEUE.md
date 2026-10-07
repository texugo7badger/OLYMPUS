# MADRUGA-GAP-1 — CAMPAIGN QUEUE

The truth between sessions. Every session re-derives against this file BEFORE
work; every close updates it. No session trusts a report header over it.

## Frontier record

| Marker | Value |
|---|---|
| Campaign entry (S1) | `main @ a73dca6` (SWEEP-1 close, auditor-verified 2026-10-06) |
| After S1 close | **S1 DONE** — `main @ 68fb8d2` (the ff-merge of `night/gap-1-s1`; pushed, user-verified 2026-10-07) |
| After S2 close | **SUPERSEDED by S2R (R14).** The original S2 merged LOCALLY only on a credential-less container box; the box was RESET before the user could apply the bundle substitute — commits `d280d3b`/`2193ac4` and the bundle are LOST, origin/main never moved, the lost shas are NEVER evidence. See the S2R rows below. |
| After S2R close | **S2R DONE** — frontier = the S2R close-out commit (the ff-merge of `night/gap-1-s2r` over `68fb8d2`; the pair commit is `db47ad5`; sha re-derived at S3 entry per protocol) |
| After S3 close | **S3 DONE** — frontier = the S3 close-out commit (the ff-merge of `night/gap-1-s3`; the pair: `e629cfa` the catalogue refresh + `81828b2` the #67 scaffold; sha re-derived at S4 entry per protocol) |
| After S4 close | (pending) |

## Session status

| Session | Scope | Status | Branch | Merge sha |
|---|---|---|---|---|
| S1 THE RESET | branch-truth + AN10/AN13 + N38 + #70 + register reconciliation | **DONE** (all must-ship: A1–A7 + close-out; #70 closed post-merge; AN10 refuted-alive-kept) | `night/gap-1-s1` (merged + deleted) | `68fb8d2` |
| S2 THE PULSE | #69 one-shot telemetry + #77 root heartbeat | **LOST (R14)** — ran on a credential-less container box; merged locally, bundle delivered, box reset before apply; origin never moved; #69/#77 never closed | `night/gap-1-s2` (never landed) | (lost — NEVER evidence) |
| **S2R THE PULSE, REDO** | the same #69/#77 pair, re-implemented to the recovered spec | **DONE** (red-first 7 FAILs → green 17/17; R12 dist greps; battery-21 + tsc 0; pushed; #69 + #77 closed post-merge) | `night/gap-1-s2r` (merged + deleted) | `5ee2933` (re-derived) |
| S3 THE FOUNDRY | #67 Apollo scaffold + catalogue refresh (AN11/AN12) | **DONE** (live lists recorded verbatim FIRST; AN11+AN12 dead @ e629cfa; #67 scaffold law @ 81828b2 + battery suite #22 17/17 red-first; stash-dance for the tracked inline; battery-22 + tsc 0) | `night/gap-1-s3` (merged + deleted) | the close-out commit over `e629cfa`/`81828b2` (re-derive at S4 E1) |
| S4 THE FUTURE LEDGER | 15 issues filed + ROADMAP + register wiring | PENDING — **next** | `night/gap-1-s4` | — |

## Session ledger (R7 — every row logged immediately)

| Row | Session | Entry |
|---|---|---|
| GAP-1-S1 | S1 | scope = branch-truth + AN10/AN13 + N38 + #70 + register reconciliation. Budget split declared: E-intake (battery-19 sweep + guard) done; A1–A7 code phases; close-out (merge + #70 close). Evidence dir: `reports/gap-1/s1/`. R4 entry snapshot sha `5d1d544100a125c9fcd9bd8e1b7c382f418f8bf2d7f435b7a99671392ac26259`. |
| GAP-1-S1-A3 | S1 | **AN10 REFUTED — lane ALIVE, NOT removed.** Auditor claimed `openrouter/nvidia/nemotron-3.5-lightning:free` dead residue (one-line removal). Verified ALIVE on 3 surfaces (2026-10-06): (1) live OpenRouter list via refresh-script fetch path — exact id served, pricing 0/0, ctx 1M, max_completion 65536; (2) cached strategy top-10 (`~/.olympus/free-models.json` 2026-10-03) — ranked #2; (3) opencode binary probe `opencode models openrouter` — both lightning ids served. Also pinned by 6 gods in tracked config (not inert). Card's ALIVE branch taken: no removal, no stash-dance. Tracked stays 10/10, live 8/8+16/16. R7 discovery: the register row needs the refutation verdict (done in A7); the "tracked vs generator-table divergence" is the already-filed N29 class, NOT a dead id. |
| GAP-1-S2-LOST | S2 | **THE LOST-WORK RECORD (R14, auditor-verified 2026-10-07).** The original S2 ran on a credential-less container box: its two commits (`d280d3b` the fix + `2193ac4` the close-out) merged LOCALLY only; the honest bundle substitute (git bundle + RESUME-PUSH.md) was delivered — but the box was RESET before the user could apply it. The commits and the bundle are LOST; origin/main never moved; NOTHING on GitHub regressed (S1 intact; #70 closed; #69/#77 still open, their closes were prepared but never executed). LAW: the lost shas are NEVER evidence; redone work earns NEW shas and NEW evidence, and the report says plainly: "the first attempt was lost; this is the redo." |
| GAP-1-S2R | S2R | scope = the #69/#77 pulse pair re-landed from the recovered spec. R4 entry snapshot sha `5d1d5441…` (the standing baseline; restored at close). RED verbatim: one-shot `rowsTotal: 0, costRows: 2` (the D8 blindness reproduced) + root `hooks.event is not a function` (the live evidence's twin) — 7 FAILs / 17 checked, exit 1 (`reports/gap-1/s2r/B1B2R-RED-verbatim.txt`). GREEN 17/17 exit 0 (`B1B2R-GREEN-verbatim.txt`). Pair commit `db47ad5` (fix + suite #21, ONE commit). R12: overlay tsc + postcompile exit 0; dist greps — activityAgent ×5, OLYMPUS_ROOT_SESSION ×4, buildRootSessionHooks ×3, the trio ×2 each, the old gate ABSENT (0); root tsc 0. R8: battery-21 full sweep green. R15: this box HAS credentials — the real push + the R13 closes executed IN-SESSION. |
| GAP-1-S2R-SLIP | S2R | Session-slip disclosed: the pair commit first landed on `main` directly (the night branch was not cut first). Recovered safely WITHOUT touching the working tree: `git checkout -b night/gap-1-s2r` at the commit, then `git update-ref refs/heads/main 68fb8d2` (ref-only move; the live `M opencode.json` untouched, verified). The branch discipline held at close: ONE ff-merge from `night/gap-1-s2r`. Lesson → the branch cut is the FIRST code action, before any commit. |

## Standing facts (re-derived at S1 entry, 2026-10-06)

- E1: main == `a73dca6`; only `main` local + 5 dependabot remotes (observe-only).
- E2: budget-guard exit 0 — live 8/8 + generator 16/16; live `glm-5.2` count 0.
- E3: open issues exactly #67/#69/#70/#76/#77 (#76 ×5 comments).
- E4: battery-19 green (16 script suites + context-distill 4/4 + telemetry-slice
  10/10 via `npx tsx`) + `npx tsc --noEmit` exit 0. NOTE: several suites REQUIRE
  `npx tsx` (plain `node` crashes on `@/lib` imports) — invocation of record.
  **After S1 A4 the battery is 20** (apply-noop joined; 17 script suites).
- D-1: NO version moves until Monday 2026-10-12 (the user's).
- D-2: closes ONLY for #67/#69/#70/#77, post-merge, with evidence. #76 untouched.
- **S1 dispositions (2026-10-06):** #70 CLOSED (8f822fa, post-merge evidence);
  AN10 REFUTED (the lightning lane is ALIVE on all three probe surfaces — no
  removal, the card's ALIVE branch); AN13a CLOSED (battery suite #20, e284dc2);
  N38 MARKED (e8743f2, datum unchanged); AN6-extra RESOLVED (both empty dirs
  disposed); the register reconciled (63 rows; 19 → S4 filing; D28 SPLIT with
  the onChange half uncovered). Live surface: R4-restored + sha-verified
  (5d1d5441…), guard re-green 8/8 + 16/16 post-restore.

## S2R standing facts (re-derived 2026-10-07)

- E1: main == origin/main == `68fb8d2`; only `main` local + 5 dependabot
  remotes (observe-only). **This box has push credentials** (gh authenticated
  texugo7badger; dry-run push green) — R15's preferred path.
- E2: guard exit 0 — live 8/8 + generator 16/16; live `glm-5.2` count 0.
- E3: open issues exactly #67/#69/#76/#77 (#70 closed by S1).
- E4: battery-20 green at entry (17 script suites via `npx tsx` +
  context-distill 4/4 + telemetry-slice 10/10 + tsc 0). **After tonight the
  battery is 21** (telemetry-pulse joined — 18 script suites).
- The battery invocation of record: `npx tsx scripts/<suite>.test.mjs`
  (never bare node — the @/lib imports crash). The `battery` npm script pin
  is a BATT-ENV S4 filing candidate.

## S4 entry gate (updated by S3)

**S4 verifies origin/main == the S3-recorded close sha before cutting
`night/gap-1-s4`.** Re-derive at S4 E1: `git fetch origin && git rev-parse
origin/main` must land at the S3 close (the close-out commit, directly over
`81828b2` "feat(apollo): #67 — the project scaffold law rides the apollo
prompt (GAP-1-S3)" over `e629cfa` "fix(free-tier): the model-catalogue
currency refresh — AN11 + AN12 dead in one stroke (GAP-1-S3)", over
`5ee2933`). Commits ABOVE it = drift = STOP + report. S4's scope: the 15
evidence-pointered issues filed (`gh label list` FIRST — existing labels
only) + any R7 discoveries from S1–S3 (the ledger carries: GO-CARD-PROSE
from S3; BATT-ENV + ROOT-LANE-ADOPT from S2R; the S1 battery-script idea) +
ROADMAP.md extended + register wiring + the campaign report
`reports/gap-1/GAP-1-CAMPAIGN-REPORT.md`. Branch cut FIRST (the S2R lesson).

## S3 standing facts (re-derived 2026-10-07)

- E1: main == origin/main == `5ee2933`; only `main` local + 5 dependabot
  remotes (observe-only). Credentials present (S2R pushed in-session).
- E2: guard exit 0 — live 8/8 + generator 16/16; live `glm-5.2` = 0.
- E3: open issues exactly #67 + #76.
- E4: battery-21 green at entry. **After tonight the battery is 22**
  (apollo-scaffold joined — 19 script suites).
- **The battery invocation of record: `npx tsx scripts/<suite>.test.mjs`.**
- LIVE catalogue verbatims (2026-10-07, the C1 truth): NVIDIA 80 models —
  z-ai family = glm-5.3 + glm-5.3-flash ONLY (glm-5.2 retired from the
  endpoint); OpenRouter 465 — glm-5.2 still served there (the coding-trio
  pin is the NVIDIA id, so the pin moved 5.2 → 5.3; the four code mirrors
  were already 5.3 — FIX-3's work; tonight's residue was AN11 + AN12 +
  TOKEN-ECONOMY + README).
- Tracked opencode.json after S3: glm-5.2 count 0; the apollo inline
  carries the scaffold law (char ~447 of the 1000-char window).
