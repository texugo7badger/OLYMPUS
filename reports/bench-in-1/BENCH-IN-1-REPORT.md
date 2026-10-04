# OLYMPUS-BENCH-IN-1 — INGEST THE BENCH EVIDENCE — REPORT

**Lane:** BENCH (separate from MADRUGA-3 parts; registers/docs only — zero
runtime-code edits, verified: the diff is two register files + this report).
**Branch:** `bench/in-1` from main @ `137828d` (Part 2 closed — the timing
gate was satisfied before this session started ingesting).
**Re-derived HEAD at report time:** `137828da8ac212a489e531eaa9dfa728aea7ca08`.

## 0. Intake

- **Key input located + recorded:** the prompt's path
  (`bench/bench-1/RELATORIO-BENCH-1.md`) did not exist; P0.3 delta — the
  report was found at `~/Downloads/RELATORIO-BENCH-1.md`, sha256
  **`38b4256aff69e506199610f1e8ea99df5b478e5e4b1637e5913fca76f1d9bbd8`**
  (126 lines, read fully). Evidence tree: `~/bench-evidence/` (16 projects ×
  literal install/dev/build/curl logs + per-project summaries). Projects:
  `~/olympus-bench/`. No `BENCH-1-PROMPT.md` file found — the in-session
  prompt IS the brief (recorded here). No notes/ FIXES.md in the received
  tree — the report's §4 carries the fixes summary verbatim.
- The evidence is EXTERNAL (the auditor's bench, Node v24/npm 11) — every
  bench-sourced claim below is REPORTED (auditor evidence), with in-repo
  localizations marked CONFIRMED (re-derived by me) vs UNCONFIRMED.

## 1. Pattern localization (the defect sources)

| Pattern | Defect source | Status |
|---|---|---|
| P-A kit-sem-casa (10/16) | Model-behavioral generation (D10: 9/9 in madruga-2) + the driver gate is POST-HOC byte-counting — `gateEvaluate` at madruga-2 sandbox `driver.mjs:138-162` (CONFIRMED by read). In-repo: NO composition contract exists in the prompt layer — `grep -rln "app/page.tsx" .opencode/prompts .opencode/skills/*/SKILL.md` → zero (CONFIRMED absence) | CONFIRMED (driver + absence) |
| P-B manifesto fantasma (7/16) | Model-behavioral (no repo code writes manifests — the models do, confirmed by the generation flow). The deterministic catch (install preflight + imports-vs-deps) does not exist anywhere in the repo — the F6 gate is the fix location | UNCONFIRMED as in-repo code; external evidence + confirmed absence of a gate |
| P-C semver/export hallucination | Model memory writing versions/exports unvalidated. In-repo doctrine EXISTS for model ids (the p1 L4 catalogue preflight) but not for package versions/exports — extending it is the fix | UNCONFIRMED as in-repo code (external evidence); doctrine anchor CONFIRMED (apply-strategy preflight) |
| P-D CSS @apply inválido (6/16) | Model-behavioral; no compile gate exists in the generation flow — `npm run build` never runs before "done" | UNCONFIRMED as in-repo code (external evidence); absence of compile gate CONFIRMED |
| P-E portability | **CONFIRMED, driver-side:** `fs.symlinkSync(path.join(OLYMPUS, '.opencode'), oc)` at madruga-2 sandbox `driver.mjs:80` — absolute symlinks into deliverables; plus the 32KB opencode.json + transcripts lane pollution (same scaffolding). Not repo code — the driver pattern is the source | CONFIRMED (driver.mjs:80) |
| P-F JSX malformado | Model-behavioral (external evidence, 5 occurrences/4 projects); deterministic catch = compile; the duplicated-onChange silent bug needs a form-level check | UNCONFIRMED as in-repo code (external evidence) |
| P-G lockfile ausente (11/16) | Model-behavioral omission; no lockfile requirement exists in any generation contract | UNCONFIRMED as in-repo code (external evidence); absence CONFIRMED |
| P-H census otimista | **CONFIRMED, driver-side:** the gate counts bytes post-run (`page.tsx=NB` at driver.mjs:138-162); madruga-1's morning-assessment scored 3 never-rendering projects "completed". The in-repo census (opencode-session.ts:1666-1730) is the #65 decision-checkpoint census — a DIFFERENT metric, correctly scoped to checkpoints; the deliverable census never existed in-repo | CONFIRMED (driver) + in-repo census correctly scoped (no conflation) |

## 2. Filed (the register is the filing — R7 ready-to-file texts)

- **D10 EXTENDED** (P-A — dedupe: the bench pattern collapses onto the
  existing D-row; extended, not duplicated): autonomy scope.
- **D24** (P-B manifest preflight) · **D25** (P-C export/semver
  validation) · **D26** (P-D CSS compile gate) · **D27** (P-E harness
  portability — driver.mjs:80) · **D28** (P-F JSX + form test) · **D29**
  (P-G lockfile) · **D30** (P-H deliverable census = HTTP 200, not file
  count — pairs with D2, extends D10). All harness/build scopes, all with
  bench-log evidence + localization + the v0.0.2-gate target.
- **F6** (FEAT-IDEAS): the deterministic generated-project exit gate —
  the v0.0.2 scope decision with the WHERE recommendation (see §4).

**Dedupe map:** P-A → D10 (extended) · P-H → D30 + D2/D10 cross-refs ·
P-E → D27 (new; no prior row — the harness scope had none) · P-B/C/D/F/G →
D24/D25/D26/D28/D29 (new; no prior rows) · vs GitHub #61-#65: no overlap
(those are retry/watchdog/checkpoint/round-cap/abort — reliability, not
generation-quality). Zero patterns dropped: 8/8 filed or mapped.

## 3. Candidate instincts (REGISTER ONLY — for Part 4 / Callimachus; no
instinct-store writes, no promotion)

