# PLANO-MASTER-1 / B6 — observability + the wired HITL gates: the OPACITY symptom dies

**Closes #120.** Five pieces, one merge.

## (a) The build banner (B6a) — "which build is serving" never again costs a mission

`src/app/api/olympus/build-info/route.ts` (NEW): the renderer's git rev (`git rev-parse
--short HEAD`, `null`-honest in packaged builds) + the Electron main's compile date
(`dist-electron-tsc/main.js` mtime — the main carries no rev; its build time is the honest
marker) + the version. `interactive-terminal.tsx` fetches it ONCE at mount and renders:
`OLYMPUS build — renderer rev <sha> · Electron main compiled <date> · v<version>`. The B1
verdict (c) was the driver: the user's 13:40 app was a MIXED build and no surface said so —
now both halves are named in every terminal, every startup.

## (b) The pool narration (B6b)

Every hop event now carries WHO + WHERE + WHICH POOL: `bridgeEvent` resolves the god's live
model lane (`resolveGodModelLane`) and threads it into the events + the human lines —
`Hop 'shell' started — god hephaestus · pool nvidia-deepseek/deepseek-v4.1-flash, lane /path`.
Proven in the child fixture (the fake root config carries the lanes; the assertion pins the
exact pool string).

## (c) THE WIRED HITL GATE (B6c) — task approval by the Pantheon is wiring, not wish

A FRESH plan opens the plan-walk approval gate BEFORE any dispatch (`post-run.ts`:
`phase: 'plan-walk'`, `targetFile: <lane>/dispatch-plan.json`, persisted by the EXISTING
`hitl-gates.ts` to the vault — survives restarts). The gate is ONE record with TWO windows:
- **The Pantheon toast** (existing: polls `/api/olympus/hitl/gates` every 5s);
- **The terminal question** (the existing question flow — the route sends `type:'question'`
  with the gate id + the s/n choices).
Approve/abort from EITHER surface resolves the SAME record (`resolveGate`); NO state
bifurcation. **'s'/'n' typed in the terminal** (PT-BR vocabulary included: sim/não/sigo/
parar…) hit the `resolvePlanWalkAnswer` SHORT-CIRCUIT in the route — the approving turn
resolves the gate and WALKS the plan inline in its own SSE stream, WITHOUT burning an LLM
turn on the approval word. Aborted plans stay withheld with the honest line; a RESUMED walk
skips the gate (its approval already happened for the campaign — the resume doctrine).

## (d) The cross-session hop feed (B6d)

The product flow opts in (`publishActivity: true` from the route) and every hop event lands
in the durable activity feed (`appendActivity`, atomic appends) — ANY terminal + the auditor
see who walks what, across sessions: #85's foundation (cross-link comment posted,
`issuecomment-6094288031`). The live terminal's god panel tracks working/done/parked per
god on the hop events. **Fixtures never touch the real vault**: the publish is opt-in and
the behavioral fixtures moved to a child process (below) — verified: the real vault's
`hitl-gates.json` was NEVER created during the batch.

## (e) The multisession proposal (B6e)

`b6-multisession-proposal.md` — the honest split: the minimal slice buildable NOW (readers
on surfaces that already exist: the feed, the sync-map, the gates queue) vs the full
one-terminal-per-god arc (incremental: the per-god session pool is deliberately LAST, the
only spawn-architecture piece). The honest limits disclosed: the global active-project
pointer (two concurrent instances fight over it — the B1 (b) evidence) needs session-scoped
context before the multi-terminal arc leans on it.

## RED → GREEN

RED (named): the child fixture absent/crashing on `awaitingApproval` (the gate concept did
not exist) · the pool threading absent · the activity publish absent · the route never asked
· the banner route + client fetch absent — 6 named FAILs across the two suites.

GREEN: hop-runtime FULL — the merged child fixture proves the WHOLE lifecycle at the module
seam: fresh plan → the gate (ZERO dispatches) → approve → the walk parks at the dead lane
with the RESUME contract printed (never "Task completed") → the RESUME walk completes 2/2;
abort withholds (`plan-aborted`); the no-plan lane skips honestly; the pool pinned. The
opencode-session banner pins green. **Battery 30/30 + tsc 0.**

## The honest engineering note of the batch

The gate retroactively changed the CONTRACT of the B3 fixture: an in-process fixture (no
vault isolation) would have written gate state to the REAL vault the moment the gate code
landed. Caught during the restructure BEFORE any such run (the intermediate run crashed on
a test-file syntax error — my apostrophe inside a single-quoted expectation — before
executing anything); the behavioral fixtures then moved wholesale into the
`child-post-run` process (fake vault bound at module import). The real vault was verified
untouched after the batch. The same law as ever, applied to my own harness: isolated
fixtures or no fixtures.

**Merge trail after this merge: 10 of the 12 cap.** Next at the user's gate: **B7 — LUMINA
to the DoD, by the cured machine** (the acceptance test of the whole campaign).
