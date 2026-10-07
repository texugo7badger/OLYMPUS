# MADRUGA-GAP-1-S3 — THE FOUNDRY — FINAL REPORT

**Branch:** `night/gap-1-s3` from main @ `5ee2933` — CUT FIRST (the S2R
lesson; the night's first code action, verified in the log). **Commits:**
`e629cfa` (C1 — the catalogue refresh: AN11 + AN12 + TOKEN-ECONOMY + README)
+ `81828b2` (C2 — the #67 scaffold law: the prompt directive + battery
suite #22 + the tracked inline via the stash-dance) + this close-out commit.
**R15:** this box has credentials — the push + the #67 close executed
in-session.

## ENTRY (E1–E4, all VERIFIED this session)

- **E1:** main == origin/main == `5ee2933` exactly (log -6: 5ee2933 /
  db47ad5 / 68fb8d2 / f1b12d9 / 8f822fa / e8743f2) — zero drift. Only `main`
  local + the 5 dependabot remotes (observe-only, verbatim in the log).
- **E1b — R4:** live sha `5d1d544100a125c9fcd9bd8e1b7c382f418f8bf2d7f435b7a99671392ac26259`
  (the standing baseline; snapshotted + recorded).
- **E2:** guard exit 0 — live 8/8 + generator 16/16 (THIS box's verbatim
  counts); live `glm-5.2` = 0.
- **E3:** exactly #67 + #76 open (#76 read-only, ×5 comments); 23 labels
  recorded. `gh issue view 67` read VERBATIM — its acceptance shape governed
  C2 (below).
- **E4:** battery-21 green + tsc 0 (telemetry-pulse 17/17 — the S2R
  certification intact).

## C1 — the model-catalogue currency (kills AN11 + AN12) ✅

**The LIVE lists, fetched + recorded verbatim FIRST** (transcripts:
`reports/gap-1/s3/nvidia-live-ids-2026-10-07.json` +
`openrouter-live-glm-2026-10-07.json`):
- **NVIDIA** (`https://integrate.api.nvidia.com/v1/models`, 80 models): the
  z-ai family serves **`z-ai/glm-5.3` + `z-ai/glm-5.3-flash` ONLY** —
  glm-5.2 is RETIRED from the endpoint. The current best coding model
  served = glm-5.3 → **the pin moves** (the expected branch; no honest
  "5.2 still best" case).
- **OpenRouter** (465 models): glm-5.2 IS still served there — but the
  coding-trio pin is the NVIDIA id (`nvidia/z-ai/glm-5.2`), so the pin is
  dead regardless; the OpenRouter glm-5.2 lane is untouched (a different
  provider surface, not pinned).

**The key finding:** the four CODE mirrors were verified ALREADY 5.3
(apply-strategy.js :319-325/:365/:716/:730; model-strategies.ts
:415-421/:830; settings-dialog.tsx :239/:365-371 — FIX-3's work stands).
Tonight's live residue was SCRIPT + DOCS only:

1. **AN11** — `scripts/refresh-free-models.js` `NVIDIA_CONTEXT_OVERRIDES`
   (the dead key at :75): the full sweep removed ALL **18** override keys
   the live list no longer serves (glm-5.2 + llama-3.3-nemotron-super-49b
   ×2, nvidia-nemotron-nano-9b-v2, deepseek-v4-pro/flash, gpt-oss-120b,
   minimax-m3/m2.7, mistral-medium ×2, stepfun ×2, thinkingmachines/inkling,
   nemotron-mini-4b, meta llama-3.1/3.3-instruct ×3) and ADDED the current
   family (`z-ai/glm-5.3` + `z-ai/glm-5.3-flash`, 1M ctx — the family's
   live OpenRouter window is 1,048,576). `node --check` green. The
   verification date + the removal record live in the block's comment.
2. **AN12** — `MODEL-STRATEGIES.md` :236-237 + the free-nvidia-build
   section: the "best coding model" prose + the fallback line + the
   "hosts GLM-5.2" / "You want GLM-5.2" lines → GLM-5.3 with the live
   verification date. **TOKEN-ECONOMY.md :121 + README :149/:154** cured in
   the same stroke (mirrors the grep found).
3. **C1.3 — stash-dance NOT needed for C1**: the tracked opencode.json
   glm-5.2 count = 0 (`git show HEAD:opencode.json | grep -c` = 0) — no
   lane changed; no dance. Disclosed with evidence.
4. **Verification sweep:** check-strategy-sync **9/9** · free-lane-generator
   **22/22** · budget-guard both surfaces exit 0.
5. **Every glm-5.2 hit dispositioned** (the grep discipline): the
   free-NVIDIA class (AN11/AN12/TOKEN-ECO/README) = FIXED; the GO/Zen
   live-provider ids (KNOWN sets + the GO/Zen card strings + pricing tables
   + the rules-file GO clause + snapshot/route defaults + command-doc
   example text) = NOT TOUCHED per the card's law; the N38 fixture datum =
   DELIBERATE, stays; the CHANGELOG/RELEASE-NOTES/register rows = historical
   records. **R7 discovery (ledgered as GO-CARD-PROSE):** the GO/Zen
   strategy-card PROSE ("Apollo: GLM-5.2", `terminalModel: 'glm-5.2'` at
   settings-dialog :415-421 + provider-settings :95-100) is STALE vs the GO
   code maps (apollo on glm-5.3/glm-5.3-flash at apply-strategy
   :175/:187/:199; opencode/glm-5.3 at :219/:241) — the rotation-incident
   class on the GO surface, not covered by the sync checker (it verifies
   model-id mirrors, not card prose). GO-plan scope → S4 filing candidate.
6. **R3 note:** the live catalogues were REACHABLE (curl, 80 + 465 models)
   — no LIVE-PROBE-SKIPPED needed tonight.

## C2 — #67: Apollo's project scaffold ✅

**The issue's own acceptance shape** (read verbatim): "a fresh project
session produces the scaffolded folder + README on its first turn;
subsequent rounds append decisions; census counts README writes." The spec:
a NEW project session (distinct task/project detected) → the project
workspace folder with README.md carrying the project description, the
chosen stack with a one-line justification per choice, and a `## Decisões`
block appended each approval round.

**The design (D16 honored — a SHORT single-action directive):** a new
`## Project Scaffold (#67)` section in
`.opencode/prompts/agents/gods/apollo.txt`, placed **directly after the
Identity paragraph — INSIDE the free inline window** (the directive starts
at char ~447 of the file; the free strategies inline the file truncated at
1000 chars — a law beyond the window is a law the free tier never sees; the
directive ends ~815, whole). Plus a one-line cross-reference in the Project
Auto-Creation section (lines 61-81, the API path): "Every project —
auto-created or not — carries the #67 scaffold README." Exact surface:
apollo.txt lines 7-9 (the section) + :86 (the cross-ref line).

**The tracked-config discovery:** the TRACKED opencode.json carries
Apollo's prompt as a 1000-char INLINE (not a `{file:}` ref) — pre-directive,
a fresh clone's free-strategy Apollo would miss the law until a re-apply.
Fixed via the **SWEEP-1 S1 stash-dance verbatim**: (a) the R4 snapshot
stood; (b) `git stash push -m "live-volatile" -- opencode.json`; (c) the
tracked inline replaced **surgically** — one line, the file's
`\uXXXX` escaping convention preserved (my first attempt re-encoded the
whole file's unicode: 37-line noise, caught in the diff review and redone
surgical — 1 insertion, 1 deletion, disclosed); the new inline ==
apply-strategy's own inlining (the file's first 1000 chars — a re-apply
produces zero drift on this field); (d) guard in-window: **10/10** lanes +
generator 16/16 + sync 9/9 (the tracked surface, as a fresh clone reads
it); (e) committed (`81828b2`); (f) the ENTRY snapshot cp-restored +
sha-verified `5d1d5441…`; the stash dropped (its content == the restored
file); (g) guard on the live again: **8/8 + 16/16**.

**The proof — battery suite #22** (`scripts/apollo-scaffold.test.mjs`),
red-first hermetic (R11: the simulated session writes only inside a
throwaway temp dir; the prompt file is read-only to the suite):
- **RED verbatim** (`reports/gap-1/s3/C2-RED-verbatim.txt`): **13 FAILURE(S)
  / 13 checked, exit 1** — no directive found → the simulated session
  produces no folder, no README, no decisions.
- **GREEN verbatim** (`C2-GREEN-verbatim.txt`): **17/17, exit 0** — the
  directive's presence, completeness (description + justified stack +
  append-only `## Decisões` + the continuation boundary), the free-window
  placement, the Auto-Creation cross-ref, and the MECHANICS by execution:
  first turn = the folder + README with all three elements + exactly ONE
  write; the second round APPENDS under `## Decisões` with the first
  round's lines intact (the prior content is a strict prefix — grown, never
  rewritten); the census: 2 writes total, one per turn.
