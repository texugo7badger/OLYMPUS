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
