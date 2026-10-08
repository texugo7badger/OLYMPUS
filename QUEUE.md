# OLYMPUS QUEUE — the standing session queue (UAT-FIX-1 arc onward)

The truth between sessions. Every session re-derives against this file BEFORE work; every close updates
it. No session trusts a report header over it. (Supersedes the sealed `reports/gap-1/QUEUE.md` for the
post-campaign arcs; the GAP-1 frontier record there stays sealed as history.)

## Frontier record

| Marker | Value |
|---|---|
| Build close (UAT-BUILD-1) | `main @ 7584752` (the 4-merge trail: 8c371e5 paper → b95c765 #97 → 8a0b3ab #98 → 7584752 #99 — re-derived at every session's E1) |
| R4 live config (never committed) | sha256 `5534ceab…` (31863 bytes) at the UAT-FIX-1 arc entry; snapshot `/tmp/opencode/uat-fix-1/opencode.json.snap`; whatever the live bytes are at any session's step 0 is that session's restore target. Re-verified byte-identical at CLOSE-1 entry + close (snapshot `/tmp/opencode/close-1/opencode.json.r4-snapshot`) |

## Session status

| Session | Scope | Status | Branch | Merge sha |
|---|---|---|---|---|
| MADRUGA-UAT-FIX-1 (recon, 2026-10-08 report-day) | the user's UAT defects root-caused (F1 catalog dupe / F2 overload starvation / F3 repo-cwd / F4 → #86 evidence / F5 filed); filings #97–#100; the build plan | **DONE (paper)** — entry gates green (battery-22 ×2 runs, guard both surfaces, sync 9/9, tsc 0); zero code changed; the report + FILING-LOG under `reports/uat-fix-1/` | `night/uat-fix-1` | `8c371e5` (the Stage 0 paper commit — the ff-merge of `night/uat-fix-1`) |
| MADRUGA-UAT-BUILD-1 (execution night) | Stage 0 paper → Batch A (#97 F1 cure) → Batch B (#98 F2 cure) → Batch C (#99 F3 cure + the exemplo-landingpage disposition (i) resume-in-proper-lane — #86's pilot) | **DONE (auditor-certified PASS WITH NOTES, 2026-10-08)** — the four merges, all on origin/main: `8c371e5` (Stage 0 paper) → `b95c765` (Batch A #97) → `8a0b3ab` (Batch B #98) → `7584752` (Batch C #99). The disposition (i) pilot WON: the resume completed the pilot at `~/.local/share/olympus/workspace/exemplo-landingpage` — exit gate **ALL 7 PASS** (#86's FLIGHT LOG, the issue's 2nd comment, 2026-10-07T22:12:29Z; #86 stays OPEN — the primitive's automation is the remaining scope). The auditor independently re-verified the four merges at the frontier + re-ran both new suites GREEN on his own bench (catalog-uniqueness 26/26, opencode-session incl. the never-the-repo guard, sync 9/9). Honest note: the chat-tail close-out packet DEGENERATED (free-lane tokenizer salad — FILED as **#101**, the durable-packet rule born); every durable artifact (report, CHANGELOG, issue comments) stayed clean — auditor-verified ZERO CJK. The :3777 warm serve stayed ALIVE all night (PID 993264, honored). opencode.json / SPAWN-INVOCATION.sh NEVER staged (verified again at CLOSE-1) | `night/uat-fix-1`, `fix/f1-catalog-dupe`, `fix/f2-overload-starvation`, `fix/f3-workspace-lane` | `8c371e5` / `b95c765` / `8a0b3ab` / `7584752` (per stage; the four are the trail) |
| MADRUGA-CLOSE-1 (paper, 2026-10-08) | bring the truth-files current (the build row closed DONE), file the chat-tail degeneration (**#101** — the durable-packet rule), pay the four S4 erratas (AN-S4-1..4) | **DONE (paper)** — entry gates green (E1 `7584752`; E2 guard both surfaces exit 0 + glm-5.2=0 + sync 9/9; E3 exactly #76+#78–#96+#100 = 21 open; E4 battery-23 green on the session's OWN run: 20 suites via npx tsx + context-distill 4/4 + telemetry-slice 10/10 + tsc 0). QUEUE truth restored; **#101** filed (harness+free-tier); AN-S4-1 (S4 row count 60→61 / entry 49→50, git-archaeology-proven), AN-S4-2 (the FILING-LOG #96 row), AN-S4-3 (12 free-NVIDIA prose mentions glm-5.2→glm-5.3, 6 files), AN-S4-4 (the 23-label set committed at `docs/registers/LABELS.md`) — all paid. Zero logic changed. The first durable close-out: `reports/uat-close-1/CLOSE-OUT.md` | `night/close-1` | the ff-merge of `night/close-1` (re-derived at the next session's E1) |

## Standing rules (this arc)

- Battery count: **23** (since Batch A — the catalog-uniqueness suite); every gate, streak, and report
  cites 23 (auditor E-1).
- CHANGELOG: one line per cure batch AT MERGE TIME under `## [Unreleased]` — no pending rows (E-3).
- Timestamps: filings may headline the report-day; evidence bodies carry exact UTC (E-2).
- The tracker is truth: re-verify the open set before any gh mutation (E-5).
- The close-out packet is a FILE: every night's final report lands as `reports/<arc>/CLOSE-OUT.md`
  BEFORE the chat summary — the chat message is a pointer, never the payload (**#101**'s rule).
- The user's manual UAT is THE gate now — the build is auditor-certified (PASS WITH NOTES, 2026-10-08);
  no internal night sits between CLOSE-1 and his run.
- The :3777 warm serve stays alive (the #86 pilot asset) — honored by every session, never killed.
