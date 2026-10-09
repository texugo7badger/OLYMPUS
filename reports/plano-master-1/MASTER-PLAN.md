# PLANO-MASTER-1 — fix OLYMPUS itself: the .md plan first, the build through approval gates

> **Campaign:** fix OLYMPUS ITSELF — interactivity, fluidity, quality, even on the free tier.
> **Entry boundary:** `origin/main @ 76c121c` (PREVIEW-2 close). Verified at Stage 0.
> **Absorbs:** TARDE-UAT-1 (never ran — its entire scope lives here).
> **The golden rule:** no code before this plan is approved by the user; every batch ENDS ITS
> TURN at an approval gate; state lives ON DISK, never in session context.
> **Languages:** repo artifacts English-only; the chat with the user is PT-BR; one PT-BR copy
> of this plan lives in the vault (user territory) at `02_Projects/lumina-crm/PLANO-MASTER-1-PT-BR.md`.

---

## 0. Why this campaign exists — the user's UAT (window 13:40–13:47 BRT)

Four symptoms, all real, all evidenced in `s0/`:

1. **OPACITY** — no visibility into what runs, who delegates, which god works where; the
   Pantheon does not reflect other terminals / other gods.
2. **CONTEXT** — the context window overflows and produces nothing.
3. **LOCAL** — work landed in an orphan lane instead of the vault home; no live preview.
4. **INTERACTIVITY** — the terminal narrates, asks nothing, and declares "Task completed"
   while 17 of 19 planned hops were never attempted.

The window's full reconstruction with byte-level evidence: `s0/README.md`. The auditor's
root-cause facts F1–F6 are INHERITED (not re-derived — context is the scarcest resource):

