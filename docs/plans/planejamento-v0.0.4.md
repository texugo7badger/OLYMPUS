# OLYMPUS v0.0.4 — "Mission Control" Plan

> The user-approved plan (2026-10-18). The v0.0.3 bar was "it runs from the
> first prompt"; the v0.0.4 bar is **TOTAL VISIBILITY**: every task timed,
> every file visible and clickable, every subagent with its own thinking,
> Atlas orchestrating in plain sight, Callimachus alive, honest per-task cost.
> Built wave by wave, each wave green (tsc + eslint + build + battery) before
> the next. The GO-plan economy measurement (BENCH-2 on paid lanes) closes the
> release.

**License:** AGPL-3.0-or-later (original OLYMPUS code).

---

## The wave plan

| Wave | Scope | Gates |
|---|---|---|
| W0 | UX quick wins: version stamp, active-gods strip, chat scroll fix, collapse fix, the Tasks counter | tsc + build + manual repro |
| W1 | Live mission control: task timers/ETA, file chips (Editor Bridge), per-task tokens, subagent tasks inside the Parthenon god cards, per-agent thinking recovery, the task drill-down modal | + battery |
| W2 | Atlas the visible orchestrator (park/failure verification), Callimachus alive (#95 ROOT-LANE-ADOPT), honest Cost screen sub-agents | + battery |
| W3 | Per-god colored brain signals + the BENCH-2 GO-plan economy campaign | full close: battery + release |

## The decisions (user-approved)

1. **Atlas verification: park/failure only** — per-hop verification stays
   DETERMINISTIC-FIRST (0 tokens); the Atlas lane summarizes and decides at
   park points and failures. Apollo re-enters only on park/fail/HITL.
2. **Per-agent thinking: post-hoc recovery** — after each hop, the walker
   reads the child session's message parts via the serve API (the same
   `POST /session/{id}/message` the resume path uses); reasoning parts are
   stored with the task record. Zero risk to the walk; live streaming is a
   later candidate.
3. **The counter becomes TASKS** — the hop runtime replaced dispatch-as-tool;
   each hop IS a delegated task. TASKS counts hop starts + dispatches, and
   every row is clickable.

## W0 — the quick wins

- **W0-A (fix ui): the screen-collapse gap.** Collapsing the left dashboard
  leaves an empty strip at the left; the chat must expand full-width.
  Anchor: `src/app/page.tsx` (the RawGroup/RawPanel imperative collapse vs
  `minSize: 20`), reproduce → fix both collapse paths.
- **W0-B (feat ui): the active-gods strip.** The static "apollo active good"
  header dies; in its place the ICONS of every working god, side by side,
  blinking while they work, no names. One `useWorkingGods()` hook (the same
  15s live-feed poll the brain glow rides) feeds the terminal header, the
  Parthenon column header, and the brain — one source of truth.
- **W0-C (fix ui): the chat scroll hole.** Scrolling with the pointer
  outside the chat scrolls the page behind it and opens a hole below the
  chat. Fix: `overscroll-contain` on the chat scroller +
  `overflow-hidden` on the ancestors — the wheel never leaves the chat.
  Anchor: `interactive-terminal.tsx` (the `scrollRef` container) + `page.tsx`.
- **W0-D (feat ui): the TASKS counter.** "Delegations 0" was a lie — the
  hop runtime IS the delegation path now. The Recent Activity summary card
  becomes TASKS counting `hop` starts + dispatches; the label, the route,
  and the drill-down all agree on the semantics.
- **W0-E (chore build): the v0.0.4 stamp.** VERSION, package.json, the
  header SVG's version line, the badge.

## W1 — live mission control

- **W1-1 Task timers + ETA.** Every running task carries a live elapsed chip
  (1s tick) and an ETA from the classifier's complexity class (the same
  scale that drives the silence budgets). The chat's tool events render
  **file chips** for read/write/edit — clickable, opening the file in the
  user's editor via the **Editor Bridge** (already shipped; wire the chip).
- **W1-2 Per-task tokens.** Hop events already carry `tokensIn/tokensOut`
  (the walker's own telemetry). Each task card and the drill-down show
  tokens in/out + the derived $ cost; the Cost Dashboard gains the drill.
- **W1-3 Subagent tasks inside the god's Parthenon card.** A new
  `/api/olympus/tasks` route reads the project's dispatch-plan + hop state +
  live feed to build per-god task lists: skill equipped, MCP enabled, files
  touched, state, timer, tokens. The god card renders its live tasks; the
  user watches each demigod lane work.
- **W1-4 Per-agent thinking.** Post-hop, the walker recovers the child
  session's reasoning parts via the serve API and stores them with the task
  record (`.opencode-project/tasks/<hop>.thinking.md` — project-scoped,
  zero-residue). The task card shows "thinking…" expandable above the
  agent's writes.
- **W1-5 The drill-down modal.** Click any activity row or Parthenon task →
  the full task sheet: thinking, files created/edited (clickable), tokens
  in/out, cost, duration, skill, MCP, outcome. Nothing dead on any screen.

## W2 — the orchestra becomes visible

- **W2-1 Atlas the orchestrator.** The walker's park/failure points route
  through the Atlas lane for a verification summary (deterministic checks
  stay first and free); Apollo re-plans only on park/fail/HITL. The
  Parthenon shows Atlas working with the hop pipeline under it.
- **W2-2 Callimachus alive (#95 ROOT-LANE-ADOPT).** The app terminal's
  root session carries the Part-3 wiring (the `OLYMPUS_ROOT_SESSION=1`
  semantics) so `session.idle` fires the 7-stage brain-maintenance loop.
  Callimachus's curation (promote/archive/dedup) surfaces in the feed +
  its Parthenon card.
- **W2-3 Honest Cost screen.** The walker registers every hop in the
  dispatch registry (god, hop id, tokens) so the Cost Dashboard's
  sub-agents column counts real subagent work instead of the 0/N lie.

## W3 — the polish + the economy proof

- **W3-1 Per-god brain signals.** The working-god glow upgrades to per-god
  COLORED trails (each god its palette color), more particles when several
  gods work, a distinct pulse on delegation events.
- **W3-2 The GO-plan economy campaign (BENCH-2).** With everything stable,
  the ORBITAL benchmark runs on `go-balanced` and `go-max-quality` (the
  user's paid test): tokens, $, wall-time, hops delivered, gate results —
  the OLYMPUS economy report that feeds MODEL-STRATEGIES' quality-per-dollar
  table and the v0.0.4 release notes.

## The register (issues filed at wave start, closed with evidence)

Every wave lands as `feat(...)`/`fix(...)` commits with probe evidence;
issues close with commit + suite output per the standing taxonomy.
