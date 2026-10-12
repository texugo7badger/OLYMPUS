# UAT-2-FIX — the manual test's findings, cured RED-first: the lane-root pin + the conversation continuity + the honest no-plan + the banner dedup

The user's first manual test (2026-10-10, 16:28–17:09) found a REAL defect chain that the
entire PLANO-MASTER-1 campaign + HIGIENIA could not have caught — they needed the user's
hands on the real terminal. This file is the diagnosis + the cure, RED-first.

## THE CAUSAL CHAIN (the one root, five symptoms)

**ROOT: Apollo's turn does not know WHERE the project home is.** At 16:29:11 Apollo ran
`mkdir -p ~/.local/share/olympus/workspace/lumina-crm` — **the old orphan lane** — and
wrote the README + dispatch-plan.json there (16:32:06), despite HAVING SEEN the intake's
"Created project at /home/texugo/OLYMPUS-VAULT/02_Projects/lumina-crm" message. The B2
cure fixed the RESOLVER — but no prompt SURFACE carries the absolute path to the god's
head. Apollo's warm session cwd IS the workspace; "the project lane root" + cwd-the-
workspace → the old orphan-lane collision class, live again.

**THE CASCADE:**

1. **The walk looked in the RIGHT place and found nothing** — reconcile (B2) resolves the
   vault home; the plan is in the wrong place; maybeWalkThePlan takes the honest skip;
   NO GATE, NO WALK, NO SUMMARY — pure silence.
2. **"Task completed. writes 2"** — the census line prints over a 25-hop plan that will
   never walk: the B3 invariant gates on the walk summary; with NO walk at all, the
   invariant's gate never fires.
3. **The user's follow-up ("Perfeito, só me retorne quando finalizar") created the
   project 'perfeito-retorne-quando-finalizar'** (16:59:25) — the intake has NO
   conversation continuity: a control/meta message in a conversation that already has a
   project should INHERIT it, never derive a new-project name from meta-text.
4. **Apollo hand-ran the hops** (17:02–17:04, `⚙ task` per hop) — with no walk, he "helped"
   by the old path: manual hop-by-hop task dispatches, outside the walker's
   telemetry/verify/gate spine. The walk IS the product's job; a hand-run plan is a
   parallel execution system with none of the machine's laws.
5. **The 10-minute max-runtime killed the turn** (17:09) — a turn that plans + hand-executes
   exceeds the ceiling; the walk (which would carry the long work in bounded hops) never
   fired, so the monolith class returned.

**THE BONUS FINDINGS**: the banner printed twice (16:28:14 + 16:28:15 — React StrictMode
mounts the effect twice in dev); the "benchmark window still flagged" line (F6) carries no
explanation of what the flag means; the `olympus-dispatch` tool has no RAG (the #84 wiring
covered symphony-resonate only — the user's plan dispatched with no instinct context).

## THE CURES (this merge)

**U1a — THE LANE-ROOT PIN** (the root): the `[OLYMPUS-PLANNER]` marker now carries the
**ABSOLUTE path** resolved from the intake (`reconcileProjectPath(intentStage.slug)`) —
"write dispatch-plan.json to THIS ABSOLUTE PATH: `<the vault home>/dispatch-plan.json` —
at that exact path, NEVER the session cwd or any workspace lane". The inline contract's
`"laneRoot"` placeholder becomes the resolved absolute path. Apollo can no longer guess
wrong — the path is IN the prompt, twice.

**U1b — the intake's project_created message** gains the clause: "ALL project files (the
scaffold, dispatch-plan.json, and every artifact) belong at THIS absolute path, NEVER the
session cwd or any workspace lane."

**U1c — the apollo.txt scaffold directive** (the #67 prompt law) gains: "THE PROJECT HOME:
the intake's 'Created project' message names the ABSOLUTE path — every file you create
for the project (README, dispatch-plan.json, code) goes at THAT path, NEVER at the
session's cwd or any workspace lane (the session cwd is the WORKSPACE, which is not the
project home)."

**U1d — the HONEST NO-PLAN** (the silence dies): when `expectPlan` is true (the
classification said needsPlanning) and the walk finds no plan, it now sends a
`walk_summary` event: "No dispatch-plan.json found at `<path>` — this task was classified
as needing a plan, so NOTHING will walk. If the plan was written elsewhere, move it to
that exact path and resend any prompt." The 27-minute invisible skip surfaces in seconds.
The lean skip (no expectPlan) is preserved for the non-planning turns.

**U1e — the RAG rides BOTH dispatch paths**: the `olympus-dispatch` tool composes the
composer god's proven instincts into the dispatched task the same way symphony-resonate
does (the #84 wiring covered only resonate; the 16:59 specimen dispatched a 25-hop plan
with no instinct context — the #79 hop-sizing instinct never reached it).

**U2 — the CONVERSATION CONTINUITY**: a conversation that created/routed a project
REMEMBERS it; a follow-up turn inherits it — never a new-project derivation from
meta-text (the 16:59 specimen). The explicit new-task marker (`isNewTaskMarker`) breaks
the continuity for a genuinely-new project. The memory is conversation-scoped (512
conversations, bounded, restart resets — the same shape as the classification memory).

**U3a — the banner dedup**: a ref guard — the effect fires once even under StrictMode's
double mount (the 16:28:14+16:28:15 specimen).

**U3b — the F6 recovery line** carries its explanation: "(the earlier error is preserved
by design: recovery clears only what THIS turn poisoned)" — the copy no longer reads as
a stale-state mystery.

## THE PINS (hop-runtime suite, section 12 — RED-first, 6 pins)

U1: the marker carries the absolute path (`intentLaneRoot` + `THIS ABSOLUTE PATH` +
`NEVER the session cwd`) · U1: `expectPlan` threads through (`opts.classification`) ·
U1d: the honest no-plan fires (`no-plan-expected` + `NOTHING will walk` in post-run) ·
U1e: the RAG rides both dispatch tools (`instinctPriorContext` + `effectiveTask84` in
the dispatch tool) · U2: the continuity exists (`getConversationProject` +
`rememberConversationProject` + `isNewTaskMarker(text)`) · U3a: the banner ref guard.

**The PL pins updated for the new marker shape** (the ternary now carries a backtick
template — the regex accepts both quote forms).

## THE RESIDUE CLEANED (the user's word)

The spurious vault project `perfeito-retorne-quando-finalizar` + the re-created workspace
orphan lane `~/.local/share/olympus/workspace/lumina-crm` + the half-home in the vault
(the intake's note, no code) — all deleted for the clean re-test slate.

**GREEN: hop-runtime full (all 6 new U-pins + every preserved pin) + opencode-session +
first-prompt-intake + project-context + battery 28/0/2 (the 2 bench-skip declared) +
tsc 0.**

**THE EXIT GATE: the user's re-test with the SAME prompt.**