| # | The defect (paths inherited) | The cure | Batch |
|---|---|---|---|
| F1 | Orphan-lane collision: `reconcileProjectPath` (`src/lib/project-context.ts:200`, decision :231–235) — live intake note + divergent lane → `source: 'note-stale'` → the LANE wins; the dev server served the orphan (:3011); the vault saw nothing | The home created by intake in `02_Projects` WINS; a divergent lane is CONTENT to absorb — surfaced, never silenced; the preserved cases stay preserved (note-less slug → legacy lane; dead note + lane → self-heal; live fossil → surfaced) | **B2** |
| F2 | The plan is never walked: `[OLYMPUS-PLANNER]` (`src/app/api/olympus/action/route.ts:283`) makes THE PLAN the turn's deliverable; post-run = trigger → finish(0) (:886–909); no product caller of `walkPlan` | The product flow WALKS the plan after the planning turn: `walkPlan`, concurrency ≤ 3, deterministic verify between hops, park-on-exhaustion with the resume contract PRINTED; the completion line reports remaining hops / park — never "completed" | **B3** |
| F3 | Dev-server without dignity: `start()` without a deps step; the trigger waits a flat 15s (`src/lib/dev-server-trigger.ts:87`) — cold next + Tailwind does not fit (proven live: `s0/dev-server-logs/lumina-crm-*.log`, `next: not found`) | Deterministic deps BEFORE spawn (0 LLM, bounded, logged; install failure = honest refusal, never a silent probe) + growing probe patience in stages, env-overridable (#107/R3 style); the #105 refusal text stays | **B4** |
| F4 | The planner dives into source: the prompt POINTS at the schema path instead of carrying the contract | The plan-schema contract loads INLINE in `[OLYMPUS-PLANNER]` — a minimal canonical example, bounded tokens | **B5a** |
| F5 | Box forensics (where is the truth?) — three questions: does the vault folder exist (ANSWERED at Stage 0: yes, born 13:41:29, full context in `s0/vault-lumina/`); which surface does the panel read; which build served the user's terminal | Verdicts WITH PATHS, zero code | **B1** |
| F6 | The recovery line carries a stale-window flag ("benchmark window still flagged from an earlier error") | Verdict with paths — is the flag stale state, or a live window misread? | **B1** |

**What worked and stays** (the honest ledger): the intake (classified, recorded, printed,
0-LLM); #107 absorbing a real transient live; #105's honest refusal; the valid 19-hop plan
(acyclic, budgets ≤ 8192).

**Symptom → cure map:** OPACITY → B6 (banner + where/who narration + Pantheon per-god) ·
CONTEXT → B3 (small walked hops + honest parks) · LOCAL → B2 + B4 + B7 (home wins, preview
works, Lumina delivered as proof) · INTERACTIVITY → the approval gates themselves + B6c
(createGate wired so the Pantheon approves too).

---

## 1. The batch spine (the authority for Phase 2)

Protocol per batch (mandatory): pre-flight PT-BR paragraph → RED-first (test naming today's
defect → cure → GREEN) → PT-BR summary (files, RED x/y → GREEN z/z, tokens/pools/parks,
honest deviations) → ff-only merge + QUEUE row + CHANGELOG line AT MERGE → end the turn at
the gate: `⏸ AGUARDANDO APROVAÇÃO — Bn+1: <scope> (s/n)`.

### B0 — dependabot (the rust first) — budget: 2 merges

Safe→risky, groupings sanctioned: `deps safe-set` (tsx #72 + @opencode-ai/plugin #75 +
codemirror group #71 + react #73) in ONE merge, typescript-7 (#74, MAJOR — the riskiest)
ISOLATED and LAST. npm install BEFORE any battery (fresh node_modules); lock conflicts
resolved mechanically (regenerate with `npm install`); green battery AFTER EACH group.
If typescript-7 breaks (tsc/battery): honest PARK of the PR — 5.9.3 stays, PR open with an
evidence comment; the campaign is not spent on a toolchain migration. Close each PR with a
comment pointing at the merge-sha.

### B1 — F5 + F6 forensics (zero code) — budget: 1 merge (paper)

Verdicts WITH PATHS: (a) the vault folder — DONE at Stage 0, formalized here; (b) the
active-project surface — which one the panel reads (store vs vault vs route), with the
code path cited; (c) which build was serving the user's terminal at 13:40 (the R1-origin
class); (d) the F6 stale-window flag — where the flag lives, whether it was stale. Output:
`reports/plano-master-1/s1/`.

### B2 — F1, the orphan lane (RED-first) — budget: 1 merge

RED fixture = the user's EXACT case: new live intake note + orphan lane with content →
TODAY the orphan wins (the test that fails showing it). Cure: the intake home in
02_Projects wins; the divergent lane becomes absorbable content, surfaced with evidence —
the vault and the files are the USER's; absorption decisions are never silent. The three
preserved reconciliation cases stay green. Issue + evidence per house taxonomy
(`fix(autonomy)` or the matching scope; labels at creation).

### B3 — F2, wire-the-walk (RED-first) — budget: 1 merge

RED invariant, verbatim: a run whose plan has unwalked hops must NOT report "Task completed"
with `writes: 1`. Cure: the product flow walks the plan after the planning turn — `walkPlan`
(concurrency ≤ 3, `MAX_HOP_CONCURRENCY` law), deterministic verify between hops (0 LLM),
park-on-exhaustion with the resume contract PRINTED in the terminal (1 line). The
completion line becomes honest: completed hops / parked + why / next resume. Issue + evidence.

### B4 — F3, dev-server dignity (RED-first) — budget: 1 merge

RED: start() without deps + the flat 15s wait (the s0 log is the live specimen). Cure:
deterministic deps BEFORE spawn (0 LLM, bounded, logged to the trigger log; failure = the
honest refusal naming the missing step) + staged growing patience (env-overridable,
#107/R3 style — the flat 15s dies). The #105 refusal text stays verbatim. Issue + evidence.

### B5 — F4 + the thinking OBS (RED-first for (a); evidence-first for (b)) — budget: 1 merge

(a) The plan-schema contract INLINE in `[OLYMPUS-PLANNER]` — a minimal canonical example
(bounded tokens); the planner stops opening the orchestrator source.
(b) The thinking low/high/max knob investigation on the nvidia-free lanes in OpenCode:
EVIDENCE FIRST — live probe on a lane, token delta low→high; default per god wired ONLY IF
the knob is real and serializable in config; cross-link #83 (thinking burns output tokens;
the per-hop ceiling is 8192). No speculative code — the #111 precedent.

### B6 — observability + minimal multisession — budget: 1 merge

(a) Build banner at terminal startup: the git rev of the code serving the session (the R1
rider — "which build is serving" never again costs a mission).
(b) Step narration with WHERE (path) and WHO (god/pool) on every walked hop / dispatch.
(c) createGate wiring: each batch gate opens a HITL gate → the Pantheon toast already
polls (5s) → the user approves via UI OR terminal ("s"/"n" resolve the SAME gate; no state
bifurcation). HITL exists (`src/lib/hitl-gates.ts`: createGate/getPendingGates/resolveGate;
`/api/olympus/hitl/gates` route exists; the UI polls) — this is wiring, not building.
(d) The Pantheon reflects sessions per god (planning/walking/parked/done) — the MINIMAL
multisession slice.
(e) The COMPLETE multisession proposal (one terminal per god, Atlas dispatching between
gods, Apollo planning, approval queue in the Pantheon) as a doc with an honest split:
what is buildable NOW on the foundations this campaign creates vs what is future arc.
NO speculative big-bang.

### B7 — LUMINA to the user's DoD, by the cured machine — budget: 1 merge (or a declared park)

Home = `02_Projects/lumina-crm`; the orphan lane absorbed (or discarded WITH a declared
reason — never silence). The 19-hop plan WALKED through `walkPlan` (replan only if stale) —
NEVER hand-implemented. Deps installed BEFORE the dev server (B4's cure). DoD: `npm run
build` green + registered in the vault + probe-green + HTTP 200 + the URL in the user's
terminal. This batch IS the acceptance test of B2+B3+B4+B6 together. If the user drives
something in the lane in parallel, coordinate — never fight the user for state. Lane
choice: live anchors only (the E8 window: glm-5.3/kimi/muse alive; flash+deepseek dead —
the walk must re-probe and route around dead lanes, parking honestly if all die).

### CLOSE — budget: 1 merge

`reports/plano-master-1/CLOSE-OUT.md` ON DISK before any chat summary (#101); battery + tsc
+ guard both surfaces + sync; R4 byte-identical; frozen pair zero-diff (exception = its own
justification); 0 CJK; zero process orphans; open-set delta; QUEUE row DONE + frontier
record. The auditor re-verifies at the frontier as always; the user's clean re-run of the
full UAT (original Lumina prompt, clean terminal) is THE final gate after this campaign.

**Merge budget total: 11 of the 12 cap** (Phase 1 paper = this merge; one reserve).

---

## 2. The approval-gate protocol (the interactivity cure, in person)

- Every batch ends its turn: PT-BR summary block + `⏸ AGUARDANDO APROVAÇÃO`. "s" continues;
  "n" + instructions redirects; bare "n" parks with state saved.
- "Task completed" exists ONLY at campaign close with the DoD met. If the harness prints an
  automatic completion text mid-campaign, the final PT-BR block is the truth (awaiting
  approval of batch N; M merges spent; next step X).
- From B6c on, each gate ALSO opens a HITL gate — the same gate resolves from the Pantheon
  UI or the terminal, one state, no bifurcation. Until B6 lands, gates are terminal-only
  (honest note, not hidden).

## 3. The park/resume contract

- The campaign state lives ON DISK: this file + `QUEUE.md` + the per-project hop-state +
  `reports/plano-master-1/`. Any session, any terminal resumes by RE-READING disk.
- Parks at peak hours are EXPECTED and honest (the E8 window above is why): a park prints
  its 1-line resume contract (where the state is, what resumes, the exact command/answer).
- If a provider falls mid-batch (the 14:20 class), the batch parks; the resume re-reads disk;
  nothing is lost to context death.

## 4. Standing rules (from the house, verbatim)

English-only repo artifacts; 0 CJK in diffs (declared wording only with preserved bytes).
#105: verified ≠ claimed — every GREEN cites path. RED-first in every cure; green battery;
tsc 0. ff-only; hard cap 12 merges (less is better). No silent GO; the free pool is the
path; GO only as emergency valve. The tracker is truth: re-derive the open set before any gh
mutation. CLOSE-OUT on disk before the chat summary (#101). Honest refusal > false green —
the vault and the files are the USER's: absorption decisions surfaced with evidence, never
silent mutation. The frozen pair stays frozen (opencode.json = R4 live config +
`reports/uat-r1/SPAWN-INVOCATION.sh` — never staged). Parks at peak hours: expected,
honest, with the 1-line resume contract.

## 5. Campaign exit gates (the user's, verbatim)

1. The four symptoms DEAD with evidence: (1) banner + where/who narration + Pantheon per
   god; (2) walk wired — hops with telemetry, honest parks; (3) Lumina registered in the
   vault + lane absorbed + preview with URL; (4) THIS campaign — gates + PT-BR summaries
   working end to end — is the living proof.
2. Dependabot: merged (evidence per PR) or honestly parked with evidence.
3. Lumina DoD: green build + registered + probe-green + HTTP 200 + URL — or honest park
   with the resume contract.
4. Machine: battery + tsc + guard + sync + R4 + frozen pair + 0 CJK + zero orphans + cap.
5. CLOSE-OUT on disk; auditor re-verification at the frontier; the user's clean UAT re-run
   is THE final gate.

---

## 6. Stage 0 record (this merge) — entry gates E1–E8, verbatim

- **E1** `main` = `origin/main` = `76c121c` (PREVIEW-2 close) — boundary intact.
- **E2** `check-strategy-sync` 9/9; `glm-5.2` count in `opencode.json` = 0; budget-guard
  both surfaces GREEN in battery (FLOOR=8192; generator table 16 lanes).
- **E3** open set = exactly 23 open issues ({#76, #78–#96, #100, #101, #111}), matches the
  PREVIEW-2 close enumeration; highest ever = #112 → **next free #113**. gh was DOWN at
  recon (2 timeouts) and RECOVERED at execution — recorded honestly, no mutation made
  before re-derivation.
- **E4** battery 30/30 + tsc 0. Honest note: the sweep's first pass read 29/30 — the FAIL
  was MY harness's flat 300s per-suite timeout killing `project-exit-gate.test.mjs` at its
  tail (the suite's own 7-check GREEN had already printed); isolated re-run GREEN in 284s,
  exit 0, 9/9 assertions, zero lingering listeners. The flat-timeout-kills-honest-process
  lesson is F3's own thesis, caught by my own harness — disclosed, not hidden.
- **E5** R4 `4e6b35ac…` (33568 bytes) verified byte-identical at entry; snapshotted at
  `/tmp/opencode/plano-master-1/opencode.json.snap`.
- **E6** no listeners on the 30xx/37xx ranges; the suite's ephemeral dev ports
  self-killed (gate hygiene check PASS).
- **E7** main tree: the never-staged pair modified (opencode.json + uat-r1 SPAWN script) —
  untouched, disclosed, never staged.
- **E8** the honest afternoon window (`s0/E8-PROBE-WINDOW.txt`): glm-5.3 200/0.77s · kimi
  200/2.43s · muse 200/5.97s · flash DEAD (000@40s AND 000@80s — not the morning's
  glacial-alive class) · deepseek DEAD (6th consecutive window — the UAT's two hops died
  on this lane) · OR gemma-4 429. Window-2 of #83, the first contention-time data.

**Files this merge:** `reports/plano-master-1/` (MASTER-PLAN + s0 archive) + the QUEUE
sha-fill (PREVIEW-2 → `76c121c`, the debt paid here as the pattern demands) + this
campaign's IN PROGRESS row + the CHANGELOG line. The PT-BR digest copy lands in the vault
(user territory, `02_Projects/lumina-crm/PLANO-MASTER-1-PT-BR.md`). ZERO product code —
Phase 1 is paper; the build starts only at the user's "s".
