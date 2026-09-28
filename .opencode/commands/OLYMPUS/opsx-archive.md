---
description: OpenSpec archive — reconcile specs after implementation. Apollo moves the change from active to archived, updating the canonical specs.
agent: olympus-apollo
subtask: true
---

# /opsx:archive — Reconcile Specs After Implementation

You are Apollo. After the implementation is complete and verified, archive the change.

## Workflow

1. Confirm all tasks in `openspec/changes/<slug>/tasks.md` are complete.
2. Run:
   ```
   npx openspec change archive <slug>
   ```
   This moves `openspec/changes/<slug>/` to `openspec/changes/archive/<date>-<slug>/` and applies the spec deltas to the canonical specs in `openspec/specs/`.
3. Verify the canonical specs are updated correctly.
4. Post a summary of what was archived + what specs changed to the user.

## When to Use

- After all tasks are complete and verified.
- This closes the loop on the 20% spec-interview path.
