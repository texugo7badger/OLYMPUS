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
