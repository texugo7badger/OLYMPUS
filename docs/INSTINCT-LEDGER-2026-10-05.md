# INSTINCT LEDGER — 2026-10-05 (MADRUGA-3 p4: the metabolism's first real day)

## Promoted instincts (through the REAL mutation API — promoteInstinct)

### 1. apollo/landing-route-renders-http-200 (status: proven)
- **Trigger:** any landing-page / generated-project completion claim.
- **Action:** require the exit gate's dev+curl-200 step before accepting "done".
- **Evidence pointers (2, distinct):**
  1. `reports/bench-in-1/BENCH-IN-1-REPORT.md` §3 P-A/P-H (sha `38b4256a`) — 15/16 bench projects failed dev before the auditor's fixes while the byte-counting census scored them "completed".
  2. `scripts/project-exit-gate.mjs` @ `53b8a27` + `reports/fix-1/` F4 — the landed exit gate's dev+curl step caught it first-try ("Cafeteria Grão & Alma" gate PASS all-7).
- **Curation note:** two distinct sources (auditor report + landed gate); promoted by the p4 session per the written rule.

### 2. hephaestus/no-semver-or-exports-from-memory (status: proven)
- **Trigger:** any package.json write or named-import from a dependency.
- **Action:** `npm view <pkg>@<range>` / export-surface check before the write.
- **Evidence pointers (2, distinct):**
  1. `reports/bench-in-1/BENCH-IN-1-REPORT.md` §3 P-C + §9 (sha `38b4256a`) — lucide WhatsApp icons (don't exist); the auditor's OWN `clsx@^3.0.0` (nonexistent) while fixing the same class of bug.
  2. `scripts/apply-strategy.js` catalogue preflight @ `53b8a27` (D19: the registry-resolved preflight family — versions resolved against the live registry before writing) + `reports/m3r2-p1/` F3/F4.
- **Curation note:** two distinct sources (bench hallucination evidence + the landed registry-resolved preflight); the species is universal — the auditor hunting it committed it too.

## Pattern extracted from reports/m3r2-p3/M3R2-P3-REPORT.md (quoted evidence)

**Pattern: fs permission semantics defeat chmod-based failure isolation —
isolate by file-shape conflicts instead.** The p3 fixture could not make a
sync-map persist fail via `chmod 0444` (rename bypasses file permissions);
the working isolation was making the tmp target a directory (EISDIR).
Quoted evidence, verbatim from the p3 report:

> "(chmod tricks don't isolate — rename bypasses file perms; the fs lesson carried from p2.)"

Corroborating line from the same report's self-critique: the restore
mechanics lesson — "NEVER git checkout -- or git reset for restore".
Both belong to one pattern: know the filesystem primitive actually in
play before designing a probe or a restore.

## Promotion rule (as written, BEFORE executing)

A candidate promotes to proven only with **>= 2 corroborating evidence
pointers from DISTINCT reports/commits**, **a written trigger/action
pair**, and **a curation note recording who promoted and why** — never
vibes at ingest, never vibes at promotion. Single-source candidates stay
CANDIDATE (the refusal is proven verbatim in the p4 session log).
