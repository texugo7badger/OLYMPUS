# FACTS LEDGER — BATCH 12c

Every claim needs: `claim | proving command | one-line output`. No ledger entry → no claim.
(Note: this file was rebuilt after the Phase-0 reset incident — the original C0-1..C0-5 rows were
re-created from the same command evidence; see WORKLOG incidents.)

## Phase 0 — sync & verify

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| C0-1 | working tree = user's opencode.json + 3 untracked B5 paths (expected state, untouched) | `git status --porcelain` | ` M opencode.json` + `?? docs/superpowers/ ?? public/landing/ ?? testimonial-section.html` |
| C0-2 | local night/12b-overnight == origin == 10d1adc (audited ref, not re-pushed) | `git rev-parse night/12b-overnight origin/night/12b-overnight` | both `10d1adcb9e5afcaaf40aee4c189965cc5d6f1179` |
| C0-3 | main == origin/main == 2bab1b3 (untouched) | `git rev-parse main origin/main` | both `2bab1b3c623166a8590c456c596ce6277373e852` |
| C0-4 | 12b branch is 15 commits ahead of base | `git rev-list --count 2bab1b3..night/12b-overnight` | `15` |
| C0-5 | issue panel reconciles with ledger (no discrepancies) | `gh issue view` loop over #23/#50/#51/#54–#59 | #50 CLOSED, #51 CLOSED, #23/#54/#55/#56/#57/#58/#59 OPEN |
| C0-6 | INCIDENT 1+2 recovery: opencode.json restored from 12b snapshot, byte-identical | `sha256sum opencode.json tmp/12b-snapshots/user-opencode-free-openrouter.snapshot.json` | both `db62995d924ab7313a66db663af7869b2e84c7f47f1a5b35eac76a09ed3c8ff3` |
| C0-7 | local 12b branch restored to audited ref after ledger-commit slip | `git rev-parse night/12b-overnight origin/night/12b-overnight` (post-reset) | both `10d1adcb9e5afcaaf40aee4c189965cc5d6f1179` |

## Phase 1 — merge 12b → main (authorized)

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| C1-1 | all 4 preconditions held before merge | verification block (see command) | origin/12b==local==`10d1adc…`; origin/main==`2bab1b3…`; count `15`; tree = opencode.json M + 3 B5 paths + my reports/12c |
| C1-2 | merge was strictly linear (ff-only) | `git merge --ff-only night/12b-overnight` | `Updating 2bab1b3..10d1adc` / `Fast-forward` (18 files, +1510/−28) |
| C1-3 | smoke on merged main: metric fixture green | `node scripts/agreement-metric.test.mjs` | exit `0` — `All fixture assertions passed` |
| C1-4 | smoke on merged main: distill self-test green | `node scripts/context-distill.mjs --self-test` | exit `0` — `All context-distill self-test assertions passed` |
| C1-5 | smoke on merged main: registry 118 on disk | `ls .opencode/prompts/agents/demigods/*/*.txt \| wc -l` | `118` |
| C1-6 | the ONE authorized main push executed | `git push origin main` | `2bab1b3..10d1adc main -> main`; main==origin/main==`10d1adcb…` |
| C1-7 | GitHub flagged 1 low-severity dependabot alert on push (disclosure) | push output | `GitHub found 1 vulnerability … (1 low) … /security/dependabot/2` |
| C1-8 | night/12c created from merged main; phase-0 ledger landed | `git checkout -b night/12c` + commit | `7aef140` on top of `10d1adc` |

## Phase 2 — P5 classifier collision fix

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| C2-1 | fix landed: god names never bare stack keywords + explicit godId precedence | `git show b139375 --stat` | 2 files, +110/−1 (task-classifier.ts + new test) |
| C2-2 | regression test 15/15 green (incl. 12b collision prompt verbatim) | `npx tsx scripts/task-classifier.test.mjs` | `All task-classifier regression assertions passed` / exit 0 |
| C2-3 | tsc + eslint green on touched files | `npx tsc --noEmit -p tsconfig.json` + eslint | both exit 0 |
| C2-4 | live probe: classification event routeTo verbatim shows the fix | probe-12c-P2.sse classification event | `routeTo verbatim: "apollo" \| domain: "planning"` (12b same-shape probe was `"hermes"`) |
| C2-5 | metric over probe window: id-joined pair is a MATCH | metric `--since <probe ts> --json` | `joined: 1 (id: 1) matches: 1 agreement: 1` — PAIR `"intent":"apollo","executed":"apollo","match":true,"join":"id","classification_id":"cls_musltzwawmzkb5"` |
| C2-6 | behavior preservation: pre-existing cascade verified by test (design→frontend, schema→database fire before integrations — noted in test comments) | test development iterations | two bad test expectations corrected during development (both were my expectation errors, not code regressions — the cascade is untouched) |

