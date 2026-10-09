# PLANO-MASTER-1 / B2 — the orphan-lane collision CURED (RED-first), + the panel-visibility rider

**Closes #116** (filed RED-first with the evidence below). The user's exact UAT case is now a
permanent fixture: the intake home in `02_Projects` WINS; the orphan lane is CONTENT to
absorb — surfaced, never silenced.

## The RED (the defect named, 3 suites, before the cure)

- `project-context.test.mjs` — the UAT fixture: live intake home in 02_Projects + orphan lane
  with content → **FAIL verbatim: `path: <lane>/case-uat-home, source: 'note-stale'`** — the
  orphan won exactly as it did live on 2026-10-09 13:41.
- `dev-server-manager.test.mjs` A15 — the collision at the manager seam, end-to-end:
  **FAIL verbatim: `projectPath=<lane>/fixture-orphanlane`** AND **the served page was THE
  ORPHAN'S (`homeMarker:false, orphanMarker:true`)** — the UAT's :3011 shape in miniature.
- `first-prompt-intake.test.mjs` — the rider pins: no intent KIND threading, no typed
  `project_created` event, no client refresh → 3 FAILs (the B1 verdict (b) gap pinned).

## The cure

**`src/lib/project-context.ts`** — the discriminator is `PROJECTS_DIR` (02_Projects, the
user's territory, #110's pinned home shape): a note path alive INSIDE the projects dir never
loses to a divergent lane — `source: 'note-home'`, and the orphan surfaces in the new
`lanePath` field of `ReconciledProjectPath` (the absorption announcement's data; B7 decides
the absorption with the user, B6 renders it). The note is never rewritten in this branch.
The preserved classes stay preserved and stay pinned: the pre-#99 bench FOSSIL (outside
02_Projects) still resolves lane/note-stale; dead note → self-heal; no note → legacy lane;
the in-root guard untouched — all green in the suites.

**The rider (B1 verdict (b), cured):** `src/app/api/olympus/action/route.ts` — the intent
stage now carries its KIND; when a project was created/routed, the stream emits the TYPED
`{type:'project_created', slug, kind}` event (the ask/skipped shapes keep the plain log).
`src/components/olympus/interactive-terminal.tsx` — on `project_created`, the client calls
`useOlympus.getState().refreshProjects()` (the list + the active pointer re-read — the
pointer was already set server-side by the intake) and renders the message. The mount-once
blindness that hid Lumina from the user's whole UAT is dead.

**The free bonus:** the post-run dev-server trigger seam (`route.ts` —
`reconcileProjectPath(opts.intent.slug)?.path`) now resolves THE HOME — the trigger that
spawned the orphan at 13:47 would today spawn in `02_Projects`. (B4 still owns the deps
step + the patience; the DIRECTORY was F1's half.)

## The honest corrections

1. **B1 verdict (b), corrected** (see the ADDENDUM at `s1/VERDICTS.md`): the #110 intake
   DOES set the active pointer server-side (`project-intent.ts:148` existing / `:180` new)
   — the B1 verdict overstated the gap. The real gap: the client's mount-once read + the
   global pointer's cross-session overwrite. Now pinned behaviorally so the correction is
   permanent.
2. **The open set moved:** E3 derived next-free #113 at Phase 1; by B2's filing the numbers
   #113–115 had been consumed by THREE NEW dependabot PRs (its post-safe-set-merge
   reconcile: `source-map-js` #113, `http-cache-semantics` #114, `next` 16.3.7→16.4.0 #115).
   Our issue is **#116**. The 3 new PRs are the same B0 class (lock-only candidates) —
   surfaced at the B2 gate with a proposal; the tracker stays the truth.

## GREEN (the evidence)

- project-context **24/24** (22 preserved + 2 new #116 checks — the home wins + the lane
  surfaced, note untouched)
- dev-server-manager **45/45** (39 preserved + 6 new A15 checks — the spawn lands in the
  home, THE HOME's marker serves, probe-green, clean stop, zero orphans)
- first-prompt-intake FULL (the 3 new rider pins + the active-pointer preservation pin)
- **Battery 30/30 + tsc 0** with the cure live (the full sweep, 600s per-suite patience)
- R4 untouched (never staged); frozen pair zero-diff; 0 CJK

**Merge trail after this merge:** 6 of the 12 cap (Phase 1 `0bd4a56` · B0 `07a34b5` +
`6ff1933` · B1 `dd27f56` · B2 this merge · …). Next at the user's gate: **B3 — wire-the-walk.**
