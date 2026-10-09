# MADRUGA-SMOKE-1 — CLOSE-OUT (the smoke-debt night, report-day 2026-10-09)

> The durable close-out packet, WRITTEN TO DISK BEFORE the chat summary (**#101**'s rule: the
> chat message is a pointer, never the payload). The night rode exactly **4 merges** (the hard
> cap held): `f6ea490` (Stage 0 paper + the riders filed as RED tests) → `aef2f9b` (Batch B/riders:
> R1/R2/R3 GREEN + the 429 forensics → **#111 filed**) → `5f12439` (Batch A: **THE OWED SMOKE,
> GREEN** + **#112 filed** + the #83 matrix comment + the R3 pin-tightening erratum) → the close
> paper (this file). All on origin/main, linear (the ff-only discipline kept; merge 3 committed
> directly on main from the working tree — same linear result, disclosed).

## 1. Why this session existed

FLUENCY-1 closed 8/8 merges with ONE exit gate UNPAID: the live smoke on FREE was BLOCKED by a
global 429 window (01:32–01:47Z — both free pools throttled; REPORTED, not claimed, per #105).
Tonight pays it: the terminal-to-terminal proof — a real multi-hop build through the hop runtime,
≥2 pools, ZERO terminal deaths — plus the 429 forensics (with header capture this time), the #83
sizing-matrix first cut, and the auditor's two riders (R1/R2) + one timing-derived rider (R3).

The timing doctrine was invoked as designed: the 04:55Z probe read glm-5.3 **429** → paperwork
first, re-probe on a cadence, smoke when the window opened (06:09Z: all smoke lanes green).

## 2. Entry gates (verbatim record in `s0/ENTRY-GATES.md`)

| Gate | Verdict |
|---|---|
| E1 | `main == origin/main == f78fcbc` (the FLUENCY-1 close paper); nothing raced; the sha-fill rode this Stage 0 |
| E2 | budget-guard BOTH surfaces exit 0 against R4 (10 lanes + generator 16/16); `glm-5.2` = **0**; sync **9/9** |
| E3 | open set re-derived: {#76, #78–#96, #100, #101} = **22 rows exactly**; next free was **#111** (used) |
| E4 | battery **30/30 suites + tsc 0** on this session's OWN run (entry log `/tmp/opencode/smoke-1-battery/entry/`) |
| E5 | R4 `4e6b35ac7611fb583cc453edef743d470f68443394fb52aa48020357e6929619` (33568 bytes) snapshotted `/tmp/opencode/smoke-1/`; NEVER staged/committed |
| E6 | no listeners on :3777/:3015/:3737/:3740; the user's Zed ACP foreign, untouched; his `SPAWN-INVOCATION.sh` edit foreign, untouched |
| E7 | principal tree used directly (disclosed — the LIVE guard surface reads the R4 bytes, which exist only here) |
| E8 | **ALL 5 anchors + 3 OR free lanes probed WITH header capture** (`s0/e8-probe-t045506Z.txt`): glm-5.3 **429** (bare RFC7807, NO Retry-After), flash 200/44.8s (glacial), kimi-k3 **200/1.6s**, muse-glimmer 200/4.0s, **deepseek DEAD the 3rd consecutive night** (000/70s, zero assignments, disclosed); OR `gemma-4-31b-it:free` 429 (rich `limit_source` body), `gpt-oss-20b:free` + `ling-3.0-flash:free` **404 — left the free pool** (disclosed, #78's class) |

## 3. The work — the four merges

### 3.1 Stage 0 — paper (`f6ea490`)
The IN PROGRESS QUEUE row + the FLUENCY-1 close-paper sha-fill (`f78fcbc`, the house pattern) +
the `reports/smoke-1/` skeleton + the entry-gate record + riders R1/R2/R3 **filed as RED tests**
(the brief sanctioned RED-in-main for this window): R1 → `project-context.test.mjs` (RED 1/22 —
a bracket-eaten `stacks:` line degraded SILENTLY to a string/[]), R2 → `opencode-session.test.mjs`
S10 (RED 3 — **reproducing the auditor's exact specimen card**: "RETRY EXHAUSTED after 4 retries
… waited 65000ms across 2 retries … the plan was [5000, 30000, 120000, 300000]"), R3 →
`hop-runtime.test.mjs` (RED 2 — the 15-min per-hop ceiling hard-coded). Evidence `s1/*-RED.txt`.

### 3.2 Merge 2 — the riders GREEN + the 429 forensics (`aef2f9b`) — **#111 filed**
- **R1** (`project-context.ts`): `parseFrontmatter` now surfaces bracket-eaten flow sequences as
  `__anomalies` (loud, never silently empty) + the write→read→identical round-trip pin. GREEN
  22/22. The specimen verdict: **NOT reproducible on any durable surface** — byte-verified
  (`s0/ENTRY-GATES.md`); it matches the #101 chat-tail degeneration class. The pin locks the
  invariant forever.
- **R2** (`opencode-session.ts`): `retryExhaustionGuidance` takes the plan the LOOP resolved
  (5th param, back-compat); the headline count IS the ledger count; a 429-class ledger names the
  fixed key-limit lane ON the card. The card's arithmetic self-reconciles by construction.
  GREEN 84/84 (S10: all five pins).
- **R3** (`hop-runtime/walker.ts`): `OLYMPUS_HOP_TIMEOUT_MS` env knob (default 900000ms = the
  15-min ceiling, preserved) threaded into the dispatcher's spawn. GREEN 46/46.
- **Batch B forensics** (`s2/429-forensics.md` + `s2/diag-429-cadence.log`): **Q1 verdict (a) —
  distinguishable, but per-provider and body-only**: OpenRouter's 429 body machine-marks the
  class (`limit_source: upstream_provider_shared_pool` + `remedy_hint`); NVIDIA's 429 is bare
  RFC7807 (no Retry-After, no rate headers — header capture, verbatim). **Q2 verdict: shadowing,
  not double-waiting** — opencode/ai-sdk's internal cadence captured live tonight: a clean
  2s→128s doubling, ≥8 attempts / 4m17s inside ONE spawned process (time-boxed at 480s, still
  doubling); the #107 crescendo never fires while the inner loop holds the process; the hop
  ceiling is the only tripwire (and its SIGKILL surfaces classless — the filing's minimal fix).
  Retry-After was never observed from any provider → instrumentation note, no speculative code.
  Filed: **#111** `fix(harness): the 429 window honesty …` [bug, harness, free-tier].

### 3.3 Merge 3 — THE OWED SMOKE, GREEN (`5f12439`) — **#112 filed**, **#83 comment posted**
The Lumina SHAPE scaled down through the hop runtime on free-nvidia-build, R4 byte-identical:
- **The intake routing proof**: a second-prompt-class prompt routed `existing: fluency-smoke`
  (score 0.50, zero duplicates, 0 LLM tokens) — REUSING the FLUENCY-1 proof's own project
  (disclosed per the brief; the note + `livePreviewPort` intact from last night).
- **The 2-hop build on 2 distinct pools** (transcript `s3/smoke-transcript.txt`):

  | hop | god | lane (pool) | tokensIn | tokensOut | wall | retries absorbed | status |
  |---|---|---|---|---|---|---|---|
  | hop-landing | apollo | `nvidia-glm/z-ai/glm-5.3` | 51,022 | 3,445 | 190s | 0 | completed |
  | hop-interactive | hephaestus | `nvidia-kimi/moonshotai/kimi-k3` | 53,937 | 2,254 | 75s | 0 | completed |

  Artifacts on disk (the lane `~/OLYMPUS-VAULT/02_Projects/fluency-smoke/`): index.html,
  styles.css (hop 1) + menu.html, main.js, package.json, vite.config.js (hop 2) — a landing
  page + one interactive page, on the free pools, **ZERO terminal deaths**; the absorbed/parked
  event ledger is EMPTY (the off-peak window held — re-probe 06:09Z all-green on both lanes).
  R3's knob rode the run (`OLYMPUS_HOP_TIMEOUT_MS=1800000`, disclosed) — never needed, never
  fired.
- **The preview trigger FIRED and returned the honest #105 refusal** — "no lane project
  directory at `~/.local/share/olympus/workspace/fluency-smoke`" — exposing a REAL seam: #110's
  intake registers projects in `02_Projects/` (the user's pinned directive) but the manager
  resolves `workspaceLaneDir()/slug` only, so intake-created projects can never go
  probe-green through the live trigger (the suite e2e covered workspace-lane projects only).
  Filed **#112** `fix(dev-server): the live trigger seam …` [bug, dev-server, autonomy] with the
  transcript verbatim. Per the brief the refusal IS the compliant gate outcome (#105) — the URL
  stays unclaimed, honestly.
- **#83 comment posted** (window-1 sizing: the per-hop telemetry table + the lane-economics
  note + the drift/retry-class cross-refs): `issues/83#issuecomment-6075646614`. Stays OPEN
  (the bar: multiple campaigns across multiple windows).

### 3.4 The honest findings (none hidden)
1. **The absorbed/parked ledger is empty** — tonight's window never forced the crescendo or a
   park. The machinery's absorb/park halves are suite-proven (hop-runtime 46/46, incl. the
   park/resume + the liar-hop pins) and FLUENCY-1 documented the live park→resume; tonight the
   window simply held. Not a defect — recorded so the auditor doesn't have to dig for it.
2. **My own batch-discipline miss**: merge 2 left the R3 pin-tightening suite edit UNSTAGED
   (main carried the blunt literal-grep pin red for exactly one inter-merge window); the
   tightening + this disclosure rode merge 3. The GREEN evidence in `s1/` was captured against
   the tightened pin. Caught by re-reading the staged list at push time; no force-ops, no amend.
3. **Merge 3 committed directly on `main`** (the branch→ff-merge dance bypassed — same linear
   history, disclosed). Push-per-merge kept.
4. **Merge 2's first opencode-session run failed 10 pins for MY OWN zombie**: the RED-capture
   run left the warm fixture server alive on :38655; the next run's S6/S9 stub scenarios
   collided with it. Killed (this session's own orphan), re-ran clean (84/84), no suite-orphan
   at close. The FLUENCY-1 finding-3 class, re-manifested on my bench — disclosed.
5. **The user's real UAT re-run (the full Lumina) remains HIS gate** — the smoke proves the
   machinery, not his acceptance. Expected on his run: the #112 seam would fire the same honest
   refusal at the preview step unless cured first — flagged loudly here so the call is his.
6. The dependabot advisory (#60) surfaced on every push — pre-existing, out of scope, untouched.
7. `deepseek-v4.1-flash` dead the 3rd consecutive night; the two OR `:free` slugs gone 404 —
   both disclosed in the forensics (#78's class), none blocking tonight's lanes.
8. **My branch-state slip at the close battery**: the merge-3 commit command's trailing
   `git checkout night/smoke-1` left the tree on the STALE Stage-0 branch; the first at-close
   battery ran there and (correctly) went red on the three rider pins — I'd written section 4's
   battery claim before re-deriving it. Caught by the re-run, re-derived on `main` (30/30 +
   tsc 0, `/tmp/opencode/smoke-1-battery/atclose.log`), and the claim now cites the
   verified-on-main run. The failure mode is exactly the #101/#105 class — a claim file must
   never precede its evidence; the file was corrected BEFORE the chat summary (the rule held).

## 4. The exit gates — VERBATIM

| Gate | Verdict |
|---|---|
| **The smoke** | **GREEN** — the Batch-A requirements all met: ≥2 hops on ≥2 distinct pools (apollo/glm-5.3 + hephaestus/kimi-k3), ZERO terminal deaths (absorbed/parked ledger empty — the window held), the intake routing proof on the REUSED live project, the telemetry table verbatim above + in `s3/`, the preview trigger's honest #105 refusal with the seam filed (#112). The smoke did not need a park→resume tonight; the resume path's live evidence stands from FLUENCY-1's run 1. |
| **The forensics note** | `s2/429-forensics.md` — verdict **(a) distinguishable, partially** (per-provider, body-only); Q2 = **shadowing**, not stacking; **#111** filed; the 404-drift disclosed toward #78. |
| **#83 comment** | posted — `issues/83#issuecomment-6075646614` (evidence, not a close) |
| **Riders** | R1 RED 1/22 → GREEN 22/22 · R2 RED 3 (the auditor's specimen reproduced) → GREEN 84/84 · R3 RED 2 → GREEN 46/46 — all evidence in `s1/` |
| **Battery / guard / sync / tsc at close** | **30/30 suites + tsc 0** on this session's OWN at-close run (`/tmp/opencode/smoke-1-battery/atclose/`); guard both surfaces exit 0 (`All 10 generation lanes sized ≥ 8192`); sync **9/9**; `glm-5.2` = **0** |
| **R4** | **byte-identical** at entry + close (`4e6b35ac…`, 33568 bytes) — untouched, never staged/committed |
| **Frozen pair** | **zero-diff** (`live-preview.tsx` + the preview route, `f78fcbc..HEAD`) |
| **CJK / orphans** | **0 CJK** in the night's ADDED lines (the one diff-wide hit is a pre-existing CONTEXT line's U+00B7 `·` from FREE-1's row — the grep false-positive shape, disclosed); zero session orphans (ports clean, the suite-zombie killed mid-session, the diag time-box consumed by design); no listeners on :3777/:3015/:3737/:3740 (+:3080) at close |
| **The never-staged pair** | `opencode.json` (R4) + `reports/uat-r1/SPAWN-INVOCATION.sh` (the user's UAT edit) — never staged by this session, verified at close |
| **Hard cap** | **4 merges exactly** (`f6ea490` → `aef2f9b` → `5f12439` → this paper) |

## 5. The frontier for the auditor + the user

The auditor re-verifies at the frontier: the 4-merge linear chain on origin/main, the riders'
RED→GREEN evidence (`s1/`), the smoke transcript + telemetry (`s3/`), the forensics + the cadence
capture (`s2/`), issues #111/#112 (taxonomy-complete at creation) + the #83 comment, the open set
re-derived ({76, 78–96, 100, 101, 111, 112} = 24 expected after tonight), battery 30/30 + tsc 0,
R4 byte-identical, frozen pair zero-diff, 0 CJK in added lines. **The user's own full UAT re-run
(the real Lumina, NO folder selected) remains HIS gate** — now with the smoke debt paid and the
one live seam it exposed already filed (#112).