## Phases 3–7 — #58 fix, #59 fix, #55 doc pass, #60 filed, closures

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| C3-1 | #58 fix: one-shot wires firstEventAt via the same onEvent wrapper | `git show cf8ed8a` | route.ts fallbackOneShot now passes `onEvent` to makeOpenCodeLineHandler (was `send`) |
| C3-2 | #58 code-path reasoning | route.ts :628 timer gate vs :658-661 onEvent vs :416-440 handler first-line | timer fires only while firstEventAt===null; any one-shot output line now sets it → no mid-output kill |
| C3-3 | #58 live regression probe (forced one-shot path) | probe-12c-P3.sse analysis | `fallback: one-shot fallback taken` / `startup-kill fired: false` / final text `"oneshot"` — path completes end-to-end |
| C3-4 | #58 commit-message cosmetic mangle disclosed (backticks → command substitution ate the word `send`) | `git log -1 --format=%B` | "passed  directly to makeOpenCodeLineHandler" — meaning intact; left unamended per no-rewrite guardrail |
| C4-1 | #59 fix: harness records real listener PID + kills by port + asserts free | `git show a11e4ec --stat` | probe-harness.sh +79/−12 |
| C4-2 | clean cycle 1: real PID recorded, port freed | cycle transcript | wrapper 993894 / listener 993924 recorded → stop → `Port 3737 is free` → ss: FREE |
| C4-3 | clean cycle 2 (the regression cycle): no shadow, no 3738 orphan | cycle transcript | wrapper 994266 / listener 994296 → stop → 3737 FREE + `3738 FREE (no shifted orphan)` |
| C4-4 | #59 closed with evidence | `gh issue close 59` | `✓ Closed … #59` |
| C5-1 | #55 doc pass: 3 phantom names removed (10 spots), replaced with registry names | `git show 289fe31 --stat` | 3 files, +8/−8 |
| C5-2 | sweep clean post-fix (rust-build-error-specialist = legit hypothetical, exempt) | sweep script | `SWEEP CLEAN` |
| C5-3 | registry unchanged: 118 on disk | `ls …demigods/*/*.txt \| wc -l` | `118` |
| C5-4 | overlay recompiled so served descriptions match | `npm run overlay:compile` | `Overlay post-compile complete` |
| C5-5 | #55 closed with evidence | `gh issue close 55` | `✓ Closed … #55` |
| C6-1 | SSE-abort issue filed with B5 evidence, not fixed (12d/13 candidate) | `gh issue create` | `…/issues/60` |
| C7-1 | #54 closed (pre-approved) with final evidence roll-up | `gh issue close 54` | `✓ Closed … #54` |
| C7-2 | #57 closed (pre-approved) with fix + re-verification evidence | `gh issue close 57` | `✓ Closed … #57` |
| C7-3 | test-iteration disclosure: two classifier-test expectations were wrong during P2 development (design/schema words hit earlier cascade branches); fixed the expectations, not the code | test runs | final 15/15 with corrected expectations |

## Phases 8–9 — B5 disposition + validation suite

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| C9-1 | build:app EXIT 0 (after one transient retry) | `npm run build:app` → 12c-buildapp2.log | `✓ Compiled successfully in 45s` / `Finished TypeScript in 5.5s` / `[electron-postcompile] wrote …` / `EXIT: 0` |
| C9-2 | first build attempt failed on a transient-file race: the app's live-preview Firefox profiles (tmp/ffprof-*) race the standalone copy | 12c-buildapp.log tail | `copyfile … path: '…tmp/ffprof-m/192.168.0.6:+896525' … code: 'ENOENT'` — compile+TS+static-gen all PASSED before it |
| C9-3 | full npm run build (deb/tar.gz) stays skipped — EDQUOT quota, environmental (verbatim from 12b; unchanged) | — | stated verbatim in the report |
| C9-4 | fixture battery green | metric + distill + classifier tests | `All fixture assertions passed` / `All context-distill self-test assertions passed` / `All task-classifier regression assertions passed` (25/4/15, all exit 0) |
| C9-5 | attended probe stall signature (post-P5), verbatim | probe-12c-P9A3.sse final texts | "**Question 1 of a few** — one at a time, as I work toward a design you'll approve." (64 events, full exploration, question-and-wait at the gate) |
| C9-6 | unattended probe override signature (post-P5), verbatim | probe-12c-P9B2.sse | "The brainstorming skill is loaded. **Adapting its checklist to unattended mode** … Item 2 (visual companion): skipped — it requires a human … impossible unattended" — no user-question gate |
| C9-7 | provider queue latency today: nvidia pool >10-16 min (two probes died inside it; one groq test hung >75s; attended3+unattended2 got through with long windows) | opencode.log stream entries (17:31:01 first stream for a 17:15 session) + P9B MAX_RUNTIME error | "OpenCode exceeded the maximum runtime of 10 minutes." on the first unattended attempt; retry succeeded |
| C9-8 | unattended_mode telemetry still firing (marker chain post-P5) | grep live.jsonl | `…17:46:42…action:unattended_mode…no human will answer questions…` |
| C9-9 | 12c window metric: the P2 probe pair MATCHES (id-join) | metric --since 2026-10-03T16:25:00Z --json | `joined: 1 (id: 1) matches: 1 agreement: 1` — PAIR `cls_musltzwawmzkb5, intent/executed apollo/planner, match:true`; 6 unjoined classifications (P9 probe runs, no dispatches), 0 unjoined dispatches |
| C9-10 | machine clean: fixed harness killed wrapper AND real listener by port | probe-harness stop output | `Killing real listener on port 3737 (PID 17044)… Port 3737 is free` + serve on 3777 killed by exact PID |
| C9-11 | opencode.json restored byte-for-byte | sha256sum | `db62995d924ab7313a66db663af7869b2e84c7f47f1a5b35eac76a09ed3c8ff3` (== snapshot) |
| C9-12 | no listeners on 3737/3738/3740/3777 at close | ss check | `no listeners on 3737/3738/3740/3777` |

## Taxonomy pass (standing rule, retroactive)

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| T-1 | 7/10 issues already on-pattern at pass time | `gh issue view` ×10 (pre-pass) | #51/#54/#55/#56/#57/#58/#59 carried type(scope) prefixes + area labels |
| T-2 | 3 off-pattern issues fixed in one action each | `gh issue edit 23/50/60` | #23 retitled feat(dev-server)+label; #50 retitled fix(build)+created build label; #60 retitled fix(dev-server), [bug,enhancement]→[bug,dev-server] |
| T-3 | post-pass state: all 10 issues conform (1 type label + area labels matching scope) | `gh issue view` ×10 (post-pass) | verified verbatim (see report §9) |
