# BATCH 12c — FINAL REPORT

**Repo:** github.com/texugo7badger/OLYMPUS
**Base:** merged `main` @ `10d1adc` (= 12b's audited branch, ff-merged in Phase 1) → **Branch:** `night/12c` @ final HEAD `7ce4106` (11 commits: the 10 batch commits incl. this report's, plus the taxonomy-pass addendum; per-phase hashes in the table)
**Push status:** `main` was pushed **EXACTLY ONCE** — the authorized Phase-1 ff-only merge `2bab1b3..10d1adc` per the embedded 12b auditor ruling. `night/12c` pushed at batch close. `night/12b-overnight` untouched (already on origin at the audited ref `10d1adc`; never re-pushed, never rewritten).
**Mode:** day batch, phase-gated, no questions. Two Phase-0 git incidents disclosed below.

---

## 1. Phase table

| Phase | Status | Commit(s) | One-line evidence |
|-------|--------|-----------|--------------------|
| 0 — sync & verify | DONE (2 incidents, disclosed) | 7aef140 | 12b ref == origin == `10d1adc` (15 commits); issue panel reconciled; local 12b pointer restored after my ledger-commit slip; user's opencode.json restored from the sha256-verified snapshot after `reset --hard` collateral |
| 1 — MERGE 12b → main | DONE (the one authorized main push) | f5a72f0 (ledger) | `Updating 2bab1b3..10d1adc / Fast-forward`; smoke on merged main: metric 25/25, distill 4/4, demigods 118; push `2bab1b3..10d1adc main -> main` |
| 2 — P5 collision fix | DONE | b139375, 8b3a3a3 | 12b collision prompt now classifies `routeTo:"apollo"` verbatim; live probe pair `"match":true, "join":"id"` — agreement 1.0 |
| 3 — #58 one-shot timer | DONE | cf8ed8a | one-shot wires `firstEventAt` via the same `onEvent` wrapper; code-path reasoning + forced-one-shot regression probe (no startup kill, completed) |
| 4 — #59 harness stop | DONE | a11e4ec | real listener PID recorded + kill-by-port + port-free assertion; 2 clean sequential cycles green (incl. the regression cycle, no 3738 orphan); **#59 closed** |
| 5 — #55 doc pass | DONE | 289fe31 | 3 phantom names removed (10 spots) → real registry names; sweep clean; 118/118/118 intact; **#55 closed** |
| 6 — SSE-abort issue | DONE | issue #60 | filed with B5 evidence (25+ min post-abort continuation, surprise artifacts); not fixed — 12d/13 candidate |
| 7 — closures (pre-approved) | DONE | — | **#54 closed** + **#57 closed** with final evidence comments per the embedded auditor ruling |
| 8 — B5 artifacts | DONE (documentation only) | — | untracked on disk, listed below, disposition is texugo's call; not committed, not deleted |
| 9 — validation suite | DONE | 69bed15 | build:app EXIT 0; fixtures 25/4/15; attended stall + unattended override signatures verbatim post-P5; 12c-window metric 1/1 id-joined MATCH; machine clean; opencode.json restored (sha256 `db62995d…`) |
| 10 — this report | DONE | (this commit) | — |

---

## 2. Per-phase detail

### Phase 0 — sync & verify (with two disclosed incidents)

Verified: `night/12b-overnight` local == origin == `10d1adc` (the audited ref); `main` == origin == `2bab1b3`; 15 commits; working tree = the user's `opencode.json` + the 3 untracked B5 paths. Issue panel reconciled exactly (#50/#51 closed; #23/#54/#55/#56/#57/#58/#59 open).

**INCIDENT 1 (git hygiene, self-corrected):** my Phase-0 ledger commit initially landed on `night/12b-overnight`, breaking the merge precondition (local must equal the audited ref). Corrected with `git reset --hard 10d1adc` — my own unpushed commit discarded; origin untouched.

**INCIDENT 2 (caused by the fix, disclosed):** that `reset --hard` ran with a dirty tracked file and **destroyed the user's uncommitted `opencode.json` state**. Restored byte-for-byte from the 12b snapshot (sha256 `db62995d…` verified on both sides — the last sha256-verified user state). Residual risk, stated honestly: any user edits to opencode.json made BETWEEN 12b's end and 12c's start are unrecoverable if they differed from that snapshot. The 12c Phase-0 tree matched the 12b-end restore, and the between-batches session was a branch push only — consistent with no further edits, but this is an assumption, not a proof.

