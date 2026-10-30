---
title: Task Decomposition & Vertical Slices
category: planning
stacks: []
god: apollo
last_updated: 2026-10-30
sources:
  - https://basecamp.com/shapeup
  - https://12factor.net/
  - https://sre.google/sre-book/table-of-contents/
---

# Task Decomposition

## When to use
Any task larger than one focused session, any multi-service change, and every
architectural request. Decompose BEFORE writing code; the plan is the
deliverable, not a preamble to it.

## Non-negotiables
- Slice VERTICALLY: each unit delivers a user-visible or verifiable outcome,
  not "the database layer" followed by "the UI layer".
- One owner per unit, one artifact set per unit, one deterministic check per
  unit. If a unit has no check, it is not a unit yet.
- Cap each unit's output budget. A unit that cannot fit in ~16k output tokens
  is two units.
- Make dependencies explicit (a DAG). Parallelize only independent branches.
- Keep the critical path short; put uncertain work first (spikes before
  polish).

## Checklist
- [ ] Every unit names its artifact paths (files/dirs it will produce).
- [ ] Every unit has a verification command or file-exists check.
- [ ] The DAG is acyclic; no unit depends on a later one.
- [ ] The first unit proves the riskiest assumption.
- [ ] The last unit is a review/verification pass, not new scope.
- [ ] The plan names what is explicitly OUT of scope.

## Anti-patterns
- Horizontal layers ("all models", then "all routes") that cannot ship alone.
- A plan whose units are "build the app" — that is a project, not a unit.
- Silent scope growth during execution.
- Parallel units that edit the same file without an integration step.

## Sources
- Shape Up: https://basecamp.com/shapeup
- The Twelve-Factor App: https://12factor.net/
- Google SRE Book: https://sre.google/sre-book/table-of-contents/