- **The boundary, disclosed:** a deterministic fixture gates the contract's
  presence, placement and mechanics — that a LIVE model obeys the directive
  is the UAT's lane (the issue's own benchmark was the prompt-level proxy
  too).

## The discipline sweep

- **R8:** generation-contract **35/35** · autonomy-gate **21/21** ·
  checkpoint **18/18** · telemetry-pulse **17/17** · the FULL battery-22
  (19 script suites + context-distill 4/4 + telemetry-slice 10/10) all
  exit 0 · root `npx tsc --noEmit` exit 0. Nothing green regressed.
- **R12:** no compiled plugin surface changed tonight — apollo.txt is a
  runtime-file-read prompt (the dist carries no prompt text: grep
  "Project Scaffold" on `dist/olympus-hooks.js` = 0) and
  refresh-free-models.js is a script. The discipline is satisfied
  vacuously, with the grep as evidence.

## Close-out

- **Registers:** ISSUES.md gains AN11 CLOSED + AN12 CLOSED + GO-CARD-PROSE
  (the R7 discovery → S4) + the GAP-1-S3 session row. BATT-ENV /
  ROOT-LANE-ADOPT ride S4 (filed at S2R; no re-filing).
- **CHANGELOG:** the S3 block under the single `## [Unreleased]` (verified
  exactly one stands). D-1 held — zero version moves.