1. **"A landing exists only when its route renders HTTP 200 in dev."**
   Evidence: 15/16 bench projects failed dev before the auditor's fixes;
   the byte-counting gate scored them done. Candidate trigger: any
   landing-page / generated-project completion claim; candidate action:
   require the F6 gate's dev+curl step before accepting "done".
2. **"No semver range or export name from memory — resolve against the
   live registry / real export surface before writing."**
   Evidence: lucide WhatsApp icons (don't exist); the auditor's OWN
   clsx@^3.0.0 (nonexistent) while fixing the same class of bug — the
   species is universal, not model-specific. Candidate trigger: any
   package.json write or named-import from a dependency; candidate action:
   `npm view`/export-surface check before the write.

## 4. Quality-gate decision (registered as F6)

The §7 gate, as the v0.0.2 scope decision: per generated project (~30s):
`npm ci` green → `next build` green → `next dev` + `curl /` == HTTP 200 →
zero absolute symlinks → imports-vs-deps grep. The bench estimates it
would have caught **15/16 failures automatically**.
**WHERE (open question + recommendation):** (c) BOTH — one deterministic
script, two invocation points: the harness census (replacing file-count
per D30) AND the generation flow's pre-done step (composition-first per
D24/D10). Reasoning: the harness must catch escapes (a model can declare
done wrongly — the morning-assessment proved scoring-by-file counts lies),
and the generator-side invocation gives the model the chance to fix
before fold-back instead of failing the whole run post-hoc. One script,
zero drift between the two call sites.

## 5. Taxonomy check

- Register rows filed: D24-D30 (7 new) + D10 (extended) + F6 — all carry
  `type(scope): title` ready-to-file texts + labels [bug, harness|build|
  autonomy] + bench-log AND repo/sandbox localization. Scopes used:
  harness, build, autonomy — harness/build are within the p1-extended set.
- No GitHub issues created this lane (register-only session; the D-rows
  ARE the ready-to-file texts per R7). Taxonomy of every row checked
  against the standing rule at write time.
- Runtime code: ZERO edits (verified — `git diff` is two register files
  + this report only).

## 6. Self-critique (3 weakest claims, re-verified)

1. **"P-B/C/D/F/G are UNCONFIRMED as in-repo code"** — the honest reading:
   the defect lives in MODEL BEHAVIOR during generation; the repo's
   contribution is the ABSENCE of deterministic gates. I confirmed the
   absences by grep (no composition contract, no compile gate, no
   lockfile requirement) — but absences are harder to prove than
   presences; the greps are in the session log. Held as confirmed-absence,
   external-positive.
2. **"15/16 would have been caught"** — the AUDITOR'S estimate (REPORTED,
   not re-derived by me: re-running the gate against 16 projects would
   burn the EDQUOT budget and is the v0.0.2 gate's own first act). The
   arithmetic is plausible per-pattern but I did not reproduce it.
3. **"The in-repo census is correctly scoped"** (opencode-session.ts's #65
   checkpoint census ≠ the P-H deliverable census) — verified by reading
   the census block (:1666-1730 — it counts decision-checkpoint writes).
   The risk was conflating two different "censuses" into one defect;
   avoided and documented.

**`git status --porcelain` at report time (verbatim):**
```
 M docs/registers/FEAT-IDEAS.md
 M docs/registers/ISSUES.md
 M opencode.json
?? docs/superpowers/
?? public/landing/
?? testimonial-section.html
```
(`opencode.json` @ `fcaf7c13` — untouched all lane; the three untracked
paths are texugo's pending disposition, untouched.)

**Merge authorization (per the lane brief):** push `bench/in-1`, one
ff-merge to main, delete the branch.
