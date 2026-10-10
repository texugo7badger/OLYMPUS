# HIGIENIA-1 / H0 — the hygiene batch: the dependabot absorption + the branch pruning + the frontier fill

The repo-sanitation campaign opens. This batch: the 3 post-safe-set dependabot PRs
absorbed box-side (the B0 mechanics — lock-only, the manifest keeps its `latest`
doctrine), the merged branch fleet pruned, the PLANO-MASTER-1 frontier sha filled, and
the #74 (typescript-7) park refreshed with today's live peer evidence.

## The absorption (PRs #113 / #114 / #115)

| PR | package | from → to | class |
|---|---|---|---|
| #113 | source-map-js | 1.2.1 → 1.2.2 | transitive (lock-only) |
| #114 | http-cache-semantics | 4.2.0 → 4.3.0 | transitive (lock-only) |
| #115 | next | 16.3.7 → 16.4.0 | direct devDep (lock-only; manifest stays `latest`) |

Mechanics: `npm update source-map-js http-cache-semantics` (the transitive refresh) +
`npm install next@16.4.0 --package-lock-only`, then the manifest restored to `latest`
and the lock's ROOT range entries restored (the resolved entries keep the new versions +
integrity). Verified: the three targets in the lock; `tsc --noEmit` 0; **battery 30/30**
with the bumps live.

## The branch pruning

22 merged local branches pruned (`git branch --merged main` — the FLUENCY-1/SMOKE-1/
PREVIEW-2/PLANO-MASTER-1 fleet: `feat/109-*`, `feat/110-*`, `fix/107-*`, `fix/108-*`,
`fix/deps-*`, `fix/orphan-lane`, `fix/wire-the-walk`, `fix/dev-server-dignity`,
`fix/inline-contract`, `fix/observability-gates`, `fix/acceptance-walk`, the `night/*`
set) — the linear ff-only history means every one was already in main; the working tree
now carries exactly one local branch: `main`.

## The frontier fill

The PLANO-MASTER-1 close sha (`1414c8b`) fills its QUEUE frontier row (the house
pattern: the fill rides the next session's paper — this one).

## #74 (typescript-7) — the park refreshed (still blocked, evidence live today)

Re-probed 2026-10-10: `@typescript-eslint/escript-plugin@8.71.1` still peers
`typescript >=4.8.4 <6.1.0`; `opencode-pty@0.4.0` still peers `^5`; the `latest`
dist-tag remains 7.0.2. Nothing changed since the PLANO-MASTER-1 park — the PR stays
open with the refreshed comment. Revisit trigger unchanged: an upstream release whose
peers admit `^7`.

## The vault strays — the user's decision list (NO deletions without his word)

Surfaced at the gate for his call (user territory, never silently touched):
- `~/OLYMPUS-VAULT/02_Projects/task-completed` — a UAT-residue project folder
- the dead-UAT project folders: `exemplo-landingpage`, `exemplo-landingpage1`,
  `petshop-landingpage`, `madruga-2`, `madruga-2b`, `madruga-3`, `aime`, `continue`
  (the last two may be HIS real work — listed for his call, not assumed trash)
- `~/.local/share/olympus/workspace/`: the inert orphan lanes (`exemplo-landingpage`,
  `lumina-crm` — inert since B2; `lumina-crm.tar.xz`)

**State: battery 30/30 + tsc 0; R4 untouched; frozen pair zero-diff; 0 CJK.**
Next at the wave gate: H1 — the small-cures batch (7 issues, RED-first).