- **QUEUE.md:** S3 DONE + the S4 entry gate updated ("S4 verifies
  origin/main == the S3-recorded close sha before cutting `night/gap-1-s4`")
  + the S3 standing facts (battery now 22; the live-list verbatims).
- **Hygiene:** `git clean -nd` → empty; R6 ports free; no pidfiles
  (verified at close).
- **Branch discipline:** the branch was cut FIRST; ONE ff-only merge to
  main (ancestry verified), branch deleted. **R4:** the live cp-restored +
  sha-verified `5d1d5441…` — never committed, never stashed over (the
  stash-dance protected it end-to-end).
- **R13:** #67 CLOSED post-merge with the evidence (the shas, the RED/GREEN
  verbatims, the suite name, the placement proof). `gh issue list --state
  open` → exactly **#76** (the user's UAT bar).

## Taxonomy check

- **#67 CLOSED:** title already on-pattern `feat(apollo): scaffold project
  folder with description + stack per new project session` [autonomy]; the
  closing comment carries the commits (`e629cfa` + `81828b2` on main), the
  RED/GREEN transcripts, the suite, the placement + stash-dance evidence.
  No labels created; **#76 untouched** (read-only, per D-2); dependabot
  observe-only; zero version moves (D-1). Register rows + CHANGELOG carry
  evidence pointers.
- The GO-CARD-PROSE filing candidate is ledgered (NOT filed tonight — S4's
  lane files issues; tonight's R7 duty is the ready-to-file record).

## Self-critique (3 weakest)

1. **The catalogue's currency is a snapshot, not a guard:** tonight's
   verification (2026-10-07) is recorded in docs + the override block, but
   nothing MECHANICAL detects the next drift — the dead-id class will
   re-emerge when glm-5.3 eventually retires (exactly how AN11 happened
   after FIX-3's code cure). The S4 filing list's #1 (the
   model-catalogue drift detector at doctor/apply time) is the structural
   cure; tonight's sweep is the honest manual pass.
2. **The scaffold's project-detection boundary is prompt-prose, not
   mechanism:** "a distinct task/project detected — never a continuation"
   is a judgment Apollo makes per the directive's words; the fixture gates
   that the boundary is STATED, not that it is DECIDED correctly. A
   wrongly-detected "new project" scaffolds a spurious folder, and a
   missed detection skips the README — both are live-model behaviors the
   UAT must watch (the census check in the fixture is the deterministic
   half: the file must GROW, never rewrite).
3. **The tracked inline is now hand-synced state:** the stash-dance set
   the tracked apollo inline to exactly what apply-strategy would
   produce, but it is a COPY — the next prompt-file edit needs the same
   dance (or a re-apply) or the tracked inline drifts again. The D16 law
   forced the minimal prompt touch, but the inline/config coupling is a
   structural seam (the `{file:}` reference shape would kill the class —
   GO strategies use it; the free shape inlines for the token budget).

## STATE AT END

- Frontier: main == origin/main == (this close-out commit; re-derive at
  S4 E1). Battery: **22**. #67 CLOSED with evidence. Open: exactly **#76**
  (the user's stock-lane UAT bar — never touched here).
- The catalogue is current (glm-5.3-era on every free-NVIDIA surface,
  live-verified 2026-10-07); Apollo starts projects with the scaffold law;
  the tracker, the register and the docs agree.
- Next: **S4 THE FUTURE LEDGER** — the 15 issues + the R7 discoveries
  (GO-CARD-PROSE, BATT-ENV, ROOT-LANE-ADOPT, the battery-script pin) +
  ROADMAP.md + the register wiring + the campaign report.

## `git status --porcelain` (verbatim, at close, after R4 restore)

```
 M opencode.json
```