### Phase 1 — the authorized merge (one-time main push)

All 4 preconditions held. Strictly linear:

```
Updating 2bab1b3..10d1adc
Fast-forward
 18 files changed, 1510 insertions(+), 28 deletions(-)
```

Post-merge smoke on `main`: `node scripts/agreement-metric.test.mjs` → **exit 0, all assertions passed**; `node scripts/context-distill.mjs --self-test` → **exit 0**; `ls .opencode/prompts/agents/demigods/*/*.txt | wc -l` → **118**. Then the ONE authorized push: `2bab1b3..10d1adc main -> main`. GitHub surfaced **1 low-severity Dependabot alert** on push (not triaged tonight — disclosed, link in the ledger). `night/12c` branched from the merged main.

### Phase 2 — P5: classifier god-name collision fix

```
b139375 fix(classifier): god names take precedence over stack keywords (#54 evidence, RLM memo P5)
 scripts/task-classifier.test.mjs | 67 +++++++++++++++++++++++++++++++++
 src/lib/task-classifier.ts     | 44 +++++++++++++++++++++++++-
```

Two mechanisms: (a) the bare `'apollo'` removed from `STACK_KEYWORDS.graphql` — replaced by the bigrams `'apollo client'` / `'apollo server'` so real Apollo-library mentions still detect the graphql stack; (b) an explicitly addressed god (structured `godId=<name>` / `god:<name>`) wins outright via `GOD_DOMAINS`, with the canonical god→domain map. All other stack behavior unchanged.

Regression test: `scripts/task-classifier.test.mjs` (zero-dep, via tsx) — **15/15**, including the 12b collision prompt verbatim (was `routeTo:"hermes"`, now `"apollo"`) and behavior-preservation spot-checks. Development note (disclosed): two of my test EXPECTATIONS were wrong during development — the words "design" and "schema" hit earlier cascade branches (frontend/database) — I fixed the expectations, not the code; the pre-existing cascade order is untouched.

