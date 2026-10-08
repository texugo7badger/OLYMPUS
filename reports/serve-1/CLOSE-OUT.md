# CLOSE-OUT — MADRUGA-SERVE-1 (the durable manager night, 2026-10-08)

> The durable close-out packet, WRITTEN TO DISK BEFORE the chat summary (**#101**'s rule: the chat
> message is a pointer, never the payload). The night rode exactly **5 ff-only merges**
> (paper + A + B + C + close-paper), all pushed on origin/main:
> `afb6cbc` → `9633fc5` → `aa16c70` → `5e5ee3f` → `101d5c7` (this merge's sha filled
> post-merge per the PREVIEW-1 cycle — it rides the next session's Stage 0 paper).

## 1. Why this session exists

The user's live test (the #76 bar) is TOMORROW AFTERNOON. PREVIEW-1 (`880dcc8`) healed the Live
Preview path — the panel is honest and alive — and three things were left owing in planning:

1. **#86 (manager half)** — the durable dev-server manager: the thing the user asked Apollo
   ("start my dev server") and that the interactive lane cannot be (#105's lesson: the bash tool
   kills the foreground server on timeout, and the narration lied "running" from captured text).
2. **#105** — the probe-verified-claim doctrine: never narrate "running" without a green probe;
   the manager's status is the single source of truth for live state.
3. **The #104 follow-up** — the complete dispatch-cwd class: the six one-shot lanes that still
   inherited the repo root as cwd.
4. **PREVIEW-1's paperwork** — its final close-out was working-tree-only by design (the 4-merge
   discipline); this night's Stage 0 committed it.

**The supreme rule held:** nothing tonight regressed the healed path — `live-preview.tsx` + the
live-preview route are ZERO-DIFF across the night (verified in `880dcc8..HEAD`), and the night's
LAST gate re-ran the user's exact scenario GREEN.

## 2. Entry gates (all VERIFIED — this session's own runs)

| Gate | Result |
|---|---|
| E1 | `main == origin/main == 880dcc8`; the chain `6491a8e → 7cc8a1b → cd46fb0 → b3575ac → 880dcc8` re-derived ff-only (each parent = predecessor); work in a clean worktree created from `880dcc8` (`/home/texugo/Projects/olympus-serve-1`, node_modules hardlinked + the gitignored runtime artifacts copied — see the finding below), never in the dirty auditor tree |
| E2 | budget-guard BOTH surfaces exit 0 (LIVE 9 lanes ≥ 8192; GENERATOR 16/16); `grep -c 'glm-5.2' opencode.json` = **0**; check-strategy-sync 9/9 exit 0 |
| E3 | open set exactly **#76 + #78–#96 + #100 + #101 + #105 = 23** (gh re-derived before any mutation); #102/#103/#104 CLOSED with sha evidence (state + titles re-verified) |
| E4 | **battery-26 green on this session's OWN run**: 23 suites via npx tsx all exit 0 + context-distill 4/4 + telemetry-slice 10/10 + tsc 0. Logs: `/tmp/opencode/serve-1-battery/entry/` |
| E5 | R4 live config sha256 `5534ceab9cfe160da3c5efa4a13c1e8dc8c3df6c2be0d3f0c5b65decabbd3d52` (31863 bytes) — byte-identical to the CLOSE-1/PREVIEW-1 baseline; snapshotted to `/tmp/opencode/serve-1/opencode.json.r4-snapshot`; NEVER staged, NEVER committed; **byte-identical again at close** |
| E6 | :3777 DOWN (no listener — expected; never killed, never respawned ad-hoc); the user's :3015 NOT PRESENT on this box (ended externally during PREVIEW-1's gate — recorded honestly, never touched); no app server on :3737 at entry |

