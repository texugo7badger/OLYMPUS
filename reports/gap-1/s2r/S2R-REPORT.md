# MADRUGA-GAP-1-S2R — THE PULSE, REDO — FINAL REPORT

**Branch:** `night/gap-1-s2r` from main @ `68fb8d2`. **Commits:** `db47ad5`
(the #69/#77 pair + battery suite #21, ONE commit — the recovered session's
shape) + this close-out commit. **R15:** this box HAS credentials (gh
authenticated as texugo7badger; `git push --dry-run` green at entry) — the
REAL push + the R13 closes executed IN-SESSION.

**R14 DISCLOSURE, PLAIN:** the first attempt was lost; this is the redo.
The original S2 ran on a credential-less container box; its commits
(`d280d3b`/`2193ac4`) merged locally only, the honest bundle substitute was
delivered, and the box was RESET before the user could apply it. Origin/main
never moved; the lost shas are NEVER cited as evidence anywhere in this
report. Everything below is fresh work with new shas and fresh evidence.

## ENTRY (E1–E4, all VERIFIED this session)

- **E1:** main == origin/main == `68fb8d2` exactly (log -5: 68fb8d2 / f1b12d9 /
  8f822fa / e8743f2 / e284dc2) — matches the SESSION INPUT, zero drift.
  Only `main` local + the 5 dependabot remotes (observe-only, verbatim in
  the session log).
