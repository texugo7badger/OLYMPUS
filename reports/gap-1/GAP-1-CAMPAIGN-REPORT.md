# MADRUGA-GAP-1 — THE CAMPAIGN REPORT
## (four nights, four pushes, five debts paid, nineteen futures filed)

**The campaign:** S1 THE RESET · S2 LOST · S2R THE PULSE REDO · S3 THE
FOUNDRY · S4 THE FUTURE LEDGER. One branch per night, ONE ff-merge each,
pushed in-session every time (R15). The frontier: main == origin/main ==
(the S4 close sha — re-derive from QUEUE.md). The live surface
(`opencode.json`, sha `5d1d5441…`) untouched all campaign — snapshotted,
restored, sha-verified every night; never committed, never stashed over.

## Issues resolved (all closed WITH post-merge evidence)

| Issue | Night | Merge | The evidence |
|---|---|---|---|
| **#70** — opencode-session hardcodes /home/texugo | S1 | `8f822fa` (in the 68fb8d2 push) | the repo root from import.meta.url; 33 PASS / 0 FAIL verbatim; the close comment carries the sha + counts |
| **#69** — live.jsonl blind to one-shot spawns | S2R | `db47ad5` (in the 5ee2933 push) | the activityAgent fallback; RED rowsTotal:0/costRows:2 → GREEN 17/17; telemetry-slice acceptance; R12 dist greps |
| **#77** — the root session runs unmanaged, zero heartbeats | S2R | `db47ad5` (in the 5ee2933 push) | the OLYMPUS_ROOT_SESSION opt-in lane + buildRootSessionHooks; RED 'hooks.event is not a function' → GREEN 17/17; the #25 contract preserved verbatim |
| **#67** — Apollo's project scaffold | S3 | `81828b2` (in the 43b4292 push) | the scaffold law inside the free 1000-char window + the Auto-Creation cross-ref; RED 13 FAILs → GREEN 17/17 (suite #22); the tracked inline refreshed via the stash-dance |

**The S2 LOST-WORK incident (R14), told plainly:** the original S2 ran on a
credential-less container box; its commits (`d280d3b`/`2193ac4`) merged
locally only, the honest bundle substitute was delivered, and the box was
RESET before the user could apply it. The work never reached origin; the
lost shas are named ONLY in the LOST-WORK register rows, never cited as
evidence. S2R re-implemented the pair from the recovered spec — new shas,
fresh RED/GREEN transcripts — and pushed for real.

## Issues filed tonight (the future ledger, 19)

The card's 15 (the auditor's state report) + the campaign's 3 discoveries +
the register's own promised D28-onChange (the +1 beyond the card's 18,
disclosed — the alternative was a register row lying about its target):
**#78** the case-insensitive drift detector · **#79** the live learning
loop · **#80** the guard's surface declaration · **#81** session→god cost
linkage · **#82** whitespace-only text channel · **#83** the sizing matrix
· **#84** instinct RAG · **#85** the who-is-doing-what panel · **#86**
dispatch journal replay (the R14 case study) · **#87** the page-gate ruler
· **#88** the browser-automation inventory · **#89** the host-mode probe
· **#90** sync-map retention · **#91** one-shot retry coverage · **#92**
the CERT-CALLIMACHUS re-try · **#93** the GO/Zen mirror divergence · **#94**
the battery contract · **#95** ROOT-LANE-ADOPT · **#96** the form-level
onChange check. Existing labels only; no close-on-file; the full filing log
(`reports/gap-1/s4/FILING-LOG.md`) records every number + URL + label set.

## The register reconciliation summary (final)

- **60 ISSUES.md data rows** + 8 GAPS + 6 FEAT-IDEAS, all re-derived across
  the campaign (S1 A7's row-by-row pass + the nightly updates).
- **Closed this campaign:** #70/#69/#77/#67 (the tracker, above) + AN11 +
  AN12 + AN13a + N38 + AN6-extra + the two S4 case-shadow rows + the S1
  reconciliation's 15 verdicts (D24-D30 gate-verified, D27's stale row
  reconciled with the landed P-E entry, N37/N39-old/UAT-R1/D31 annotated).
- **Open on the tracker:** **#76 ONLY** (the user's stock-lane UAT bar,
  ×5 comments, never touched) + the 19 new filings.
- **Zero divergence:** every register row's target cell carries its issue
  number or its true state; every URL resolves.

## The catalogue-refresh verdict

The LIVE lists were the only truth, fetched + recorded verbatim each time:
NVIDIA's `/v1/models` (80 models, 2026-10-07) serves the z-ai family as
**glm-5.3 + glm-5.3-flash only** — glm-5.2 is retired from the endpoint.
The four code mirrors were already 5.3 (FIX-3's work — verified, not
assumed); the residue was AN11 (the dead override key + 17 more dead keys,
all removed) + AN12 (the "best coding" prose) + TOKEN-ECONOMY + README —
all cured at S3 (`e629cfa`). The S4 audit then found the case-shadow class
(uppercase GLM-5.2 prose that survived the lowercase grep) — the two
free-surface rows cured at D0 (`c08c7ed`); the broader class is #78's
evidence spine (the detector's bar must be case-insensitive); the GO/Zen
surface's own divergence is filed whole (#93).

## The campaign's own slips, disclosed

1. **The S2R branch-cut slip:** the pair commit first landed on main
   (the branch wasn't cut first). Recovered ref-only via update-ref — the
   live untouched — and the lesson (branch FIRST) is protocol since; S3
   and S4 both held it.
2. **The S3 unicode re-encoding:** my first tracked-inline edit emitted
   raw UTF-8 over the file's `\uXXXX` convention (37-line noise). Caught
   in diff review, redone surgical (1 line). Diff review earned its keep.
3. **The S3 case-shadow note:** the honest S3 grep was lowercase and
   followed verbatim — the uppercase prose survived it. The auditor found
   it; S4's D0 cured the two free-surface rows and filed the class.
4. **The #91 backtick incident:** a filing body lost a phrase to a bash
   command substitution; fixed immediately via body-file edit, verified.
5. **The 19th filing:** one beyond the card's expected 18 — the register's
   own promised D28-onChange filing, honored rather than left dangling.

## The machine's state at campaign close

- **Battery-22** (19 script suites + context-distill + telemetry-slice +
  tsc) — all green at the S4 close; telemetry-pulse 17/17 and
  apollo-scaffold 17/17 (the S2R/S3 certifications) intact.
- **The convergence signal standing:** budget-guard both surfaces exit 0
  (live 8/8 + generator 16/16); live `glm-5.2` = 0; sync 9/9.
- **The catalogue current** on every machine surface; the scaffold law
  rides the apollo prompt inside the free window; the telemetry pair live.
- **Hygiene:** `git clean -nd` empty; ports 3737/3738/3740/3777 free; no
  pidfiles; only `main` local.

## The honest handoff

**The machine is aligned; the gate is the user's.**

1. **The manual UAT** (UAT-KIT §0–§4, `reports/uat-r1/`): from zero,
   "exemplo landingpage", every god and demigod in parallel, the project
   runs first-try and is well-built. If an unknown death appears: re-run
   with skills trimmed (KIT §3). If token cuts: STOP and report (the #76
   bar).
2. Passed → the evidence closes **#76** (the user's hands, or handed to a
   night with the evidence in hand) → **tag v0.0.3 Monday 2026-10-12**.
3. Then: cert night (N10 — the user's top-up decision) → MADRUGA-4, which
   tonight's 19 filings feed.
