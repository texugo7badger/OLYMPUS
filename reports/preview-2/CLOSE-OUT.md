# MADRUGA-PREVIEW-2 — CLOSE-OUT (the preview-seam night, report-day 2026-10-09)

> The durable close-out packet, WRITTEN TO DISK BEFORE the chat summary (**#101**'s rule).
> The night rode exactly **4 merges** (the hard cap held): `8f4679d` (Stage 0 paper + Batch A
> filed as RED tests) → `db42e86` (**Batch A — #112 CURED + CLOSED**) → `c089861` (Batch B #111
> first look + Batch C the R1-origin experiment + the **vite port-argv follow-on** + the **LIVE
> PREVIEW PROOF, GREEN**) → the close paper (this file). All on origin/main, linear, ff-only.

## 1. Why this session existed

SMOKE-1's smoke ended with the preview trigger firing into an honest #105 refusal — **#112**:
the autonomous intake (#110) registers projects at `02_Projects/<slug>` (the user's pinned
directive), while the dev-server manager resolved ONLY the workspace lane. For exactly the
projects the intake creates, the user's directive ("when a frontend ships, the preview runs") was
unmet. Tonight closes that seam and proves the full loop end-to-end, deterministically first and
then LIVE on the free tier. Plus the auditor's two riders: the #111 first look and the R1-origin
micro-experiment.

## 2. Entry gates (verbatim record in `s0/ENTRY-GATES.md`)

| Gate | Verdict |
|---|---|
| E1 | `main == origin/main == 960c9fc`; no IN PROGRESS row; nothing raced; the SMOKE-1 sha-fill rode this Stage 0 |
| E2 | budget-guard BOTH surfaces exit 0 (10 lanes + generator 16/16); `glm-5.2` = **0**; sync **9/9** |
| E3 | open set re-derived: **24** — {76, 78–96, 100, 101, 111, 112} enumerated match; next free was **#113** (untouched) |
| E4 | battery **30/30 suites + tsc 0** on this session's OWN run, in the FOREGROUND on `main` (the SMOKE-1 lesson applied — no backgrounded battery): `/tmp/opencode/preview-2-battery/entry.log` |
| E5 | R4 `4e6b35ac7611fb583cc453edef743d470f68443394fb52aa48020357e6929619` (33568 bytes) snapshotted `/tmp/opencode/preview-2/`; never staged/committed |
| E6 | ports clean (:3777/:3015/:3737/:3740); the user's Zed ACP (21055/21077/21963) foreign, untouched; his SPAWN-INVOCATION.sh edit foreign, untouched |
| E7 | principal tree used directly (the SMOKE-1 pattern — the LIVE guard surface reads the R4 bytes that exist only here; disclosed) |
| E8 | **07:44Z, ALL-GREEN window, header capture** (`s0/e8-probe-t074445Z.txt`): glm-5.3 200/1.38s, kimi-k3 200/0.95s, muse 200/5.5s, flash 200/37.8s (glacial, disclosed); **deepseek DEAD the 4th consecutive night** (000/70s, zero assignments, disclosed); OR gemma-4:free **recovered** 200/1.8s; the two `:free` 404s still gone (disclosed, #78's class) |

## 3. The work

### 3.1 Stage 0 — paper (`8f4679d`)
QUEUE IN PROGRESS row + the SMOKE-1 sha-fill (`960c9fc`) + the entry-gate record + Batch A filed
as RED tests: `dev-server-manager` RED **6/33** (the A13 intake-02 pins reproduce SMOKE-1's live
refusal verbatim; the A14 refusal-preservation + C6 pins) and `first-prompt-intake` RED **3** (the
user's exact scenario). Evidence `s1/batchA-RED-*.txt`.

### 3.2 Merge 2 — #112 CURED (`db42e86`) — **#112 CLOSED** (evidence: `issuecomment-6077105509`)
**Option A, realized through `reconcileProjectPath`** (disclosed choice): `devServerManager.start`
resolves the project dir via the #103 lane-aware truth (note path alive outside the repo → the
note path; lane copy → the lane; note pointing into the root → the lane, never the repo), the
legacy `workspaceLaneDir()/slug` derivation kept for note-less slugs, a never-the-bare-lane-root
guard, the inside-root guard intact as defense-in-depth, the refusal preserved for the unknown
slug. GREEN: manager 33/33; the user's-scenario e2e through the REAL intake (0 LLM): intake
creates `preview-two-smoke` in 02_Projects → trigger → probe-green (url + latency) → HTTP 200 +
marker → clean stop, port silent, zero orphans. Frozen pair zero-diff. Battery 30/30 + tsc 0.

### 3.3 Merge 3 — the follow-on found by the LIVE garnish + Batches B/C (`c089861`)
- **The vite port-argv layer (#112 thread)**: the first live run died honestly — the manager's
  universal `-p` argv is next-shaped; vite rejects it (`CACError: Unknown option '-p'` verbatim,
  `s4/vite-cacerror-server-log.txt`; the #105 refusal held: "probe stayed silent :3078 after 15s —
  unverified"). Cure: `devServerPortArgs(devScript, port)` — vite → `['--port', N, '--strictPort']`
  (the probed port stays the truth), everything else keeps `-p` + the PORT env threaded. RED 2/39
  → GREEN 39/39 (`s1/batchA2-*.txt`). Evidence-bounded: no unproven flag dialects invented.
- **THE LIVE PROOF, GREEN on the free tier** (`s4/live-preview-proof.txt`): intake creates
  `preview-two-live` in 02_Projects (0 LLM) → ONE hop on apollo/`nvidia-glm/z-ai/glm-5.3`
  (**49,903 in / 1,877 out / 180s / 0 retries / completed**) writes the four artifacts → vite
  install → the cured seam (reconcile `source: note` → manager spawns in the note dir) →
  **probe-green 1ms, HTTP 200, the marker served at `http://127.0.0.1:3078`** → clean stop, zero
  orphans, the active pointer restored byte-identical. The status route surfaces THIS SAME
  manager.status output (the suite-pinned #105 path) — the panel reads it.
- **Batch B — #111 first look**: **NO internal-retry knob exists** (opencode 1.18.10): CLI flags
  exhausted (`s2/opencode-run-help.txt`), the binary's complete `OPENCODE_*` env read-set (82 ids,
  `s2/binary-env-vars.txt` — only a bash-tool timeout), the live config schema
  (`additionalProperties: false` — a `retry` key would be REJECTED; provider-level timeouts exist
  but bound single requests, never the loop). The finding + the three recommended minimal changes
  recorded on **#111** (`issuecomment-6077229097`); NO speculative code written (the brief's STOP).
- **Batch C — the R1-origin experiment** (`s3/`): the exact deterministic intake path re-run with
  a fresh slug in the real vault — the `stacks:` line **byte-identical correct on all three
  samples** (31 bytes, `[h` intact in hex, post-create / +250ms / post-readback), the consumer
  read-back returns the full array. **The specimen's only venue was the FLUENCY-1 chat tail**
  (the #101 degeneration class — the proof's own transcript and the live note carry the correct
  bytes, both byte-re-verified). The `__anomalies` loud surface + the round-trip pin stand as the
  permanent guard — the cure answers the auditor's real concern independent of origin. The
  experiment self-cleaned (pointer restored, project dir removed); the separate
  `preview-two-live` project is KEPT (the live proof's own output, disclosed).

## 4. The exit gates — VERBATIM

| Gate | Verdict |
|---|---|
| **The user's exact preview scenario, from cold** | **GREEN, twice over**: (a) deterministic, 0 LLM — the intake-created `preview-two-smoke` fixture goes intake → trigger → manager.start → probe-green → URL → HTTP 200 → clean stop (suite pins, `s1/batchA-GREEN-intake.txt`); (b) **LIVE on the free tier** — `preview-two-live`, probe-green 1ms, HTTP 200, the URL served the marker (`s4/live-preview-proof.txt`). R3's knob rode the hop (`OLYMPUS_HOP_TIMEOUT_MS=1800000`, disclosed; never fired). |
| **#111's verdict** | NO knob — recorded on the issue (`issuecomment-6077229097`) + `s2/batchB-111-first-look.md`; no code. |
| **The R1-origin experiment** | settled — CORRECT on all three byte-level samples; the specimen was the chat-tail class; the permanent guard (`__anomalies` + round-trip pin) stands (`s3/r1-origin-verdict.md`). |
| **Battery / guard / sync / tsc at close** | **30/30 suites + tsc 0 + guard exit 0 + sync 9/9 + glm-5.2=0** on this session's OWN foreground at-close run on `main` (`/tmp/opencode/preview-2-battery/atclose.log` — 33 exit=0 lines, zero non-zero) |
| **R4** | **byte-identical** at entry + close (`4e6b35ac…`, 33568 bytes) — never staged/committed |
| **Frozen pair** | **zero-diff** (`live-preview.tsx` + the live-preview route, `960c9fc..HEAD`) — the manager + trigger carried the whole cure |
| **CJK** | **0 CJK in authored surfaces**; ONE declared redaction in a verbatim evidence file (`s0/e8-probe-t074445Z.txt` — kimi's `reasoning_content` carried 5 model-salad CJK bytes; the line was redacted in-place with a declared marker; the raw capture preserved at `/tmp/opencode/preview-2/binary-strings-keep/`). Probe-recipe hygiene note for future sessions: sanitize non-ASCII model bodies on capture (authored by hand tonight; the recipe lives in /tmp like its SMOKE-1 parent). |
| **Orphans / ports** | none: ports clean incl. :3078; no manager state files; the proof's server stopped (probe-verified down); the experiment's lane removed; the active project pointer restored byte-identical |
| **The never-staged pair** | `opencode.json` (R4) + `reports/uat-r1/SPAWN-INVOCATION.sh` (the user's UAT edit) — never staged |
| **Hard cap** | **4 merges exactly** (`8f4679d` → `db42e86` → `c089861` → this paper) |

## 5. Honest findings (disclosed, none hidden)

1. **#112 auto-closed on the merge keyword** (`Closes #112` in the merge commit) before the
   evidence comment landed — the evidence comment was posted immediately after
   (`issuecomment-6077105509`). The house closure rule held in substance; the keyword did the
   bookkeeping. Noted so future batches pair keyword + comment deliberately.
2. **The status-route/panel path is proven by PIN + shared code path, not by a live Electron
   boot**: `/api/olympus/dev-server/status` returns exactly the manager.status object the live
   proof exercised (`probe-claim` suite pins the route's claim shape; the panel reads the route).
   No app boot tonight (deterministic bar + the live seam proof) — said plainly.
3. **The suite fixtures accept `-p` by fixture-construction** — that is precisely why the vite
   dialect bug was invisible to the battery and had to be found by the live garnish. The U-port
   table now pins the dialect map at the resolver; the lesson rides #94's class (the battery
   contract declares its environment).
4. deepseek-v4.1-flash dead the 4th consecutive night (zero assignments, disclosed each night);
   OR `gpt-oss-20b:free`/`ling-3.0-flash:free` still 404-gone (the #78 drift evidence accrues).
5. `preview-two-live` (the live proof's project) is kept in the vault — the proof's own output,
   the user's call to keep/delete; `preview-two-smoke` lives only in the suite's tmp fixtures.
6. The dependabot advisory (#60) surfaced on pushes again — pre-existing, out of scope, untouched.
7. The R1 meta-lesson recorded on the verdict file: a chat summary's sentence about a record is
   NOT the record — the committed bytes are the truth (#101's rule proves itself mid-flight).

## 6. The frontier for the auditor + the user

The auditor re-verifies at the frontier: the 4-merge linear chain, the riders' RED→GREEN evidence
(`s1/`), the Batch B inventory (`s2/`), the R1 experiment (`s3/`), the live proof (`s4/`), #112
CLOSED with the two evidence comments + #111's finding comment, the open set re-derived
({76, 78–96, 100, 101, 111} = 23 expected — #112 closed tonight), battery 30/30 + tsc 0, R4
byte-identical, frozen pair zero-diff. **The user's gate now opens**: the full Lumina UAT — no
folder selected — watching the machine classify, register, hop, and PREVIEW. That run doubles as
#83's window 2 (the sizing matrix) and the first live absorb/park exercise under real contention.