**Live verification:** dispatch-forced probe with `godId=apollo` → classification event `routeTo` verbatim **"apollo"** (12b's same-shape probe said "hermes"); metric over the probe window: **1 classification, 1 dispatch, joined 1 (id: 1), matches 1, agreement 1** — the PAIR `"intent":"apollo","executed":"apollo","match":true,"join":"id"`.

### Phase 3 — #58: one-shot startup timer ignores output

```
cf8ed8a fix(action): wire firstEventAt on one-shot fallback (#58)
 src/app/api/olympus/action/route.ts | 8 +++++++-
```

`fallbackOneShot` now passes the same `onEvent` wrapper the warm path uses (which sets `firstEventAt` on the first streamed line) instead of raw `send`. The 120s startup timer can therefore no longer fire while output is flowing. Scope note (disclosed): the batch spec named `opencode-session.ts`; the flaw lives in `action/route.ts` per issue #58's own body — the commit's scope label reflects the real file. Cosmetic note: backticks in the commit message were eaten by shell command substitution ("passed  directly…") — meaning intact, left unamended per the no-rewrite guardrail.

**Verified by** code-path reasoning (timer gate at route.ts:628 fires only while `firstEventAt === null`; `onEvent` :658-661 sets it on first call; the handler invokes its callback on the first parsed/logged line) **plus** a live regression probe forcing the one-shot path (serve killed under a live pidfile → "Session setup failed (fetch failed) — using one-shot run") → **no startup kill, run completed** with the expected reply. A deterministic >120s mid-output kill proof was impractical (provider timing roulette) — stated honestly rather than simulated.

### Phase 4 — #59: harness stop kills the real server

```
a11e4ec fix(harness): stop kills real next-server by port and records real PID (#59)
 scripts/probe-harness.sh | 91 ++++++++++++++++++++++++++--------
```

`start` records the REAL listener PID via `ss` (`PID_FILE.realpid`) and warns when it is not a descendant of the wrapper (6-hop ppid walk — the stale-shadow signature). `stop` TERMs the wrapper, then kills whatever still LISTENS on the port (TERM → 5s → KILL), then asserts the port free.

**Verification — two clean sequential cycles:**
- Cycle 1: wrapper 993894 / listener 993924 recorded → stop → listener killed → `Port 3737 is free` → ss: FREE.
- Cycle 2 (the 12b regression scenario): wrapper 994266 / listener 994296 → stop → 3737 FREE **and** `3738 FREE (no shifted orphan)`.

Two verification incidents (disclosed, no repo impact): my first test command backgrounded the cycles via an unquoted `&` (interleaved attribution → re-ran cleanly); a `pkill -f` bracket-pattern still matched my own shell empirically and killed it (tool timeout) — switched to port-based kills. **#59 closed** with the cycle evidence; the fixed `stop` was also field-validated during Phase-9 cleanup (it killed the real listener and asserted free).

### Phase 5 — #55: phantom demigod names

```
289fe31 docs(registry): remove phantom demigod names from tool descriptions (#55)
 .opencode/olympus/tools/dispatch.ts                 | 8 ++++----
 .opencode/olympus/tools/shortcircuit.ts             | 4 ++--
 .opencode/olympus/tools/sub-agent-instinct-query.ts | 4 ++--
```

`verifier-code` (6 spots), `sast-scanner` (2), `mlops-engineer` (2) → replaced with real registry names (`code-verifier`, `secrets-scanner`, `tdd-guide`). Post-fix sweep: zero demigod-shaped names outside the registry (`rust-build-error-specialist` exempt — a legitimate hypothetical NEW name inside the demigod-author tool's own description). Overlay recompiled so served descriptions match. Registry 118/118/118 intact. **#55 closed.**

### Phase 6 — issue #60 filed (SSE-abort continuation)

"Server-side run continues after SSE client abort; silence watchdog warns but never kills" — labels bug+enhancement; full B5 evidence (25+ min post-abort execution, self-approved design doc, built artifacts, 2 post-abort review dispatches) + suggested directions (abort propagation with grace window, `run_abandoned` telemetry event, unattended-default abort). NOT fixed — 12d/13 candidate per the batch contract.

### Phase 7 — pre-approved closures

**#54 closed** — final evidence roll-up (implementation, id-join on both paths, fixture 25/25 reproduced by the auditor, the 12c P5 follow-on showing the key isolating the collision). **#57 closed** — fix 240be87 (auditor-reviewed in the embedded ruling) + the twice-reproduced live adoption re-verification. Both per the embedded 12b PASS ruling; nothing else was closed.

### Phase 8 — B5 artifacts disposition (documentation only)

Left **untracked on disk, not committed, not deleted**: `docs/superpowers/` (design doc marked "Self-approved (unattended run…", implementation plan), `public/landing/` (themed testimonials page), `testimonial-section.html` (root drop-in demo). These are probe-B5 evidence that the #51 mechanism works end-to-end; disposition (delete vs archive) is **texugo's call**. Also noted (already gitignored, listed for completeness): `tmp/` holds B5's verification script + screenshots alongside the user's live-preview Firefox profiles and my 12b restore snapshots.

---

## 3. Validation outputs (Phase 9)

```
build:app (retry after a transient ffprof copy-race — first attempt's compile+TS+static-gen all PASSED, then ENOENT racing tmp/ffprof-m transient files):
  ✓ Compiled successfully in 45s
  Finished TypeScript in 5.5s
  [electron-postcompile] wrote …/dist-electron-tsc/package.json
  EXIT: 0
full npm run build (incl. deb/tar.gz packaging) stays skipped — EDQUOT quota, environmental (12b finding, unchanged)

fixtures:  agreement-metric.test.mjs → 25/25, exit 0
           context-distill --self-test → 4/4, exit 0
           task-classifier.test.mjs → 15/15, exit 0

attended probe (post-P5, 1500s window, 64 events, full exploration):
  final text verbatim: "**Question 1 of a few** — one at a time, as I work toward a design you'll approve."
  (skill call confirmed: {"name":"brainstorming"})

unattended probe (post-P5, retry after one MAX_RUNTIME kill):
  verbatim: "The brainstorming skill is loaded. Adapting its checklist to unattended mode (I'll state each adaptation explicitly):
             - Item 2 (visual companion): skipped — it requires a human to view and approve a browser tab; impossible unattended.
             - Items 3, 5, 8 (question/ap…"
  zero trailing question marks in all 1746 text chars; no approval-wait phrasing

12c-window metric (--since 16:25Z):
  classifications: 7  dispatches: 1  joined: 1 (id: 1 / ts: 0)  matches: 1  agreement: 1
  PAIR {"intent":"apollo","executed":"apollo","demigod":"planner","match":true,"join":"id","classification_id":"cls_musltzwawmzkb5"}
  unjoined_classification: 6 (the P9 probe runs — no dispatches by design), unjoined_dispatch: 0

machine at close: no listeners on 3737/3738/3740/3777; pidfiles removed; opencode.json restored byte-for-byte (sha256 db62995d…)
```

**Provider conditions (disclosed, ledgered C9-7):** today's free-pool queue ran 10–16 minutes to first token (nvidia), one groq test hung >75s; probes required 1500s windows and one unattended attempt was killed by the app's 10-min MAX_RUNTIME (retry succeeded). The 12b night runs were ~8–105s by comparison.

---

## 4. Self-critique (3 weakest claims, re-verified)

1. **"The attended probe's stall signature is the brainstorming gate"** — my literal grep for "clarifying question" FAILED on this run's phrasing. Re-verified at the mechanism level: the `skill` tool call was literally `{"name":"brainstorming"}`, the run explored per the checklist, and its final turn is the question "Question 1 of a few — one at a time, as I work toward a design you'll approve." — the same gate 12b verified with different wording. CONFIRMED.
2. **"The unattended run asked nothing"** — re-verified: 1746 chars of assistant text contain ZERO trailing question marks and no approval-wait phrasing; the verbatim adaptation text explicitly skips human-approval items. CONFIRMED.
3. **"The P2 pair's match is genuine agreement"** — re-verified from the raw feed: classification `routeTo:"apollo"` + dispatch `demigod:"planner"` share `cls_musltzwawmzkb5`; planner's registry parent is apollo; the prompt explicitly instructed apollo to dispatch to planner and exactly that happened. CONFIRMED — not a routing coincidence.

Residual un-re verifiable item (carried from Phase 0, disclosed): the assumption that the user made no opencode.json edits between 12b's end and 12c's start (the snapshot restore's blind window).

---

## 5. Full disclosures

**`git status --porcelain` (verbatim, at report time):**
```
 M opencode.json
?? docs/superpowers/
?? public/landing/
?? testimonial-section.html
```

- **` M opencode.json`** — the user's own uncommitted state, restored byte-for-byte from the sha256-verified snapshot after the Phase-0 `reset --hard` incident (see Phase 0). During probing it temporarily carried `nvidia/z-ai/glm-5.3` (and briefly `groq/openai/gpt-oss-120b`) models; restored at close, sha256 `db62995d…`.
- **B5 artifacts** — untracked, listed in Phase 8, texugo's call.
- **No deletions** outside my own session artifacts (the discarded unpushed Phase-0 commit; the reset-collateral opencode.json content, recovered from snapshot). **No secrets touched.** **No force/rebase/rewrite of anything pushed.** main pushed exactly once (Phase 1, authorized).
- **Runaway probe sessions** (Phase-9 unattended run continuing server-side past deadlines) died with the serve kill at cleanup — no orphans (ss-verified).
- **GitHub Dependabot**: 1 low-severity alert on main surfaced at the merge push — not triaged (link in FACTS-LEDGER C1-7).

---

## 6. Issue actions

| Issue | Action | Link |
|-------|--------|------|
| #54 classification join key | **CLOSED** (pre-approved) — final evidence roll-up posted | …#54 |
| #57 probeServer 401 early-return | **CLOSED** (pre-approved) — fix + live re-verification roll-up | …#57 |
| #55 registry gaps | **CLOSED** — doc pass landed + sweep clean + 118/118/118 | …#55 |
| #59 harness wrapper-vs-server | **CLOSED** — fix landed + 2 clean cycles evidence | …#59 |
| #58 one-shot startup timer | **FIXED (cf8ed8a)** — remains OPEN for the auditor's close (not pre-approved; evidence: code-path reasoning + regression probe) | …#58 |
| #60 SSE-abort continuation | **FILED** — bug+enhancement labels, B5 evidence, 12d/13 candidate | …#60 |
| #56 free strategy hard-fail | untouched (OPEN — 12d/13 candidate per its body) | …#56 |
| #23 dev-server stdout | untouched (OPEN — track-only) | …#23 |
| #50, #51 | already closed in 12b — untouched | — |

---

## 7. Merge readiness

`night/12c` is a **candidate** for merging into `main` — **awaiting the next auditor ruling; not merged autonomously.** What the auditor gets: 10 commits on top of merged main (`10d1adc`), all phases DONE (none BLOCKED), four issue closures (two pre-approved + two with fresh evidence), one fix awaiting close (#58), one new filed issue (#60), fixtures 25/4/15 green, build:app green, live probe signatures verified, machine clean, user state restored sha256-verified.

---

## 8. HOW TO TEST (auditor commands)

```bash
git checkout night/12c
git log --oneline main..night/12c          # 10 commits

# Fixtures
node scripts/agreement-metric.test.mjs               # 25/25, exit 0
node scripts/context-distill.mjs --self-test         # 4/4, exit 0
npx tsx scripts/task-classifier.test.mjs             # 15/15, exit 0 — incl. the 12b collision prompt verbatim

# Build
npm run build:app                                    # EXIT 0 (full npm run build needs ~3 GB quota — EDQUOT, environmental)

# P5 live proof (needs dev server + working model strategy)
bash scripts/probe-harness.sh start                  # watch for "Real next-server listener PID … recorded"
node scripts/agreement-metric.mjs ~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl --since <any new probe ts> --json \
  | grep '"join":"id"'                               # id-joined pairs; post-P5 dispatch probes read match:true

# Harness fix (two cycles)
bash scripts/probe-harness.sh start && bash scripts/probe-harness.sh stop   # expect "Killing real listener…" + "Port 3737 is free"; repeat once more
```

**The branch + this report are the deliverables. main was pushed exactly once (the authorized Phase-1 merge). night/12c pushed at batch close.**

---

## 9. Taxonomy check (standing rule, applied retroactively at batch close)

Rule received after the report shipped; applied retroactively per its terms. Verified all 10 issues touched by 12b/12c; 7 were already on-pattern (retitled/relabeled upstream between batches), 3 were off-pattern and fixed in the same action as this report. The `build` area label was created (was missing from the label set).

| Issue | Taxonomy (post-fix) | Action taken |
|-------|---------------------|--------------|
| #23 | feat(dev-server): agent couldn't read its own dev server stdout [enhancement, dev-server] | RETITLED (was "Track: agent couldn't read its own dev server stdout") + added dev-server label |
| #50 | fix(build): next build fails — TypeScript errors in motion deps [bug, build] | RETITLED (no prefix) + created+added build label |
| #51 | feat(autonomy): Unattended runs stall at brainstorming hard-gate [enhancement, autonomy] | already on-pattern |
| #54 | feat(telemetry): classification events carry no join key for dispatch agreement [enhancement, telemetry] | already on-pattern |
| #55 | fix(registry): Demigod registry: dispatched names without prompt files (secrets-scanner uncommitted + phantom doc names) [bug, registry] | already on-pattern |
| #56 | fix(free-tier): Free strategy hard-fails with no provider key: no preflight check, no fallback [bug, free-tier] | already on-pattern |
| #57 | fix(dev-server): probeServer 401 early-return makes warm-serve adoption impossible (orphan-kill cascade) [bug, dev-server] | already on-pattern |
| #58 | fix(dev-server): One-shot fallback: 120s startup timeout never wires firstEventAt — long runs killed mid-output [bug, dev-server, harness] | already on-pattern (dev-server scope + harness as genuine secondary area for the repro evidence) |
| #59 | fix(harness): probe-harness stop kills the npm wrapper, not the next-server child — servers accumulate [bug, harness] | already on-pattern |
| #60 | fix(dev-server): server-side run continues after SSE client abort; watchdog never kills [bug, dev-server] | RETITLED (no prefix) + RELABELED (was [bug, enhancement] — two type labels; enhancement removed, dev-server added) |

Closure-evidence compliance (rule 4), verified retroactively: all six closures from 12b/12c (#50, #51, #54, #55, #57, #59) link commit SHAs plus test/probe outputs in their closing comments.

No issues were closed or commented during the taxonomy pass itself — retitle/relabel only (pre-authorized by the rule); no state changes.
