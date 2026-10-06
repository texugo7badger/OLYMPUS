# MADRUGA-GAP-1 — SESSION 1 — THE RESET — FINAL REPORT

**Branch:** `night/gap-1-s1` from main @ `a73dca6`. **Commits:** `e284dc2` (A4,
apply-noop test) + `e8743f2` (A5, N38 marker) + `8f822fa` (A6, #70 fix) +
`f1b12d9` (A7, register reconciliation) + the close-out commit (CHANGELOG +
this report + QUEUE.md). **One ff-merge to main, branch deleted, pushed.**

## ENTRY (E1–E4, all VERIFIED this session)

- **E1 — frontier:** main == `a73dca6` (log -4: a73dca6 / f382455 / 97d0e90 /
  5cb2db7) — matches the QUEUE-recorded position exactly; zero drift. Only
  `main` local + the 5 dependabot remotes (observe-only, verbatim in the
  session log).
- **E1b — R4 snapshot:** live `opencode.json` sha256
  `5d1d544100a125c9fcd9bd8e1b7c382f418f8bf2d7f435b7a99671392ac26259`
  (snapshot cp'd to `/tmp/opencode-gap-1-s1.snapshot.json`, both shas match).
- **E2 — convergence signal, standing:** budget-guard exit 0, BOTH surfaces —
  live 8/8 + generator 16/16 (verbatim in the session log); live
  `grep -c glm-52` = 0.
- **E3 — issue truth:** `gh issue list --state open` → exactly #67, #69, #70,
  #76, #77 (five; #76 ×5 comments). Labels recorded via `gh label list`
  (23 labels; R13 prep).
- **E4 — battery-19 green + tsc 0.** Session finding (disclosed): the battery
  requires `npx tsx` — several suites import `@/lib` TS sources and crash
  under plain `node` (ERR_MODULE_NOT_FOUND). My first sweep with plain `node`
  produced false crashes; the corrected invocation-of-record is `npx tsx`
  (the prior reports' own form). All 16 script suites + context-distill 4/4 +
  telemetry-slice 10/10 + tsc 0 under tsx.

## A1 — branch truth ✅

`git branch` → exactly `main` (+ the new night branch once cut). Remote:
`main` + 5 dependabot branches, observe-only, verbatim in the session log.
Zero strays; nothing to delete.

## A2 — the two empty dirs disposed ✅ (AN6-extra RESOLVED)

Verified empty FIRST (`find … -type f` = 0 on both), then
`rmdir docs/callimachus src/app/api/olympus/providers/keys` — RMDIR OK
(inherently safe; fails on non-empty). Untracked by git (empty dirs) — a
filesystem disposition + register row, no commit content.

## A3 — AN10: the residue-lane claim REFUTED — lane ALIVE, NOT removed ✅ (the honest delta)

The card's own gate fired the ALIVE branch. Verification on ALL THREE probe
surfaces (2026-10-06):

1. **The live OpenRouter list** (the refresh script's own fetch path,
   `https://openrouter.ai/api/v1/models`, 464 models): exact id
   `nvidia/nemotron-3.5-lightning:free` SERVED — pricing 0/0 (genuinely
   free), context_length 1,000,000, top_provider.max_completion_tokens
   65536.
2. **The strategy's cached top-10** (`~/.olympus/free-models.json`, fetched
   2026-10-03): lightning ranked **#2** in the openrouter top lanes.
3. **The opencode binary's provider catalogue** (the L4 preflight probe,
   `opencode models openrouter`): BOTH `openrouter/nvidia/nemotron-3.5-lightning`
   and `…:free` served.

Also NOT "inert": the lane is **pinned by 6 gods** in the tracked config
(artemis, athena, dionysus, hermes, persephone, prometheus — verified by
parsing the tracked `opencode.json`). The tracked-vs-generator-table
divergence (tracked 10 lanes vs the generator's 16-lane static table) is the
already-filed **N29 path-dependence class**, NOT a dead id.

**Per the card's explicit law: ALIVE → do NOT remove; report the delta
honestly.** No stash-dance, no tracked edit. Tracked stays 10/10, live
8/8 + generator 16/16 (guard, verbatim). Register row AN10 added with the
refutation + the three probe outputs as evidence.

## A4 — AN13a: the noOp regression test persisted ✅ (battery 19 → 20)

`scripts/apply-noop.test.mjs` (commit `e284dc2`) — the SWEEP-1 S4 live proof,
now permanent:

- **Hermetic (R11):** `OLYMPUS_ROOT`/`OLYMPUS_HOME`/`HOME` all point at
  mkdtemp dirs before the first execution; the real `~/.olympus`
  (active-strategy.json mtime 2026-10-05 — pre-session, untouched) and the
  live opencode.json never touched.
- **Offline-deterministic:** `--force` escapes the free-tier key validation
  and the L4 preflight (the temp root has no node_modules probe); no
  free-models.json in the temp home → the curated table. No network.
- **Red-first, verbatim:** against the pre-N37 mutant
  (`OLYMPUS_APPLY_SCRIPT` seam, the `writeStateFile(strategy, 0, backupPath)`
  pre-97d0e90 shape) the test FAILS exactly the two N37 assertions —
  `apply-2 state carries noOp: true` (actual: undefined) + the note
  (actual: undefined) — 2 FAILURE(S), 10 passed, exit 1.
- **Green, verbatim:** against the real script — `All 12 noOp (N37) marker
  assertions passed`, exit 0. `node --check` green.

## A5 — N38: the load-bearing dead id marked ✅

Commit `e8743f2`: the comment at free-lane-generator.test.mjs's `top0` datum —
deliberate dead-id test constant (the retired D19 pin, absent from
STUB_CATALOGUE by design; the deadPrimary case depends on that absence) +
the swap rule (the day the live catalogue retires glm-5.3, swap in a fresh
dead id). **Datum UNCHANGED.** Suite green 22/22 post-comment.

## A6 — #70: the portability fix ✅ (closed post-merge)

Commit `8f822fa`: `const OLYMPUS = '/home/texugo/Projects/olympus'` →
`path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')` — the
checkpoint.test.mjs pattern, per the issue's own fix direction. Suite green:
**33 PASS / 0 FAIL** (grep-counted verbatim), exit 0. Closed via R13 with
the post-merge evidence (see Taxonomy check).

## A7 — the register reconciliation ✅ (verdicts + pointers only; history kept)

**63 register rows re-derived** (ISSUES.md 49 + GAPS.md 8 + FEAT-IDEAS.md 6)
against reality — the gate's seven checks read from source, the CHANGELOG's
landed entries cross-read, the cited reports checked:

- **CLOSED this pass (15 rows flipped/annotated):** D24 + D25 + D26 + D27 +
  D29 + D30 (the F6 exit-gate class — verified against
  project-exit-gate.mjs's checks 1 lockfile / 2 npm-ci / 3 build /
  4 dev-curl-200 / 5 symlinks / 6 imports-deps / 7 composition; D27's stale
  row now agrees with the landed CHANGELOG P-E entry — driver.mjs:76-90
  lane-level scaffold); D10 (the landed half — gate + prompt contract; the
  ruler-half → G4/AUD-2); D31 (config-side done — the live bar is #76, the
  user's UAT); N37 (CLOSED by SWEEP-1 S4 97d0e90 + persisted as suite #20);
  N38 (MARKED, datum unchanged); AN6-extra (disposed); N39-old (superseded
  by the pinned row); UAT-R1 (resolved-by-R2); F6 (RESOLVED — the gate
  landed as the (c)-both recommendation); D20 (p5 substitute landed; live
  proof → the UAT).
- **D28 SPLIT:** the malformed-syntax half is gate-covered (check 3 build);
  the duplicated-ONCHANGE half is GENUINELY UNCOVERED (a silent logic bug
  needs a form-level check the gate does not carry) → GAP-1-S4 filing.
- **OPEN → GAP-1-S4 filing (19 rows):** D11, D13, D14, D15, D17,
  D28(onChange half), N29, AUD-2, CERT-CALLIMACHUS + G1, G2, G4, G5, G7, G8
  + F1, F2, F3, F4.
- New rows: **AN10** (the refutation) + **GAP-1-S1** (this session).
- Cosmetic note (pre-existing, untouched): ISSUES.md's CERT-P1 row carries
  6 cells (an embedded pipe in its historical text) — present at HEAD
  before tonight; history is not rewritten for table aesthetics.

**Summary line: 63 rows total / 15 closed-or-annotated this pass / 19 open →
S4 filing / the rest already closed and re-verified.**

## S1 close-out

- **CHANGELOG:** entries under the single `## [Unreleased]` (verified exactly
  one stands — lines 10/52/111 are v0.0.2 / Unreleased / 0.0.1). D-1 law
  held: zero version moves.
- **Battery-20 (all green, this session):** 17 script suites (16 prior +
  apply-noop 12/12) + context-distill 4/4 + telemetry-slice 10/10 + tsc
  exit 0 — every suite exit 0 under `npx tsx`.
- **Hygiene:** `git clean -nd` → empty; R6 ports 3737/3738/3740/3777 all
  free; no pidfiles.
- **R4:** entry snapshot cp-restored over the live opencode.json at close +
  sha256-verified == `5d1d544100a125c9fcd9bd8e1b7c382f418f8bf2d7f435b7a99671392ac26259`.
  The live was NEVER committed, NEVER stashed (A3's stash-dance never fired
  — the lane was alive).
- **Guard on the live after restore:** exit 0 — live 8/8 + generator 16/16
  (verbatim, re-run).
- **Branch discipline:** exactly ONE ff-merge to main (ancestry verified:
  `git merge-base --is-ancestor origin/main night/gap-1-s1`), branch
  deleted, main pushed.
- **QUEUE.md:** updated — S1 DONE + the merge sha; S2's entry frontier
  recorded.

## Taxonomy check

- **#70 CLOSED** (R13, post-merge): title already on-pattern
  `fix(harness): opencode-session.test.mjs hardcodes /home/texugo path —
  derive root from import.meta.url` [bug, harness]; closing comment carries
  the commit sha (`8f822fa` on main) + the 33 PASS / 0 FAIL verbatim +
  the suite's battery standing. No other issue touched. #76 untouched
  (D-2 law). No labels created; existing labels only.
- Register rows + CHANGELOG entries carry evidence pointers throughout.

## Self-critique (3 weakest)

1. **The A3 refutation rests on tonight's probes only** — the live catalogue
   is a moving target: lightning could genuinely retire tomorrow and the
   tracked config's 6 god pins would then be the D19 class. The honest state:
   the auditor's claim is wrong TODAY (three surfaces, verbatim); the
   drift-detector idea (the S4 filing list's #1) is the structural cure, and
   tonight's refutation makes it MORE valuable, not less.
2. **The battery invocation correction** — my first E4 sweep ran the suites
   under plain `node` and produced false crashes (masked further by a
   `tail`-pipe eating the exit codes). The battery-of-record invocation
   (`npx tsx`) is now written into QUEUE.md, but a future session could
   repeat the mistake; a `battery` npm script would pin it (candidate for the
   S4 discoveries lane).
3. **D25's export-hallucination closure is build-conditional** — the gate's
   check 3 catches missing named exports only where `next build` type-checks
   the file (it does, by default, for TS/TSX sources; JS-only benches with
   `ignoreBuildErrors`-style configs would not). The bench's own 3 lucide
   cases were in TS projects, so the closure holds for the observed class —
   but the boundary is disclosed rather than fenced.

## STATE AT END

- Frontier: main @ (the merge sha recorded in QUEUE.md).
- Battery: **20** (apply-noop the new suite; every suite green + tsc 0).
- The register agrees with the tracker: #67/#69/#77 are S2/S3 targets; #76
  is the user's UAT; #70 CLOSED with evidence. 19 rows queued for S4 filing.
- Next: **GAP-1-S2 THE PULSE** (#69 one-shot telemetry + #77 root heartbeat),
  from the QUEUE-recorded merge.

## `git status --porcelain` (verbatim, at close, before R4 restore)

```
 M opencode.json
```
