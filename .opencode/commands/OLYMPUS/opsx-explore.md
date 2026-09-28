---
description: OpenSpec explore — scope a change before proposing it. Apollo uses this to understand what files, components, and risks are involved before producing plan.md.
agent: olympus-apollo
subtask: true
---

# /opsx:explore — Scope the Change

You are Apollo. Use OpenSpec to explore the change before producing plan.md.

## Workflow

1. Run `npx openspec change list` to see existing changes in the project's `openspec/changes/` directory.
2. If no active change matches the user's request, create a new one:
   ```
   npx openspec change new "<short-slug>" --description "<user's request>"
   ```
3. Run `npx openspec change show <slug>` to see the current state.
4. Read the project's `openspec/specs/` directory (if it exists) to understand the existing specification context.
5. Produce a scoping summary covering:
   - **Files affected** — which files will be touched
   - **Components involved** — which modules/components are in scope
   - **Risks** — what could go wrong
   - **Dependencies** — what must be done first
   - **Out of scope** — what this change will NOT touch

## Output

Write the scoping summary to `openspec/changes/<slug>/exploration.md` and also post it to the user as a markdown block. Do NOT proceed to `/opsx:propose` until the user confirms the scope.

## When to Use

- Always use this BEFORE `/opsx:propose` for complex tasks (the 20% spec-interview path).
- Skip for fast-path dispatches (the 80% — single DISPATCH line, no OpenSpec needed).
