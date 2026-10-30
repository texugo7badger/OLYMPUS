---
title: Architecture Decision Records & Design Rationale
category: planning
stacks: []
god: apollo
last_updated: 2026-10-30
sources:
  - https://adr.github.io/
  - https://c4model.com/
  - https://martinfowler.com/bliki/ArchitectureDecisionRecord.html
---

# Architecture Decisions

## When to use
Any decision that is expensive to reverse: data ownership, sync vs async, a
new service boundary, an external dependency, a schema shape, an auth model.
If a future engineer will ask "why is it like this?", write it down.

## Non-negotiables
- One decision per record: Context → Decision → Consequences → Alternatives.
- Record the REJECTED options and why. A record with no alternatives is a
  press release, not an ADR.
- Date it, name the owner, link the issue/commit. Decisions age; context
  does not.
- Use C4 levels for boundaries: Context (who uses it), Container (deployable
  units), Component (modules), Code (only when it earns its keep).
- Prefer reversible decisions early; spend the irreversible-decision budget
  on the few choices that actually constrain the product.

## Checklist
- [ ] The decision names the problem it solves, not the technology it likes.
- [ ] At least two alternatives are recorded with trade-offs.
- [ ] The blast radius is explicit (which modules/services/teams change).
- [ ] The migration path and rollback are named.
- [ ] The record is linked from the plan/handoff and the PR.

## Anti-patterns
- "We chose X because it is modern/popular." No constraint, no decision.
- A 20-page design doc with no dated decision and no owner.
- Rewriting an ADR to match what shipped, erasing the original reasoning.
- Using C4 diagrams as a substitute for a decision record.

## Sources
- ADR org: https://adr.github.io/
- C4 model: https://c4model.com/
- Fowler, ArchitectureDecisionRecord: https://martinfowler.com/bliki/ArchitectureDecisionRecord.html
