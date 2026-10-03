# FACTS LEDGER — BATCH 12d

Every claim needs: `claim | proving command | one-line output`. No ledger entry → no claim.

## Phase 0 — sync & verify

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| D0-1 | working tree = user state only (opencode.json M + 3 untracked B5 paths) | `git status --porcelain` | ` M opencode.json` + `?? docs/superpowers/ ?? public/landing/ ?? testimonial-section.html` |
| D0-2 | origin/main == main == 10d1adc (untouched) | `git rev-parse origin/main main` | both `10d1adcb9e5afcaaf40aee4c189965cc5d6f1179` |
| D0-3 | origin/night/12c == night/12c == 7ce4106 | `git rev-parse origin/night/12c night/12c` | both `7ce41067b85386a5d0d513b7760d1f55a045d353` |
| D0-4 | 12c is 11 commits ahead of 10d1adc (incl. taxonomy pass) | `git rev-list --count 10d1adc..origin/night/12c` | `11` |
| D0-5 | user opencode.json state snapshotted BEFORE any mutation (12c lesson): byte-identical to the 12b baseline — NO blind window this batch | `sha256sum opencode.json` | `db62995d924ab7313a66db663af7869b2e84c7f47f1a5b35eac76a09ed3c8ff3` (== 12b/12c restore baseline) |
| D0-6 | ordering decision (disclosed): the Phase-0 ride-along commit (12c report header fix) lands as night/12d's FIRST commit, not on night/12c — committing it pre-merge would break the Phase-1 precondition `night/12c == origin == 7ce4106` (the exact 12c Phase-0 incident class, avoided by design) | reasoning + precedent (12b ride-along 10d1adc landed on the branch, not mid-merge) | — |

## Phase 1 — merge night/12c → main (authorized, one-time)

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| D1-1 | preconditions held (main==origin==10d1adc; 12c==origin==7ce4106; tree=user state+my untracked 12d reports) | verification block | single hash per branch; tree as expected |
| D1-2 | merge strictly ff-only | `git merge --ff-only origin/night/12c` | `Updating 10d1adc..7ce4106` / `Fast-forward` (9 files, +539/−22) |
| D1-3 | smoke on merged main: 3 suites green | metric + distill + classifier tests | `metric: 25/25 green` / `distill: 4/4 green` / `classifier: 15/15 green` |
| D1-4 | the ONE authorized main push executed | `git push origin main` | `10d1adc..7ce4106 main -> main`; main==origin==7ce4106 |
| D1-5 | night/12d branched from merged main | `git checkout -b night/12d` | branch @ 7ce4106 |
| D1-6 | ride-along: 12c report header pinned to 7ce4106 (11 commits). Deviation note: the file never contained the literal "4136271" (that hash appeared only in the chat paste); the header's imprecision was the unnamed "final HEAD (10 commits…)" — corrected to name 7ce4106 + true count | `grep -rn 4136271 reports/12c/` → empty + header edit | header now reads `@ final HEAD 7ce4106 (11 commits …)` |

## Phase 2 — RLM P1: budget + output-shape fields in the dispatch handoff

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| D2-1 | P1 implemented per the memo sketch (dispatch args + relay line + tracker + outcome fields + adherence) | `git diff` → commit (see below) | dispatch.ts args/message + hooks threading + tracker OpenDispatch/register/event + budget_adherence at finalize |
| D2-2 | overlay recompiled; served tool descriptions changed | `grep -c budgetTokens dist/tools/dispatch.js` + Budget line grep | `5` matches + `Budget: ${typeof budgetTokens…` present in dist |
| D2-3 | deterministic end-to-end: dispatch_outcome carries budget fields + adherence 60/100=0.6 (temp vault via OLYMPUS_VAULT; NO real feed pollution) | `OLYMPUS_VAULT=/tmp/opencode/p1-vault node /tmp/opencode/p1-verify.mjs` | 5/5 PASS: classification_id, budget_tokens=100, output_shape, budget_adherence=0.6, tokens_used |
| D2-4 | backward compat: absent args → nulls, behavior identical | `OLYMPUS_VAULT=/tmp/opencode/p1-vault node /tmp/opencode/p1-compat.mjs` | 4/4 PASS (budget_tokens/output_shape/budget_adherence/classification_id all null) |
| D2-5 | queue check before probe: provider fast today (12s round trip) | queue probe wall time | `wall: 12s` / final text "queued" |
| D2-6 | LIVE dispatch probe: god used the new args; tool relayed the budget line verbatim | probe-12d-P2.sse tool.response | `Budget: ≤100 tokens. Output shape: one-line acknowledgment. Relay both to the subtask.` |
| D2-7 | LIVE feed event carries the fields | grep budget_tokens live.jsonl | `symphony-dispatch … budget_tokens: 100 \| output_shape: "one-line acknowledgment" \| demigod: planner` |
| D2-8 | live dispatch_outcome deferred (subtask finalize pending server-side); outcome shape proven deterministically (D2-3) | grep dispatch_outcome (empty at poll time) | no outcome event yet — disclosed; deterministic driver covers the shape |
| D2-9 | interpretation disclosed: the batch's "ONE attended live dispatch probe" = run it live via the harness (vs LIVE-PROBE-SKIPPED); the run used unattended:true (12c-precedented shape, avoids gate roulette) | reasoning | — |