**The worktree finding (an environment gap, not flake — recorded honestly):** a fresh worktree
lacks the gitignored runtime files, and `.opencode/package.json` (no `"type"` field) is what
keeps overlay `.ts` files in tsx's CJS mode — without it, 6 suites (athena-click, atlas-sync,
dispatch-spine, parallel-pantheon, symphony-cable, telemetry-pulse) die on `__filename is not
defined in ES module scope` at dispatch.ts:145. Healed by copying the gitignored runtime
artifacts (`.opencode/package.json`, package-lock, `.gitignore`, node_modules hardlink, both
dist dirs). After the heal: the full battery green — the affected suites ran green twice (the
E4 "twice if any flake" rule, satisfied). The main tree's runtime state was never modified; the
worktree carries gitignored copies only (invisible to every commit; the worktree is removed at
close).

## 3. The work — five ff-only merges, all pushed (`origin/main`)

### 3.1 Stage 0 — paper (`afb6cbc`)

PREVIEW-1's close-out committed verbatim (its working-tree-only state was the 4-merge
discipline's design): the QUEUE DONE row (the trail `7cc8a1b` / `cd46fb0` / `b3575ac` /
`880dcc8`), the registry reconciliation (#102/#103/#104 with the shas), the filled
`reports/preview-1/CLOSE-OUT.md`, + the two **#101 riders**: (a) the FILE rule saved the night
through the SECOND consecutive collapse of #101 (PREVIEW-1's packet survived on disk before the
context died); (b) the auditor-side twin — the auditor session died pre-delivery and the durable
worklog carried the verdict the same way. Two collapses, two survivals: the rule is proven in
both directions. Tonight's additions: the SERVE-1 IN PROGRESS row, the battery rule
(23 suites → 25 at exit — battery-28), the rewritten standing rule (the only nights between the
build and his run are healing/addition nights; HIS RUN IS THE GATE; nothing regresses the healed
path; the exit gate re-runs the exact scenario), the honest :3777 rule update (DOWN since
PREVIEW-1, ended externally; its durable restart is #86's arc, not an ad-hoc spawn), the R4
line extended, and `reports/serve-1/` (FILING-LOG + this CLOSE-OUT's skeleton). The merge
mechanics disclosed: main is checked out in the auditor tree, so the ff-merges executed there;
the 3 draft files were reverted only AFTER their content was provably committed (`afb6cbc`,
byte-compared) + backed up (`/tmp/opencode/serve-1/drafts-backup/`) — zero information loss, the
R4 pair untouched throughout. `.git/info/exclude` ignores `reports/` locally — new report
files stage with `-f` (the house convention, as PREVIEW-1's own report files prove).

### 3.2 Batch A — #86 the durable dev-server manager

**Merged `9633fc5`** (branch `fix/86-manager`, ff-only, pushed; origin/main == `9633fc5`).

RED (`scripts/dev-server-manager.test.mjs` — suite #24, child-gate hermetic): **7/7 FAILED**
(both children died on the missing module import + all 5 content pins empty). Cure:
`src/lib/dev-server-manager.ts` — `start(slug, port?)` spawns DETACHED (`detached: true` +
`unref`, stdio -> log file) in the project's LANE dir (`workspaceLaneDir()`, the `insideOlympusRoot`
guard, never the repo), port = the note's `livePreviewPort` (panel parity) with the honest
ephemeral fallback, state at `~/.local/share/olympus/dev-servers/<slug>.json` with EXACTLY
`{pid,port,host,projectPath,startedAt,logFile,lastProbe}`; `status(slug|port)` re-probes via the
#102 `probeDevServer` — the only source of "running" — with the dead-pid self-heal
(`down (stale state, pid dead)`); `stop(slug)` SIGTERMs the process GROUP (npm + server die
together), SIGKILL disclosed, port-free verified; `list()`; idempotent start; the foreign-port
refusal. **GREEN 25/25** (tsc 0): full lifecycle on real npm-spawned fixture servers, zero
orphans (fixture PIDs 91187/91217/91270, created + killed by the suite), the crash-orphan heal +
clean restart, the guard behaviorally (OLYMPUS_WORKSPACE inside a fake root -> the HOME-default
lane fallback, never the root), the state-contract pin.

**The live proof (2026-10-08T07:20:28-36Z, verbatim, only processes created BY THE PROOF):**

```
[07:20:28.747Z] start(exemplo-landingpage) -> ok, pid 91505, port 3015,
  projectPath /home/texugo/.local/share/olympus/workspace/exemplo-landingpage
[07:20:29.776Z] status GREEN: running:true, host ipv4, responseTimeMs 1,
  note "running (probe-verified on ipv4, 1ms) - pid 91505 on port 3015"
[07:20:36.435Z] HTTP 200 - <title>Nexus — Automação Inteligente para Equipes Modernas</title>
[07:20:36.538Z] stop -> ok, portFree:true, escalatedToSigkill:false
[07:20:36.539Z] probe 3015 -> running=false  (LIVE PROOF: ALL 5 STEPS GREEN)
```

The real lane project, the user's own note port, a real Next boot, the panel's exact port.
Post-proof state: the real dev-servers dir holds only `logs/`; zero leaked processes.
**Battery 27 from this merge onward** (24 suites + 2 self-tests + tsc; the full battery green
on the session's OWN run at the batch gate). Tracker: #86 progress comment `6054918924`
(the scope-split: manager half DONE, journal-replay half remains — #86 stays OPEN).

### 3.3 Batch B — #105 the probe-verified-claim doctrine

**Merged `aa16c70`** (branch `fix/105-probe-claim`, ff-only, pushed; origin/main == `aa16c70`).
**#105 CLOSED** with the merge-sha evidence comment.

RED (`scripts/probe-claim.test.mjs` — suite #25, pure unit + pins): **11/11 FAILED** (the claim
gate missing, the route missing, the card without the probe path, both prompt surfaces without
the rule). Cure, all three layers:

- **The claim gate** — `src/lib/dev-server-claim.ts` (pure, client-safe; type-only dependency
  on the manager): `buildDevServerClaim` — probe green -> the claim carries host/port/latency;
  probe silent -> the honest down sentence, never "running"; no probe + captured text (the
  #105 specimen) -> `running: null, verified: false`, the claim is EXACTLY the exported
  `UNVERIFIED_CLAIM_REFUSAL` = `unverified — no probe evidence`, the captured "Ready"/"Compiled"
  text never quoted as evidence. **GREEN 23/23** (tsc 0).
- **The app-flow surface** — the additive route `src/app/api/olympus/dev-server/status/route.ts`
  (the manager's probe-verified status + the server-built claim; active-project fallback; the
  no-project answer is the refusal itself) + the #98 failure card
  (`interactive-terminal.tsx`): `DEV_SERVER_SIGNAL_RE` gates the class; the card fetches the
  probe route; verified -> `Dev-server probe: <host/port/latency/pid>`; no probe ->
  `Dev-server claim refused: unverified — no probe evidence`. The frozen pair
  (`live-preview.tsx` + the live-preview route) — zero diffs, verified in the merge diff.
- **The rule, verbatim in spirit** — AGENTS.md ("Probe-verified claims (standing rule — #105)":
  captured stdout proves a process STARTED, it says nothing about whether it is STILL RUNNING;
  probe first, quote the probe result, or say honestly that you could not verify) + the narrator
  god's prompt (`.opencode/prompts/agents/gods/apollo.txt` — "Live-State Claims (#105)": the
  manager's status is the single source of truth for "running").

**Battery 28 from this merge onward** (25 suites + 2 self-tests + tsc; guard + sync re-verified
green at the batch gate). Tracker: #105 CLOSED @ `aa16c70` (taxonomy verified in-pattern before
the close: fix(harness) [bug, free-tier, harness]).

### 3.4 Batch C — the complete dispatch-cwd class (the six sites)

**Merged `5e5ee3f`** (branch `fix/dispatch-cwd-class`, ff-only, pushed; origin/main == `5e5ee3f`).

The six sites re-derived in this tree (the set matched the auditor's 880dcc8 table exactly;
lines may shift by a comment line): `heartbeat/route.ts:101`, `action/route.ts:444` + `:733`,
`intake/route.ts:134`, `doc-summarizer.ts:174`, `compact/route.ts:25`. Each carries
`cwd: resolveDispatchCwd(...)` — the intake site threads the project slug it already had
(`result.project?.slug`); the rest resolve the lane dir (no slug in scope — the #104 semantics:
absent -> the lane, never the repo). The two already-cured spawns (the serve, #99's own lane cwd;
athena/edit, #104) untouched — verified.

RED **proven honestly by stash**: the extended suite ran against the pre-cure code (the six src
cures stashed, the test untracked) — **6/15 FAILED, the GLOBAL invariant naming each offender**
(`6/8 call sites without cwd: action:444, action:733, heartbeat:101, intake:134,
doc-summarizer:174, compact:25`). GREEN after the pop: **15/15** (tsc 0).

`scripts/dispatch-cwd.test.mjs` grows (no new suite; battery stays 28): the per-site pins + the
GLOBAL invariant — every `spawnOpencode` call site in src/ (outside the definition file) carries
an explicit `cwd:`. No new issue; no tracker mutation beyond the #104 pointer comment
(`6055414983`, the audit disposition the close comment promised).

### 3.5 Stage E — close paper

This merge: the CLOSE-OUT completed on disk (every section), the QUEUE DONE row (the five
shas), the battery rule landed at its exit truth (**28** — 25 suites + 2 self-tests + tsc), the
ISSUES.md registry rows (#86 manager half + journal-replay split; #105 CLOSED), and the branch
sweep (only main remains locally). CHANGELOG: all three batch lines already landed AT MERGE
TIME under `## [Unreleased]` (the E-3 rule — zero pending at close, verified).

## 4. The live exit gate (the user's exact scenario, re-run green — the LAST gate)

The app: `next dev -p 3737 -H 127.0.0.1` started BY THE SESSION in the worktree (the post-night
code @ `5e5ee3f`; my own process, killed with the session). The dev server: the user's exact
command shape (`npm run dev -- -p 3015`, session-spawned setsid after the first attempt was
reaped with the tool's own process group — disclosed; his processes never touched).

**The E5 pair, REVERSED (2026-10-08T07:58:38Z, verbatim):**

```
== 1. the dead path /api/olympus/live-preview/status (must stay 404) ==
HTTP 404
== 2. the live route /api/olympus/live-preview?project=exemplo-landingpage ==
{"running":true,"port":3015,"url":"http://127.0.0.1:3015","host":"ipv4",
 "responseTimeMs":5,"project":"exemplo-landingpage","slug":"exemplo-landingpage",
 "path":"/home/texugo/.local/share/olympus/workspace/exemplo-landingpage","pathSource":"note-stale"}
HTTP 200
== 3. the iframe src (status.url) ==
iframe src: http://127.0.0.1:3015
HTTP 200 — <title>Nexus — Automação Inteligente para Equipes Modernas</title>
```

**Panel green ≤ 3s:** `responseTimeMs: 5` on the first probe — the bar met with 600x margin
(the panel polls on mount + every 3000ms; the probe settles in 5ms — green within one cycle).
The iframe renders the landing (the API + the content-pins carry the evidence — the headless
substitute class, per the p5 precedent). **The night did not regress the PREVIEW-1 cure.**

## 5. The manager's double proof

The SAME scenario, but the dev server started BY THE MANAGER — the panel code untouched
(frozen, zero-diff), the manager serving on the port the panel already probes (the note's
`livePreviewPort`). Verbatim (2026-10-08T08:00:12–18Z):

```
[08:00:12.235Z] start → ok, pid 111680, port 3015,
  projectPath /home/texugo/.local/share/olympus/workspace/exemplo-landingpage
[08:00:13.246Z] status → running (probe-verified on ipv4, 1ms) — pid 111680 on port 3015
[08:00:13.324Z] panel → {"running":true,"port":3015,"url":"http://127.0.0.1:3015","host":"ipv4",
  "responseTimeMs":3,...,"pathSource":"note-stale"}   ← green BY ITSELF, no panel code touched
[08:00:18.537Z] iframe → HTTP 200 — <title>Nexus — Automação Inteligente para Equipes Modernas</title>
[08:00:18.865Z] claim route (#105) → "dev server running on port 3015 (ipv4) — probe-verified"
  evidence: probe: port=3015 host=ipv4 latency=5ms pid=111680 (…/exemplo-landingpage)
[08:00:18.967Z] stop → ok, portFree:true, escalatedToSigkill:false
[08:00:18.967Z] probe 3015 after stop → running=false
```

The panel went green BY ITSELF against a MANAGER-STARTED server — the exact integration shape
#100 will formalize after the UAT: the manager spawns, the frozen panel probes, both speak the
note port. Plus the #105 surface live: the claim route builds the probe-verified sentence from
the manager's status.

## 6. STATE AT END

- **Frontier:** `main == origin/main == <this merge>` (the 5-merge trail `afb6cbc` → `9633fc5`
  → `aa16c70` → `5e5ee3f` → close; every merge ff-only, verified pushed; linear — each parent =
  predecessor).
- **Tracker:** #105 **CLOSED** @ `aa16c70` (probe-evidence close comment); #86 carries the
  scope-split progress comment `6054918924` (manager half DONE @ `9633fc5`; the journal-replay
  half remains — #86 STAYS OPEN); #104 carries the class-completion pointer `6055414983`;
  #76 + #100 UNTOUCHED. Open set at close: **exactly #76 + #78–#96 + #100 + #101 = 22**
  (gh re-derived).
- **Machine:** **battery-28 green on the session's OWN runs at entry, per batch, and at close**
  (25 suites exit 0 + context-distill 4/4 + telemetry-slice 10/10 + tsc 0); guard both surfaces
  exit 0; sync 9/9; `glm-5.2` = 0. Logs: `/tmp/opencode/serve-1-battery/{entry,batchA,batchB,batchC,atclose}/`.
- **R4:** `5534ceab…` byte-identical at entry and close (sha256 re-compared at close — the main
  tree's live config untouched all night; the never-staged pair never staged).
- **Processes:** every process this session created is dead at close — the app chain on :3737
  (PIDs 110634/110660/110689/111160), the run-1 lane server on :3015 (setsid, killed after
  gate 1), the manager servers (PID 91505 live proof, PID 111680 gate 2 — both stopped by the
  manager with portFree verified), the suite fixture servers (91187/91217/91270 — killed by the
  suite + the sweep). `ss` at close: no 3015, no 3737, no listener the session left behind.
  :3777 DOWN all night (never killed, never respawned).
- **Hygiene:** zero CJK in the night's TOTAL diff (`880dcc8..HEAD` — grep count 0); the frozen
  pair zero-diff; zero new files beyond the declared artifacts (2 modules, 1 route, 3 suite
  files [1 new + 1 grown + 1 new], the paperwork, the 6 dispatch-cwd sites, the prompts); the
  worktree removed; the night branches deleted post-merge (only main remains).

## 7. Taxonomy check (standing rule)

| Issue | Shape | Labels | Verdict |
|---|---|---|---|
| #105 (closed tonight) | fix(harness): the phantom-success narration | bug, free-tier, harness | in-pattern (verified before the close; the close comment links sha + suite output + the doctrine) |
| #86 (comment only) | feat(recovery): dispatch journal replay | enhancement, autonomy | in-pattern (no taxonomy change; the scope-split progress comment `6054918924`; #86 STAYS OPEN — the journal-replay half) |
| #104 (comment only) | fix(harness): the one-shot dispatch cwd | bug, harness | in-pattern (the class-completion pointer `6055414983`; stays closed at its own sha) |
| #76 / #100 | untouched | — | untouched (the user's bar; the panel↔manager design night) |

Closures this night: **#105** — the close comment links the merge sha `aa16c70` + the RED/GREEN
suite output + the live doctrine surfaces. No other issue mutated; no new issues filed
(the dispatch-cwd class rode #104 by directive).

## 8. The bar for the next gate

**HIS RUN IS THE GATE.** Tomorrow afternoon the user restarts the app, runs his dev server in
his terminal, opens the Live Preview panel — it goes green within one probe cycle and the
iframe renders his landing. If he asks Apollo to start the server instead, the manager is the
host and the claim carries probe evidence. The remaining backlog: 22 open — the #86
journal-replay half, #100 (the panel↔manager UI integration, AFTER his run), and the standing
registry. The queue's open set is the truth.
