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

## Phase 3 — RLM P3: telemetry slicer

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| D3-1 | scripts/telemetry-slice.mjs landed (zero deps, run mode + event mode, timestamp-parsed windows) + fixture | `git show <commit> --stat` | 2 new files |
| D3-2 | self-test 10/10 (window ms/s precision — the 12a NOTE-3 lesson; id filter; id-join + ts-fallback grouping; outcome+tokens; orphan; god filter) | `node scripts/telemetry-slice.mjs --self-test` | `All telemetry-slice self-test assertions passed` / exit 0 |
| D3-3 | post-cleanup regression: dead code removed (leftover finalRuns block + unreachable guard + redundant id checks), self-test still 10/10, eslint green | re-run + eslint | `self-test still 10/10 green` / `eslint green` |
| D3-4 | real-feed smoke: run-mode records correct (12c P2 pair = run with planner attached) | `telemetry-slice.mjs --since 2026-10-03T16:26:00Z` | `{"ts":"2026-10-03T16:26:44.602Z","routeTo":"apollo",…,"demigods":["planner"],…}` |
| D3-5 | event-mode smoke: live P1 dispatch event retrievable with budget fields visible | `telemetry-slice.mjs --since … --action symphony-dispatch` | event with `budget_tokens:100, output_shape:"one-line acknowledgment"` |

## Phase 4 — issue #56: free-strategy preflight + explicit fallback guidance

| # | claim | proving command | one-line output |
|---|-------|------------------|-----------------|
| D4-1 | discovery: apply-time key validation ALREADY existed incl. auth.json priority (why the user's free-openrouter apply succeeded in 12b); real gaps = no TTL check, no --force, spawn-time env-only false negative | `sed -n` of validateFreeFallbackKeys + main | priority chain auth.json → llm-providers → .env → env; hard error w/ guidance; free-models TTL silently null on stale |
| D4-2 | spawn-time preflight: structured, auth.json-first, remedy + alternatives, never auto-switches | `git diff src/lib/opencode-spawn.ts` | freeTierPreflight() replaces the bare env-only warning |
| D4-3 | spawn-time state matrix 9/9 (INFO when key located; ERROR block naming missing key + remedy + alternatives + no-auto-switch wording; alt-naming for free-nvidia-build w/ only-openrouter key) | `npx tsx /tmp/opencode/p4-spawn-matrix.mts` | 9× PASS, exit 0 |
| D4-4 | apply-time M1 (real home: keys present × cache stale): keys-present log + NEW stale-cache warning with exact refresh command, exit 0 | `node scripts/apply-strategy.js --strategy free-openrouter --dry-run` (real HOME) | `Free-tier keys present: openrouter=true, nvidia=true` + `WARNING: free-models.json is missing or older than 24h…` + `Refresh with: node scripts/apply-strategy.js --strategy free-openrouter --refresh-models` |
| D4-5 | apply-time M2 (keys absent, no force): hard ERROR + exit 1 + --force hint | `HOME=/tmp/opencode/p4-fakehome3 node … --dry-run` | exit 1; `Re-run with --force…` count 1 |
| D4-6 | apply-time M3 (keys absent + --force): exit 0 with THREE loud warnings (map-build ×2 + validation) + stale warning + dry-run completes | same + `--force` | exit 0; all warnings present; `** DRY RUN — would have made 1 change(s). Not writing. **` |
| D4-7 | M3 needed two iterations (getModelMap's inner validateFreeFallbackKeys throw escaped the first gate; second iteration wrapped the call site) — disclosed | m3.log vs m3c.log | first attempt exit 1 → root-caused → wrapped → exit 0 |
| D4-8 | apply-time M4 (keys + FRESH cache): keys present, ZERO stale warnings | fake home + fresh free-models.json | exit 0; stale-warning grep count 0 |
| D4-9 | LIVE spawn-side evidence: one-shot probe (serve killed → app-side spawn) → the new INFO preflight in the harness log; the 12b false-negative warning is GONE | kill serve → probe → `strings /tmp/olympus-probe-server.log \| grep opencode-spawn` | `[opencode-spawn] INFO: strategy 'free-openrouter' …` (full: required key found in OpenCode auth.json) |
| D4-10 | interpretation disclosed: the spawn preflight is diagnostic (structured error + guidance; spawn proceeds — no behavior gate, no auto-switch), per the batch's "fallback is EXPLICIT guidance" framing | reasoning | — |