- **E1b — R4 snapshot:** live `opencode.json` sha256
  `5d1d544100a125c9fcd9bd8e1b7c382f418f8bf2d7f435b7a99671392ac26259` (the
  standing baseline; cp'd to the session snapshot, both shas match).
  `git status --porcelain` at entry: ` M opencode.json` (the night box).
- **E2:** budget-guard exit 0, BOTH surfaces — live 8/8 + generator 16/16
  (THIS box's verbatim counts; the N29 path-dependence means a fresh clone
  reads the shipped tracked 10/10 — both expected); live `glm-5.2` = 0.
- **E3:** `gh issue list --state open` → exactly #67, #69, #76, #77 (four;
  #70 closed by S1). Labels recorded via `gh label list` (23 labels).
- **E4:** battery-20 green (17 script suites via `npx tsx` + context-distill
  4/4 + telemetry-slice 10/10) + `npx tsc --noEmit` exit 0.

## The mechanism, verified in the code as it stood at `68fb8d2`

**#69** — in `.opencode/olympus/olympus-hooks.ts` `tool.execute.after` (line
1058): the #25 `eventAgent` resolution at 1063–1066 (`input.agent`, else the
bus-recorded `callAgentByCallId`); the cost append at 1080–1096 runs BEFORE
the hard gate `if (!state.agentId) return;` at **line 1101** — and every
live.jsonl activity write (the dispatch registration at 1104+, the
`attributeToolCall` at 1202–1208, the write/edit row at 1211–1229, the bash
row at 1232–1256, the shortcircuit row at 1260–1272) sat AFTER it. In
one-shot spawns `session.created` never fires (the in-code comment at
~1478: opencode 1.18.10 one-shots; the only session_start in the live feed
predates the feature) and the tool payload carries no `agent` (per #25), so
`state.agentId` never populates → cost flowed, the feed froze.

**#77** — the #25 managed-process gate: `isManagedProcess` at 794, the
unmanaged return `{ tool: OLYMPUS_TOOLS }` at **805–807** — every unmanaged
process gets tools-only, including the user's interactive ROOT session, so
its Part-3 heartbeat wiring (the acting heartbeat at `tool.execute.before`
980–997; the idle heartbeat at `session.idle` 1409–1424; both `busPublish` +
`atlasRecordHeartbeat`) never fired. The filed live evidence: a session with
heavy tool activity and zero heartbeats on the bus.

## PHASE 1 — B1R: #69, the activityAgent fallback ✅

The fix (the issue's fallback-identity option, per the recovered spec):
`const activityAgent = state.agentId || eventAgent || null;` replaces the
hard gate — attribution falls back to the SAME trusted sources the cost path
already uses (#25): `input.agent`, else the bus-recorded agent for the
callID (`message.part.updated` → `rememberCallAgent`), else `"global"` via
`godId` (the D17/D20 convention the cost line already applies to the same
call). **The tracker is NEVER mutated by the fallback** — `activityAgent`
feeds attribution only. The three downstream `state.agentId` uses
(`attributeToolCall` + the write/edit and bash `meta.agent` fields) read
`activityAgent`. Dispatch registration, dispatch events, tool_call events
and shortcircuit events now all reach live.jsonl for driver-spawned runs;
interactive behavior unchanged, zero duplicate rows (asserted, before AND
after — the invariant guard).

## PHASE 2 — B2R: #77, the root heartbeat lane ✅

**The design decision (one paragraph, as required):** extending the managed
gate to every unmanaged process would re-open the foreign-run
misattribution #25 cured — Zed's ACP agent and bare CLI runs are
mechanically indistinguishable from the root session without an explicit
marker. **Chosen: the opt-in heartbeat lane.** The root session declares
itself with `OLYMPUS_ROOT_SESSION=1` (the launching shell — `export
OLYMPUS_ROOT_SESSION=1` or `OLYMPUS_ROOT_SESSION=1 opencode` — or the app
terminal's spawn env; the app-terminal injection point is the ROOT-LANE-ADOPT
S4 filing candidate). The lane (`buildRootSessionHooks()`) registers
EXACTLY the Part-3 wiring — acting heartbeats at `tool.execute.before`,
idle at `session.idle`, on the bus + Atlas — driven by an in-memory
session-local tracker fed by the #25-verified identity sources
(`message.part.updated` info.agent; `agent` on the tool payload for future
opencode versions). A recorded agent that is not a canonical god publishes
nothing (the lane never invents gods). The #25 contract is preserved
VERBATIM (asserted, not assumed): no cost.jsonl writes; no active-agent.json
reads or writes; no VaultBrain/Callimachus/dispatch registration; foreign
processes (neither flag) keep the bare tools-only return.

## The proof — battery suite #21, red-first hermetic (R11) ✅

`scripts/telemetry-pulse.test.mjs` (in the pair commit): every child points
`OLYMPUS_ROOT`, `OLYMPUS_VAULT`, `OLYMPUS_HOME` AND `HOME` at throwaway
temp dirs BEFORE its first import; the real `~/.olympus`, the real vault and
the live opencode.json are never touched; no network (the stub client
absorbs `client.*`; `session.created` is never fired — that is the point of
the one-shot shape).

- **RED verbatim** (`reports/gap-1/s2r/B1B2R-RED-verbatim.txt`, 7 FAILURE(S)
  / 17 checked, exit 1):
  - the ONE-SHOT shape: `rowsTotal: 0, costRows: 2` — "cost flowed, the feed
    stayed frozen" — the D8 blindness reproduced deterministically; the
    hermes/global/dispatch row assertions FAIL on `[]`;
  - the ROOT shape: `hookKeys: ["tool"]` + `hooks.event is not a function`
    — the filed live evidence's deterministic twin;
  - the INVARIANT guards PASS pre-fix too (interactive 2 calls → 2 rows
    both hermes; foreign tools-only, zero cost rows, no active-agent.json,
    no bus file; the root #25-contract check passes trivially) — guards,
    not regressions.
  - Note: two shim iterations were needed before the RED was clean — the
    plugin-SDK `tool.schema` builder needed a catch-all chain (the review
    tools call `.object()`/`.min()`); disclosed as fixture-authoring cost,
    not a code finding.
- **GREEN verbatim** (`B1B2R-GREEN-verbatim.txt`): `All 17 telemetry-pulse
  (#69 one-shot feed + #77 root heartbeat lane) assertions passed`, exit 0 —
  including the acceptance integration: `telemetry-slice --since <spawn>
  --file <feed> --action tool_call --json` returns the rows (exit 0, count
  ≥ 2).
- The 17 checks are a SUPERSET of the recovered spec's 12-assertion shape
  (five crash-free child guards added); every REQUIRED coverage item is
  present: the one-shot RED→GREEN with the hermes/global attribution, the
  slice acceptance, the interactive zero-duplicate invariant, the foreign
  #25-cure invariant, the root RED→GREEN with the trio + heartbeats +
  godStates.apollo + the preserved #25 contract.

## PHASE 3 — the discipline sweep ✅

- **R12 (the dist):** `npx tsc -p .opencode/olympus/tsconfig.json` exit 0 +
  `node scripts/olympus-overlay-postcompile.js` exit 0 (25 src/lib artifacts
  synced). Behavioral greps on `.opencode/olympus/dist/olympus-hooks.js`:
  `activityAgent` **×5** · `OLYMPUS_ROOT_SESSION` **×4** ·
  `buildRootSessionHooks` **×3** · the lane's three hooks `"event"` /
  `"tool.execute.before"` / `"session.idle"` **×2 each** · the old
  `state.agentId) return` gate **ABSENT (0)** · `node --check` green. (The
  recovered counts were ×4/×3/×2 — mine are supersets: the comment text
  carries the extra mentions. The dist is the deploy surface, git-ignored —
  rebuilt + grepped in place, per the standing pattern.)
- **R8:** telemetry-slice self-test exit 0 · opencode-session 33 PASS /
  0 FAIL · symphony-cable 11/11 · athena-click 6/6 · telemetry-pulse 17/17
  · **the full battery-21** (18 script suites + context-distill 4/4 +
  telemetry-slice 10/10) all exit 0 · root `npx tsc --noEmit` exit 0.
  Nothing green regressed.

## Close-out

- **Registers:** ISSUES.md gains the GAP-1-S2R session row + the
  GAP-1-S2-LOST row (the R14 LOST-WORK record — the lost shas named, marked
  NEVER-EVIDENCE) + BATT-ENV (the fresh-clone battery contract → S4 filing
  candidates) + ROOT-LANE-ADOPT (the app-terminal injection point → S4);
  G3 marked DIED with #69's fix; D20-live's #77 pointer updated to the
  landed lane.
- **CHANGELOG:** the S2R block under the single `## [Unreleased]` (verified
  exactly one stands). D-1 held — zero version moves.
- **QUEUE.md:** rewritten — the S2 rows superseded by S2R (DONE, the new
  shas), the LOST-WORK incident row added, the S3 entry gate updated
  ("S3 verifies origin/main == the S2R-recorded close sha before cutting
  its branch"), the S2R standing facts recorded (battery now 21).
- **Hygiene:** `git clean -nd` → empty; R6 ports 3737/3738/3740/3777 all
  free; no pidfiles (verified at close).
- **Branch discipline:** ONE ff-only merge to main (ancestry verified),
  branch deleted. **The slip, disclosed:** the pair commit FIRST landed on
  `main` directly — the night branch was not cut before committing.
  Recovered safely WITHOUT touching the working tree: `git checkout -b
  night/gap-1-s2r` at the commit, then `git update-ref refs/heads/main
  68fb8d2` (a ref-only move; the live `M opencode.json` preserved
  throughout, verified). The lesson is in QUEUE.md: the branch cut is the
  FIRST code action, before any commit.
- **R4:** entry snapshot cp-restored over the live opencode.json at close +
  sha-verified == `5d1d544100a125c9fcd9bd8e1b7c382f418f8bf2d7f435b7a99671392ac26259`.
  The live was NEVER committed, NEVER stashed.
- **PUSH (R15):** `git push origin main` — the real one, executed
  in-session (this box has credentials). Verbatim outcome in the session
  log.
- **R13:** #69 and #77 CLOSED post-merge with evidence comments (mechanism
  + fallback design + the acceptance evidence + the new shas + the fresh
  RED/GREEN verbatims + the R12 greps); `gh issue list --state open` →
  exactly #67 and #76.

## Taxonomy check

- **#69 CLOSED:** title already on-pattern `fix(telemetry): live.jsonl
  activity feed is blind to one-shot opencode run spawns` [bug, telemetry];
  closing comment carries the pair commit sha (`db47ad5`, on main) + the
  RED/GREEN transcripts + the R12 dist greps.
- **#77 CLOSED:** title already on-pattern `fix(telemetry): the root
  opencode session runs unmanaged — zero heartbeats on the real bus despite
  live tool activity` [bug, telemetry, harness]; closing comment carries
  the design decision (the opt-in lane) + the same evidence set.
- No labels created (existing labels only); no other issue touched; **#76
  untouched** (read-only, per D-2); dependabot observe-only; no version
  moves (D-1). Register rows + CHANGELOG carry evidence pointers.

## Self-critique (3 weakest — the inherited boundaries, plus the slip)

1. **The event-ordering assumption:** the fallback attributes via the
   bus-recorded callID agent, which requires `message.part.updated` to
   precede `tool.execute.after` for the same call — the opencode event
   order observed so far, but not a contract; a reversed live order
   attributes the row "global". The D17/D20 session→god linkage filing
   (S4) tracks the class; the fixture pins the assumed order
   deterministically.
2. **The opt-in adoption:** until the user exports `OLYMPUS_ROOT_SESSION=1`
   in the launching shell — or the ROOT-LANE-ADOPT injection lands in the
   app terminal's spawn env — the live root bus stays silent BY DESIGN. The
   fix is real but dormant until adopted; the UAT is the natural first
   adopter.
3. **The push honesty, this box's outcome:** the push SUCCEEDED in-session
   (credentials present) — but the honest note is that this session's plan
   assumed that from a dry-run probe at entry; had the credentials failed
   at the real push, the bundle substitute would have been the fallback
   (R15's 2-strike path). The slip: the pair commit landed on main before
   the branch was cut — recovered ref-only with the live untouched, and the
   lesson recorded; the discipline held at close (one ff-merge, branch
   deleted).

## STATE AT END

- Frontier: main == origin/main == (this close-out commit; the QUEUE
  records the shape — re-derive at S3 E1). Battery: **21**. #69 + #77
  CLOSED with evidence. Open: exactly #67 (S3's target) + #76 (the user's
  UAT bar).
- Next: **S3 THE FOUNDRY** (#67 the Apollo project scaffold + the
  Nvidia/GLM-5.3 catalogue currency refresh — AN11/AN12 die there), from
  the QUEUE-recorded S2R close sha.

## `git status --porcelain` (verbatim, at close, before R4 restore)

```
 M opencode.json
```
