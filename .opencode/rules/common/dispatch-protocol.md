# Common Rules — Dispatch Protocol

> How gods dispatch to demigods.

## Dispatch Mechanism

Specialist gods dispatch to demigods via OpenCode's `subtask: true` command mechanism:

1. The god identifies the task type (e.g., "Rust build error involving borrow checker").
2. The god queries its instincts (`olympus-instinct-query` tool).
3. If short-circuit fires → dispatch directly to the demigod indicated by the instinct.
4. If no short-circuit → the god deliberates and chooses the best demigod.
5. The god invokes the appropriate command (e.g., `/rust-build` → `build-resolver`) with `subtask: true`.
6. The demigod executes the task, returns the result to the god.
7. The god reports completion to Apollo (or back to the user if Apollo delegated).

## Dispatch Table (per god)

See each god's prompt file (`.opencode/prompts/agents/Olympus/<god>.txt`) for the full dispatch table. Summary:

- **Apollo** → dispatches to any specialist god (never directly to ECC)
- **Artemis** → `security-reviewer`
- **Athena** → `managed-reviewer`, `build-resolver`, `e2e-runner`, `refactor-engineer`, `docs-verifier`, `docs-verifier`
- **Dionysus** → `tdd-guide`, `e2e-runner`, `build-resolver`, `refactor-engineer`
- **Hephaestus** → `planner`, `architect`, all language-specific reviewers + build-resolvers, `schema-reviewer`, `refactor-engineer`, `docs-verifier`, `docs-verifier`
- **Hermes** → `architect`, `managed-reviewer`, `build-resolver`, `docs-verifier`, `refactor-engineer`, `docs-verifier`
- **Persephone** → `schema-reviewer`, `build-resolver`, `managed-reviewer`, `build-resolver`
- **Prometheus** → `managed-reviewer`, `build-resolver`, `refactor-engineer`, `docs-verifier`

## Skill Equipment

When dispatching, the god specifies which skill to equip on the demigod:

- `caveman` — for all demigods (output compression, ECC standard)
- `tdd-guide` — when Dionysus dispatches to `tdd-guide`
- `security-review` — when Artemis dispatches to `security-reviewer`
- `frontend-patterns` — when Athena dispatches to frontend-related demigods
- `backend-patterns` — when Hephaestus dispatches to backend-related demigods
- (etc. — see each god's prompt for the full skill arsenal)

## Activity Feed Logging

Every dispatch must be logged:

```jsonl
{"ts":"<ISO>","god":"hephaestus","action":"delegation","msg":"Dispatched to build-resolver for borrow checker error","project":"<slug>","meta":{"demigod":"build-resolver","skill":"caveman","short_circuit":true,"instinct_confidence":0.89}}
```

The `meta.short_circuit` field tracks whether this dispatch was a short-circuit (instinct-driven) or a deliberated dispatch. This feeds the brain analytics dashboard.
