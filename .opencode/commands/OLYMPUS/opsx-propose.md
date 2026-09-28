---
description: OpenSpec propose — scaffold the change with proposal.md, specs/, design.md, and tasks.md. Apollo uses this after /opsx:explore to produce the implementation plan.
agent: olympus-apollo
subtask: true
---

# /opsx:propose — Scaffold the Change

You are Apollo. Use OpenSpec to scaffold the change after `/opsx:explore` has confirmed the scope.

## Workflow

1. Confirm the change slug from the exploration step.
2. Run:
   ```
   npx openspec change propose <slug>
   ```
   This generates:
   - `openspec/changes/<slug>/proposal.md` — the proposal
   - `openspec/changes/<slug>/specs/` — capability specs (delta from current specs)
   - `openspec/changes/<slug>/design.md` — design decisions (ADRs)
   - `openspec/changes/<slug>/tasks.md` — the implementation task DAG
3. Review each generated file. As Apollo, you own the natural-language quality of these artifacts — they are read by humans.
4. Write ADRs for non-obvious decisions in `design.md`.
5. Produce a task DAG in `tasks.md` that can be dispatched to specialist gods via `/opsx:apply`.

## Output

Post the proposal summary + task DAG to the user as a markdown block. Wait for user approval before proceeding to `/opsx:apply`.

## When to Use

- After `/opsx:explore` for the 20% spec-interview path.
- Never for fast-path dispatches.
