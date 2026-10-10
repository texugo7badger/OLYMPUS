# PLANO-MASTER-1 / B6e — the multisession proposal: the honest split

> The user's vision: one terminal per god; Atlas dispatching between gods; Apollo on
> planning; the approval queue in the Pantheon; the Pantheon reflecting every session and
> every god. This doc is the honest evaluation the campaign promised: what is buildable NOW
> on the foundations B2–B6 just created, what is the future arc, and why there is NO
> speculative big-bang in either list.

## What B2–B6 built (the foundations, all on disk today)

| Surface | What it carries | Cross-session? |
|---|---|---|
| `~/.olympus/active-project.json` + the `project_created` event | the active project pointer + the panel refresh (B2) | yes (global file, one writer at a time — see the honest limits) |
| The durable activity feed (`06_Activity_Feed/live.jsonl`) | every walked hop: WHO (god) + WHERE (lane) + WHICH pool + the state (B6d, opt-in) | **yes** — atomic appends, any writer, any reader |
| The HITL gates file (`05_Auto_Learning/hitl-gates.json`) | the plan-walk approval gate — the SAME record the Pantheon toast + the terminal resolve (B6c) | **yes** — global, polled every 5s |
| The hop state + telemetry (`.olympus-hop-state.json` + `-telemetry.jsonl`, per lane) | the walked/parked/resume truth — the disk carries the campaign (B3) | **yes** — any session resumes |
| The sync-map (Atlas, the single writer) | dispatches + prompts + godStates, tamper-evidenced | **yes** |
| The build-info route + the banner | WHICH build serves which terminal (B6a) | per-terminal render of a shared truth |

## Buildable NOW (the minimal slice — a follow-on batch, additive only)

1. **The "who is doing what" panel (this is #85, already OPEN).** A Pantheon panel that reads
   the activity feed per god (and/or the sync-map's godStates). Both surfaces exist and are
   written by the live product flow since B6d. The panel is a READER — no architecture
   change. This closes the user's core opacity complaint ("the Pantheon does not reflect
   other terminals / other gods") for the god-activity dimension.
2. **The sessions-by-project view.** The sync-map already records per-conversation prompts
   and dispatches with lifecycle states; a small panel renders the project's sessions
   (planning/walking/parked/done) from it. The walk states are in the hop telemetry rows.
3. **The approval queue in the Pantheon.** Already REAL: the gates file is global, the toast
   polls it, and B6c wired the product's first production gate. Multiple concurrent plans →
   multiple pending gates → the toast queue works today; a dedicated panel view is a reader.

## The future arc (the FULL vision — incremental, each step shippable)

4. **One terminal per god.** The app already has terminal TABS; each tab needs its own warm
   opencode session on the god's lane. The current session manager holds ONE warm session
   per app instance — a per-god session POOL is the real work (the warm machinery exists;
   pooling + per-tab binding is a strategy-night-class batch, not a rewrite).
5. **Atlas dispatching between gods' terminals.** The Symphony bus + the dispatch spine exist
   (L1–L5, m3r2); the missing piece is the UI fan-out: a dispatch routed to god X lands its
   narration in X's tab (the bus already carries the events; the per-tab subscription is the
   work).
6. **Apollo on planning, everywhere.** Already true in substance: the planner contract is
   inline (B5), the plan is walked by the spine (B3), the walk is gated by the user (B6c).
   The remaining piece is cosmetic: Apollo's planning terminal surfacing the DAG as it is
   walked (a reader on the hop telemetry).

## The honest limits (disclosed, not hidden)

- The ACTIVE-PROJECT POINTER is a single global file: two concurrent app instances pointing
  at different projects will fight over it (the B1 verdict (b) evidence — the 14:51
  `continue` overwrite). The minimal slice does not fix this; the fix is per-session project
  context on the request (the store already holds it per client — the pointer file is the
  persistence layer). A follow-on should thread session-scoped context before the
  multi-terminal arc leans on the pointer.
- The warm opencode server is ONE per app instance today (the session manager's `ensureServer`).
  Piece 4 above is where that changes — deliberately last, because it is the only piece that
  touches the spawn architecture.

**No speculative big-bang:** every numbered piece is additive, each shippable green, each
riding surfaces that already exist. The minimal slice (1–3) needs no new writers, no new
state, no schema changes — readers on live truths.
