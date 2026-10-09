# PLANO-MASTER-1 / Stage 0 — the UAT window archive (window-2 of #83)

The user's UAT run (his window: 13:40–13:47 BRT; disk timestamps: 2026-10-09, 13:41–14:41 BRT
= 16:41–17:41Z, same session continuing past his window into the 14:20 provider fall he
reported). This is the FIRST contention-time data outside the early-morning window (#83's
window-2). Nothing here is narrated from memory — every line points at a file in this
directory or an mtime in `key-mtimes.txt`.

## The four symptoms (verbatim from the user)

1. **OPACITY** — he could not tell what OLYMPUS was doing, whether Apollo delegates or does
   everything alone; the Pantheon did not reflect other terminals / other gods.
2. **CONTEXT** — the context window overflows easily and no output is produced.
3. **LOCAL** — Lumina got no vault folder on the first prompt (belief at the time); Apollo
   coded in an "orphan lane" (`~/.local/share/olympus/workspace/lumina-crm`, born 10-08
   16:18 BRT from the earlier dead UAT); no live preview; nothing in 02_Projects (belief).
4. **INTERACTIVITY** — the terminal narrates, asks nothing, and ends with "Task completed"
   without the user knowing what was built or where.

## The reconstructed timeline (every stamp from disk)

| BRT | What the disk says | Evidence |
|---|---|---|
| 13:41:29 | Intake creates `02_Projects/lumina-crm` in the vault (0-LLM, honest — the belief "no folder" was wrong; the folder EXISTS, born this second) | `.olympus-context.json` `createdAt: 16:41:29.633Z`, folder birth in `key-mtimes.txt` |
| 13:41 | Intake registers port 3011 for live preview | `.olympus-context.json` `livePreviewPort: 3011` |
| ~13:43 | The planner opens the orchestrator source to learn the plan contract (F4) | inherited from the auditor's session trace |
| 13:45 | The orphan lane is touched — the divergent lane WINS over the live note (F1) | lane `dispatch-plan.json` mtime 13:45, lane mtime in `key-mtimes.txt` |
| 13:47 | The dev-server trigger fires `next dev -p 3011` → **`sh: 1: next: not found`** — no deps step (F3, verbatim) | `dev-server-logs/lumina-crm-1791564425726.log` |
| 14:24–14:25 | Deps installed in the vault project MANUALLY (after the failure, not before) | `node_modules` mtime 14:25 |
| 14:30–14:36 | The walker is improvised as a LOCAL COPY (`walker-local.ts`, `run-hops.ts`, `plan-schema.ts` copied into the project — because the product flow never walks, F2); the 19-hop plan emitted | `dispatch-plan.json` 14:36, `walker-local.ts` 14:41 |
| 14:41:40 | TWO hops attempted (`layout-shell`, `core-components` — both hephaestus): both `parked-dispatch-failed`, `error: "exit 1"`, ~4.3s each, zero tokens — **hephaestus rides the deepseek lane, dead for 5+ consecutive probe windows** | `.olympus-hop-telemetry.jsonl`, `.olympus-hop-state.json` |
| after | The session ends its turn: **"Task completed. writes 1"** with 17 of 19 hops never attempted (F2's completion line is dishonest) | the user's terminal (his report) |

## The hard evidence per defect (F1–F6)

- **F1 (orphan-lane collision)** — `diff` of the two `dispatch-plan.json` copies: BYTE-IDENTICAL
  except `laneRoot` — vault points at `02_Projects/lumina-crm`, the lane copy points at the
  orphan. The same plan exists in two homes; the wrong home was serving the dev server (:3011
  resolved to the lane shape, `next` absent). Cure batch: **B2**.
- **F2 (the plan is never walked)** — the product flow ends the turn at the planner
  (`[OLYMPUS-PLANNER]`, `src/app/api/olympus/action/route.ts:283`; post-run: trigger →
  finish(0) at :886–909). The only walkers that exist are test harnesses + the improvised
  `walker-local.ts` copy. Telemetry: 2 attempted hops, 2 parked, 0 walked. Cure batch: **B3**.
- **F3 (dev-server without dignity)** — the trigger log verbatim: `next dev -p 3011` →
  `sh: 1: next: not found`; the trigger's flat 15s wait (`src/lib/dev-server-trigger.ts:87`)
  cannot fit a cold next + Tailwind install. Cure batch: **B4**.
- **F4 (planner dives into source)** — inherited from the auditor (the planner prompt points
  at the schema path instead of inlining the contract). Cure batch: **B5a**.
- **F5 (box forensics)** — ANSWERED IN PART HERE, verdicts with paths land in B1: the vault
  folder EXISTS (born 13:41:29, this archive carries its full context file); the panel-surface
  question and the which-build-served-me question ride B1 with evidence.
- **F6 (stale-window flag)** — inherited (the recovery line carried a stale benchmark-window
  flag); B1 records the verdict with paths.

## What WORKED and stays (the honest ledger)

- The intake: classified the prompt, created + registered the project, printed honestly —
  0 LLM, folder + note + context real on disk.
- #107 absorbed a real transient live (retry 1/4 in 5s, recovered, context preserved) —
  the user saw it work.
- #105's doctrine held — no probe, no "running" claim.
- The 19-hop plan is VALID: acyclic DAG, budgets ≤ 8192, schema-green — it was simply never
  walked by the product flow (F2, not the plan's fault).

## Contents

- `vault-lumina/` — the intake's paper trail: context, hop-state, hop-telemetry, the 19-hop
  plan, project.md (the user's original prompt, PT-BR, preserved bytes), the handoff,
  delegations listing.
- `orphan-lane/` — the lane's own copy of the plan (the F1 diff half), the listing, the lane's
  git log + status.
- `dev-server-logs/` — all five trigger records (lumina + preview-two-live + exemplo pairs).
- `key-mtimes.txt` — the birth/mtime stamps the timeline above cites.
- `E8-PROBE-WINDOW.txt` — the honest probe record of THIS afternoon window (contention data,
  #83 window-2).

The FULL plan — symptoms → cures, the batch spine B0–B7, per-PR dependabot strategy, the
approval-gate protocol, the park/resume contract — lives in `reports/plano-master-1/MASTER-PLAN.md`.
The user-facing PT-BR digest lives in the vault (`02_Projects/lumina-crm/PLANO-MASTER-1-PT-BR.md`,
user territory).
