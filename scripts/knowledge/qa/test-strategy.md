---
title: Risk-Based Test Strategy
category: qa
stacks: []
god: dionysus
last_updated: 2026-10-30
sources:
  - https://martinfowler.com/articles/practical-test-pyramid.html
  - https://testing.googleblog.com/
  - https://www.istqb.org/
---

# Test Strategy

## When to use
Before writing a feature, not after. The test plan is how you decide what
"done" means. Use risk to choose the depth, not fashion.

## The shape
- **Unit** (fast, many): pure logic, parsers, reducers, edge cases.
- **Integration** (fewer): the seam that actually breaks — API + DB, route +
  service, component + hook.
- **E2E** (few): the critical user journeys that would cost revenue or trust
  if broken. Do not e2e-test every button.
- **Contract** (where applicable): the boundary between two services.
- **Property-based** for parsers/validators/invariants; **mutation** to prove
  the tests can fail.

## Non-negotiables
- Every bug fix starts with a failing regression test.
- Test behavior and observable outcomes, not private implementation details.
- One reason to fail per test; name the behavior, not the method.
- Deterministic by default: no sleeps, no real network, fixed clocks/seeds.
- A flaky test is quarantined the same day — with an owner and a deadline.
  A flaky suite is worse than no suite.
- Coverage is a smell detector, not a goal. Cover risk, not lines.

## Checklist
- [ ] The acceptance criteria map to at least one test each.
- [ ] The failure mode is asserted (error message/status), not only the happy
      path.
- [ ] Boundaries: empty, one, many, max, unicode, null, duplicate.
- [ ] The test fails for the right reason when the implementation is mutated.
- [ ] CI runs the suite on a clean environment; no hidden local state.

## Anti-patterns
- Snapshot-only tests for logic (they bless bugs).
- Mocking everything until the test only asserts the mocks.
- E2E for validation rules that a unit test covers in milliseconds.
- "It passes locally" with an unseeded random or a real clock.
- Chasing 100% coverage while the critical path has no assertion.

## Sources
- Fowler, Practical Test Pyramid: https://martinfowler.com/articles/practical-test-pyramid.html
- Google Testing Blog: https://testing.googleblog.com/
- ISTQB: https://www.istqb.org/
