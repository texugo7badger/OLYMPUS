# FACTS LEDGER — BATCH 13

Every claim needs: `claim | proving command | one-line output`. No ledger entry → no claim.

## Phase 0 — verify-only baseline + branch

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| 13.0-1 | origin/main == 5a49368, zero commits beyond | `git rev-parse origin/main` + `git rev-list --count 5a49368..origin/main` | `5a4936858d…` / `0` |
| 13.0-2 | DEVIATION disclosed: origin/night/12d no longer exists (pruned — deleted on origin post-merge); the batch's assertion "origin/night/12d == origin/main" is satisfied by content: main @ 5a49368 IS the audited 12d tip | `git rev-parse origin/night/12d` | `fatal: ambiguous argument 'origin/night/12d': unknown revision` |
| 13.0-3 | pre-batch tree, verbatim | `git status --porcelain` | ` M opencode.json` + `?? docs/superpowers/ ?? public/landing/ ?? testimonial-section.html` (B5 = texugo's, untouched) |
| 13.0-4 | opencode.json Phase-0 snapshot hash (user state; NO commit touches it; restore target for Phase 9) | `sha256sum opencode.json` | `db62995d924ab7313a66db663af7869b2e84c7f47f1a5b35eac76a09ed3c8ff3` |
| 13.0-5 | baseline suites green | metric + distill + classifier + telemetry-slice + tsc | `metric: 25/25` `distill: 4/4` `classifier: 15/15` `telemetry-slice: 10/10` `tsc: 0` |
| 13.0-6 | branch created from origin/main exactly, NOT pushed | `git checkout -b night/13 origin/main` | branch @ 5a49368 |

## Phase 1 — #63 continuation inheritance

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| 13.1-1 | continuation inheritance landed (route memory map + classifyTurnWithInheritance + helpers) | `git show 3713ae2 --stat` | 3 files, +149/−3 |
| 13.1-2 | full classifier suite green incl. 14 new #63 fixtures + verbatim F3 message | `npx tsx scripts/task-classifier.test.mjs` | `All task-classifier regression assertions passed` (29 assertions) exit 0 |
| 13.1-3 | tsc + eslint green | both | exit 0 |
| 13.1-4 | F3 inheritance proven: god/class/budget inherited, fresh id, provenance reason | test lines | `F3 answer inherits routeTo/domain/budget: PASS` + `FRESH classificationId: PASS` + `provenance: PASS` |
| 13.1-5 | redirect + new-task + cold-session paths proven | test lines | all PASS (free-text redirect, structured godId=P5, new-task marker, cold session) |
| 13.1-6 | test-honesty note: the PetLove prior used in fixtures classifies as hephaestus/backend (the fixture's own prompt words 'landing page/formulário' hit backend keywords) — the assertions are RELATIVE to the prior, testing inheritance semantics, not re-deriving the original incident's athena classification | test output line | `(prior classification for the F3 conversation: {"routeTo":"hephaestus","domain":"backend","tokens":80000})` |

## Phase 2 — #61 auto-retry

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| 13.2-1 | retry landed: transient class extended + spec transcript format + loud exhaustion guidance + plan hoist | `git show 3ef01b5 --stat` | 2 files, +209/−7 |
| 13.2-2 | deterministic forced-503 fixture: 11/11 green (recovery, both retry lines, exhaustion guidance + alternatives + switch command, no parallelism, pidfile restored) | `npx tsx scripts/opencode-session.test.mjs` | `All #61 retry-fixture assertions passed` exit 0 |
| 13.2-3 | no parallel second connection asserted by the stub itself (max concurrent POST counter) | fixture S1/S2 | `max concurrent POST = 1` PASS ×2 |
| 13.2-4 | loop mechanics live-proven previously: 12b probe A5 recovered via 'Transport failure (attempt 1/3)' | 12b FACTS-LEDGER P2 (probe-2B5.sse) | the retry line appears verbatim in the 12b capture |
| 13.2-5 | one test-iteration fix disclosed: my assertion matched 'No strategy…' case-sensitively vs the message's 'NO strategy…' — fixed the matcher, not the message | test run 1 vs 2 | run 1: 10/11 → run 2: 11/11 |
| 13.2-6 | real-state hygiene: the fixture saves/restores the opencode-server pidfile verbatim (absent→absent verified); the benchmark accumulator may append one metrics row per scenario on exit (same file the 12d campaign wrote) — disclosed | post-test check | `pidfile absent` after test |

## Phase 3 — #64 round cap + autonomous parity

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| 13.3-1 | #64 landed across all four touchpoints (SKILL.md, directive, route parity, apollo prompt) | `git show 59f6de8 --stat` | 5 files, +137/−3 |
| 13.3-2 | deterministic fixture 21/21 (intent detection campaign shapes verbatim + negatives; content assertions on all three prompt-layer files) | `npx tsx scripts/autonomy-gate.test.mjs` | `All #64 autonomy-gate fixture assertions passed` exit 0 |
| 13.3-3 | classifier suite still green after the shared-module edits | `npx tsx scripts/task-classifier.test.mjs` | 29/29 |
| 13.3-4 | fixture iterations disclosed: (a) MY negative-assertion usage bug (passed `false` as cond — 3 assertions); (b) case mismatch 'Present' vs lowercase regex; (c) a REAL \b-boundary bug in the don't-ask pattern (the trailing \b could never match inside 'anything') — found BY the fixture, fixed in the pattern (don'?t ask (me )?any → don'?t ask) | test runs 1→4 | 17/21 → 21/21 |
| 13.3-5 | live-behavior evidence for the directive mechanism is pre-existing (12b probe B5 'HARD-GATE … explicitly overridden'; 12c/12d unattended probes all completed) — the #64 delta is the strengthened anti-escape clause + parity wiring, whose chain links are pinned deterministically | 12b/12c FACTS-LEDGER | — |
| 13.3-6 | a live autoescola-veloz-shaped re-probe on free-big-pickle was considered and DEFERRED to the madruga-2 campaign (guardrail: opencode.json mutation for the strategy switch + pool latency risk mid-batch; the madruga-2 driver already plans exactly this re-run as its acceptance test) | disclosed decision | — |

## Phase 4 — #62 watchdog

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| 13.4-1 | watchdog landed (nudge-abort + permission-pending + class scale + terminal renderer case) | `git show 32d8967 --stat` | 4 files, +168/−16 |
| 13.4-2 | full stub fixture 25/25 green (11 #61 + 6 S3 integration + 8 unit) | `npx tsx scripts/opencode-session.test.mjs` | `NO FAILURES` / exit 0 |
| 13.4-3 | S3 integration (env-tunable windows warn=1s stall=3s, hung POST): auto-resume after exactly ONE nudge; nudge precedes retry line; retry line carries stream_idle_timeout; sequential (max concurrent=1) | fixture output | all PASS |
| 13.4-4 | decision-table unit layer: quiet/warn/nudge-abort + permission-pending OVERRIDE + scale matrix (architectural/complex→3, simple/absent→1) | fixture U: lines | 8/8 PASS |
| 13.4-5 | fixture iterations disclosed: (a) stub POST-counter cumulative across scenarios — the hang condition never matched (S3 initially didn't stall at all); (b) the nudge phrase appears in BOTH the log line and the error string quoted by the retry line — assertion tightened to the log-only phrasing | test runs | run A: 3 FAIL → fix → all green |
| 13.4-6 | design interpretation disclosed: the 'auto-continue nudge' is implemented as the idle-abort + #61 retry-layer re-post (the automated manual-Continue! recovery — identical mechanics to what healed F1/F2/F4), bounded by the retry plan; permission waits are NEVER nudged/killed (distinct renderer-keyed state); MAX_RUNTIME stays the only hard bound | ledger | — |

## Phase 5 — #65 decision checkpointing

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| 13.5-1 | checkpointing landed (marker on all turn types + SKILL + apollo + census detector) | `git show d8140df --stat` | 5 files, +151/−4 |
| 13.5-2 | deterministic fixture 18/18 first-run green | `npx tsx scripts/checkpoint.test.mjs` | `All #65 checkpoint fixture assertions passed` exit 0 |
| 13.5-3 | census shape bug found + fixed during integration check: the mapper's tool.call carries args in tool.input, not tool.args — the deliver hook now reads input first | grep + fix + re-run | all suites green post-fix |
| 13.5-4 | kill-mid-interview resume mechanics proven at the mechanism layer: the checkpoint file survives the 'crash' and every decision recovers verbatim; the god-behavior half (append-per-round, read-on-resume) is pinned by prompt-layer content assertions — the LIVE behavioral proof is deferred to the madruga-2 resume scenarios (disclosed, consistent with the batch's deterministic-first verification note) | fixture §4 + content assertions | — |
| 13.5-5 | scope note: cross-conversation crash recovery (new-session handoff → new conversationId → old checkpoint orphaned) is NOT covered tonight — within-conversation retries/continuations are; disclosed as a 13+ follow-up | design reasoning | — |
| 13.5-6 | .olympus/ path verified gitignored (line 87: 'Olympus home … never commit') — checkpoint writes are runtime state, no repo pollution | .gitignore | — |
