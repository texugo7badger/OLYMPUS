# OLYMPUS QUEUE — the standing session queue (UAT-FIX-1 arc onward)

The truth between sessions. Every session re-derives against this file BEFORE work; every close updates
it. No session trusts a report header over it. (Supersedes the sealed `reports/gap-1/QUEUE.md` for the
post-campaign arcs; the GAP-1 frontier record there stays sealed as history.)

## Frontier record

| Marker | Value |
|---|---|
| Campaign close (GAP-1-S4) | `main @ 7307530` (the UAT-FIX-1 recon entry — re-derived at every session's E1) |
| R4 live config (never committed) | sha256 `5534ceab…` (31863 bytes) at the UAT-FIX-1 arc entry; snapshot `/tmp/opencode/uat-fix-1/opencode.json.snap`; whatever the live bytes are at any session's step 0 is that session's restore target |

## Session status

| Session | Scope | Status | Branch | Merge sha |
|---|---|---|---|---|
| MADRUGA-UAT-FIX-1 (recon, 2026-10-08 report-day) | the user's UAT defects root-caused (F1 catalog dupe / F2 overload starvation / F3 repo-cwd / F4 → #86 evidence / F5 filed); filings #97–#100; the build plan | **DONE (paper)** — entry gates green (battery-22 ×2 runs, guard both surfaces, sync 9/9, tsc 0); zero code changed; the report + FILING-LOG under `reports/uat-fix-1/` | `night/uat-fix-1` | the ff-merge of `night/uat-fix-1` (re-derived at the next session's E1) |
| MADRUGA-UAT-BUILD-1 (execution night) | Stage 0 paper → Batch A (#97 F1 cure) → Batch B (#98 F2 cure) → Batch C (#99 F3 cure + the exemplo-landingpage disposition (i) resume-in-proper-lane — #86's pilot) | **IN PROGRESS** — the four ff-only merges are the trail; every batch: RED → cure → battery → guard → sync → tsc → merge → push → evidence → close. The :3777 warm serve stays ALIVE all night (the pilot asset). opencode.json / SPAWN-INVOCATION.sh / exemplo-landingpage NEVER staged until Stage C moves the stray. | `night/uat-fix-1`, `fix/f1-catalog-dupe`, `fix/f2-overload-starvation`, `fix/f3-workspace-lane` | (per stage; logged at each close) |

## Standing rules (this arc)

- Battery count: **22 until Batch A merges, 23 from Batch A on** (the catalog-uniqueness suite) — every
  gate, streak, and report cites the right number for its moment (auditor E-1).
- CHANGELOG: one line per cure batch AT MERGE TIME under `## [Unreleased]` — no pending rows (E-3).
- Timestamps: filings may headline the report-day; evidence bodies carry exact UTC (E-2).
- The tracker is truth: re-verify the open set before any gh mutation (E-5).
- Exactly 4 ff-only merges tonight; if the session dies mid-stage, completed merges survive and re-entry
  skips them by merge-sha evidence (E-7).
- The user's manual UAT is the gate AFTER the auditor certifies this build — not tonight.
