# BATCH 13 — FINAL REPORT (the reliability set)

**Repo:** github.com/texugo7badger/OLYMPUS
**Base:** `origin/main` @ `5a49368` (frozen — never moved; the batch is branch-only) → **Branch:** `night/13` @ final HEAD (20 commits incl. this report; code commits in the phase table)
**Push status:** `main` **NEVER pushed** this batch (guardrail held). `night/13` pushed **ONCE** at close. The `night/13 → main` merge is **auditor-gated** — not performed.
**Mode:** phase-gated, no questions. One session interruption (Phase-9 build) disclosed. opencode.json untouched all batch (Phase-0 snapshot `db62995d…` never consumed — verified at close).

---

## 1. Phase table

| Phase | Status | Commit(s) | One-line evidence |
|-------|--------|-----------|--------------------|
| 0 — baseline + branch | DONE | (ledger 010f0f4-) | origin/main == 5a49368, 0 beyond; all 5 baseline suites green; branch from origin/main exactly; **deviation:** origin/night/12d pruned post-merge (content lives in main @ 5a49368) |
| 1 — #63 continuation inheritance | DONE | 3713ae2 | 29/29 classifier suite (14 new fixtures incl. verbatim F3 message; redirect/new-task/cold paths proven) |
| 2 — #61 auto-retry | DONE | 3ef01b5 | deterministic forced-503 fixture: recovery after two 503s, both retry lines in-transcript, exhaustion guidance w/ alternatives, max concurrent POST === 1 |
| 3 — #64 round cap + autonomous parity | DONE | 59f6de8 | 21/21 autonomy-gate fixture (intent detection + content assertions on all three prompt-layer files); a real \b bug found BY the fixture |
| 4 — #62 watchdog nudge | DONE | 32d8967 | 33/33 fixture: stalled run auto-resumes after exactly one nudge, nudge→retry ordering, permission-pending override, 8-assertion decision-table unit |
| 5 — #65 decision checkpointing | DONE | d8140df | 18/18 fixture: detector matrix, marker on all turn types, kill-mid-interview resume recovers every decision verbatim |
| 6 — #60 SSE-abort bound | DONE | d064592 | 33/33 fixture (S4/S5): /abort provably lands after grace, exact abandoned payload meta, unattended immediate; a fire-and-forget race found by the fixture and fixed |
| 7 — RLM P2 findings at fold-back | DONE (not demoted) | 877c951 | 6/6 fixture: last-write-wins, 2000-char slice, null compat, orphan safety, hook wiring |
| 8 — ride-alongs | DONE | 74a7d85 (#66), a0f79a2 (N3), 1d44304 (N6), cc1b04d (#68/D3) | GO-limits table refreshed per issue body; --help; AGENTS.md taxonomy section; PWD pin with /proc dirtest PASS |
| 9 — validation + closures + push | DONE | (this report) | 8 suites green (146 assertions total), tsc ×3 green, build per EDQUOT protocol, machine clean, 8 closures with evidence, single branch push |

---

## 2. Per-phase detail (what changed + proof)

### Phase 1 — #63 (3713ae2, +149/−3)

`src/lib/task-classifier.ts` gains `classifyTurnWithInheritance` + helpers (new-task markers, free-text god redirects, `inheritClassification` with fresh id + provenance reason); the route gains a bounded conversation→classification memory (512, server-lifetime; restart = cold by design). The PetLove F3 approval turn is fixture 8a verbatim; the fixture's prior classifies hephaestus/backend (its own prompt words) — assertions are RELATIVE, proving inheritance semantics (test-honesty note in the ledger).

### Phase 2 — #61 (3ef01b5, +209/−7)

The pre-existing #39 retry loop absorbs the full #61 transient class (`provider_overloaded`, `stream_idle_timeout` join 429/500/502/503/504); transcript lines lead `retry N/2: upstream <code>`; exhaustion fails loudly with #56-style guidance (alternatives + apply-strategy command; never auto-switches). Fixture: a local stub serve adopted via the REAL #57 pidfile path, mode-flag error injection — **zero live dependencies**. Loop mechanics live-proven in 12b (probe A5).

### Phase 3 — #64 (59f6de8, +137/−3)

Four prompt-layer links: SKILL.md round cap (simple 1–2 rounds → declared defaults; architectural exempt; no-questions parity; ABSOLUTE unattended override); the UNATTENDED_DIRECTIVE strengthened against the campaign's FC-4 escape shape (autoescola-veloz: "I'll present a design before implementing" → stop, 0 files, 913 tok); route parity (`noQuestionsIntent` → same directive strength); apollo prompt contract. The fixture FOUND a real `\b`-boundary bug in the don't-ask pattern (the trailing `\b` could never match inside "anything") — fixed. The live autoescola-veloz-shaped re-run is planned as the madruga-2 acceptance test (disclosed).

### Phase 4 — #62 (32d8967, +168/−16)

Watchdog: at stall → ONE nudge = abort with `stream_idle_timeout` → the #61 layer re-posts same-session (the automated F5/F6 "Continue!"); permission-pending (latest visible part = tool awaiting approval) = DISTINCT `permission_pending` event, never nudged/killed (MAX_RUNTIME the only bound); idle budget class-scaled 3x for complex/architectural (threaded from the route's classification). Pure `watchdogDecision` + `complexityScale` exported; the fixture drives the real loop via env-tuned windows (never production-budget sleeps). Terminal renders `permission_pending` as its own message kind.

### Phase 5 — #65 (d8140df, +151/−4)

`[OLYMPUS-SESSION <conversationId>]` marker on ALL turn types → `.olympus/sessions/<id>.decisions.md` (gitignored runtime tree; B5 untouched); SKILL + apollo carry append-per-round + read-on-resume; `checkpointWriteTarget` (pure) feeds the attempt census (`checkpoint_writes` + per-write log). Integration check found the mapper carries tool args in `tool.input` (not `.args`) — fixed. Cross-conversation crash recovery disclosed as a follow-up.

### Phase 6 — #60 (d064592, +145/−1)

Client-gone → grace (`OLYMPUS_ABORT_GRACE_MS`, 10s default; unattended = 0) → `POST /session/<id>/abort` (the opencode SDK's in-flight prompt abort) → the result carries the `{session_id, last_event_ts, grace_ms}` payload → the route emits `run_abandoned` to the activity feed (the client is gone; the feed is the witness). The fixture found a fire-and-forget race (the abort POST not provably landed before return) — fixed by awaiting the server abort before controller teardown. STOP agency untouched for connected clients.

### Phase 7 — RLM P2 (877c951, +96)

`recordDispatchFinding` (tracker) + text-part capture in the message.part.updated handler → `findings_summary` on dispatch_outcome (≤2000 chars, null compat, orphan-safe). Attribution by `info.agent` → most-recent open dispatch; last-write-wins per the memo's own spec; live-shape proof deferred to madruga-2 dispatch scenarios (disclosed).

### Phase 8 — ride-alongs

- **#66** (74a7d85): GO-limits table per the issue body — corrected DeepSeek 65,000/5,200, Grok 4.7/4.6 @845, added the two unlimited-free rows + expiry caveat, LongCat-2.0, availability list, dollar-limit percentages, DeepSeek peak windows. No web access.
- **N3** (a0f79a2): `telemetry-slice.mjs --help` — full usage + flags + the timestamp-parsing note; self-test still 10/10.
- **N6** (1d44304): AGENTS.md gains the taxonomy standing rule verbatim.
- **#68/D3** (cc1b04d): `spawnOpencode` pins `env.PWD = cwd` (extraEnv override preserved); deterministic /proc dirtest: mismatched parent PWD → child env PWD == spawn cwd. PASS.

---

## 3. Validation outputs (verbatim, Phase 9)

```
=== ALL SUITES (146 assertions total) ===
1. metric: 25/25          5. autonomy-gate: 21/21     (new)
2. distill: 4/4           6. opencode-session: 33/33  (new: #61+ #62+ #60)
3. classifier: 29/29      7. checkpoint: 18/18        (new, +14 for #63/#65)
4. telemetry-slice: 10/10 8. findings-foldback: 6/6   (new)

root tsc --noEmit: exit 0
overlay tsc --noEmit (post overlay:compile): exit 0
build per the EDQUOT protocol: next build compile ✓ + TS ✓ + static gen 21/21 ✓ —
  finalization hit the 400s tool timeout (the 12c/12d environmental slowness;
  one session interruption during the first attempt, disclosed); electron
  tsc: exit 0; postcompile: wrote dist-electron-tsc/package.json. The
  mechanical next-env.d.ts dev→build flip was reverted (git checkout).
machine clean: no listeners on 3737/3738/3740/3777; pidfiles clean; no
  next-server / opencode serve processes. (Load-bearing for #60.)
opencode.json: db62995d924ab7313a66db663af7869b2e84c7f47f1a5b35eac76a09ed3c8ff3
  == Phase-0 baseline — untouched all batch; the snapshot was never consumed.
```

---

## 4. Self-critique (3 weakest claims, re-verified)

1. **"#63's route wiring works end-to-end"** — the pure functions are fixture-proven, but the ROUTE composition (memory + call + store) was only code-path. Re-verified by command: `grep :235-236` shows `classifyTurnWithInheritance(action, text, priorClassification)` + `rememberConversationClassification(conversationId, classification)` — both wired in the live path. CONFIRMED.
2. **"#62's class scale actually reaches the watchdog"** — the unit layer proved `complexityScale` but the attempt wiring was code-path. Re-verified: `grep :1616` shows `const SILENCE_SCALE = complexityScale(opts.complexity)` in the attempt. CONFIRMED.
3. **"#68's pin is the last word on PWD"** — re-verified: `grep :773` shows `env.PWD = cwd` after the extraEnv merge inside spawnOpencode (with the documented extraEnv.PWD override escape). Plus the /proc dirtest as the live proof. CONFIRMED.

Residual weak spots honestly held: #64/#65's god-behavior halves are prompt-layer (content-asserted; live proofs deferred to madruga-2 by design); P2's live attribution shape (delta tails) is disclosed; the #60 route-side feed emission is content-asserted (appendActivity is the app's proven writer).

---

## 5. Full disclosures

**`git status --porcelain` (verbatim, at report time):**
```
 M opencode.json
?? docs/superpowers/
?? public/landing/
?? testimonial-section.html
```
The exact Phase-0 tree: opencode.json = the user's own uncommitted state (never touched by this batch — no apply-strategy ran; sha256 == baseline at every check); the three untracked B5 paths are texugo's pending disposition — untouched per the DEFERRED list.

- **Session interruption:** one, during the Phase-9 `next build` (tool killed mid-compile; resumed fresh — the completed run's compile/TS/static-gen were green).
- **Fixture iterations (all disclosed in ledgers):** #61 one case-mismatch fix; #62 two (cumulative counter, phrase double-count); #64 three (my negative-assertion usage bug ×2, the real \b bug); P2 two (boolean-vs-string want, twice); #60 one (the fire-and-forget race — a REAL code fix); #65 one (tool.input shape). Test-writing errors were mine; two of the finds were real product bugs the fixtures earned their keep on.
- **Taxonomy retro-hygiene:** labels added/corrected in the same action as the closures (#61 +enhancement, #62 +enhancement, #63 +bug, #64 +enhancement, #65 +enhancement, #66 enhancement→documentation); all 8 titles already on-pattern.
- **No force/rebase/rewrite. No main push. No secrets.** Nothing deleted outside my own artifacts.

---

## 6. Issue actions + Taxonomy check

| Issue | Action | Post-hygiene taxonomy |
|-------|--------|----------------------|
| #60 | **CLOSED** (d064592; fixture S4/S5 verbatim) | fix(dev-server): server-side run continues after SSE client abort; watchdog never kills [bug, dev-server] |
| #61 | **CLOSED** (3ef01b5; fixture S1/S2 verbatim) | feat(dispatch): auto-retry run dispatch on transient provider failures [free-tier, **enhancement**] |
| #62 | **CLOSED** (32d8967; S3 + unit verbatim) | feat(watchdog): auto-nudge before kill + surface permission-pending state [free-tier, harness, **enhancement**] |
| #63 | **CLOSED** (3713ae2; 29/29) | fix(router): inherit session god and task class on continuation turns [free-tier, **bug**] |
| #64 | **CLOSED** (59f6de8; 21/21) | feat(brainstorming): round cap + declared defaults for simple interactive tasks [autonomy, **enhancement**] |
| #65 | **CLOSED** (d8140df; 18/18) | feat(session): checkpoint approved decisions to disk each round [harness, **enhancement**] |
| #66 | **CLOSED** (74a7d85) | docs(strategy): refresh GO plan limits table from 2026-10-03 docs [**documentation**, free-tier] |
| #68 | **CLOSED** (cc1b04d; /proc dirtest) | fix(spawn): pin PWD to spawn cwd in buildOpencodeEnv [bug, harness] |
| #67, #69 | untouched (DEFERRED to batch 14 per the batch contract) | feat(apollo): scaffold project folder… / fix(telemetry): live.jsonl blind to one-shot spawns |

**Taxonomy check:** every closure verified on-pattern first; every closing comment links commit sha + the deterministic proof output (the standing rule's §4). Retro-labeling done pre-close, logged above.

---

## 7. Merge readiness

`night/13` is a **candidate for AUD-13** — the night/13 → main merge is the auditor's call, explicitly NOT performed this batch (main still at `5a49368`). Contents: the full PetLove reliability set (#60–#65) landed and fixture-proven; RLM P2; the #66/#68/N3/N6 ride-alongs; 146 deterministic assertions across 8 suites; three prompt-layer contracts strengthened with the campaign evidence baked into their text. Deferred to 14 per contract: RLM P4, #67, #69 (D8), free-pool probe, madruga-2, B5 disposition, #25.

## 8. HOW TO TEST (auditor commands)

```bash
git checkout night/13
git log --oneline main..night/13          # 20 commits

node scripts/agreement-metric.test.mjs                 # 25/25
node scripts/context-distill.mjs --self-test          # 4/4
npx tsx scripts/task-classifier.test.mjs              # 29/29 (14 #63 fixtures)
node scripts/telemetry-slice.mjs --self-test          # 10/10
npx tsx scripts/autonomy-gate.test.mjs                # 21/21 (#64)
npx tsx scripts/opencode-session.test.mjs             # 33/33 (#61+#62+#60 — ~2min: env-tuned windows + backoffs)
npx tsx scripts/checkpoint.test.mjs                  # 18/18 (#65)
npx tsx scripts/findings-foldback.test.mjs            # 6/6 (RLM P2)
npx tsc --noEmit                                      # exit 0
node scripts/telemetry-slice.mjs --help               # N3
git show 74a7d85 -- MODEL-STRATEGIES.md               # #66 table vs issue #66 body
# #68 dirtest (uses /proc): re-run cc1b04d's test as documented in the ledger 13.8-d
```

**The branch + this report are the deliverables. main was never pushed. night/13 pushed once at close.**
