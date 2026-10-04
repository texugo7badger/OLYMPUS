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
