---
title: Evidence & Release Gates
category: qa
stacks: []
god: dionysus
last_updated: 2026-10-30
sources:
  - https://sre.google/sre-book/table-of-contents/
  - https://slsa.dev/spec/v1.2/
  - https://keepachangelog.com/en/1.1.0/
---

# Evidence & Release Gates

## When to use
Every "done", every PR, every release. A claim without evidence is a guess.

## The evidence ladder (cheapest first)
1. **Deterministic check** — file exists, build passes, lint clean, schema
   validates. Zero tokens. Prefer this.
2. **Test output** — a named suite with a pass/fail count.
3. **Probe** — a live HTTP/port/process check with host, port, latency.
4. **Screenshot/log** — the artifact a human can inspect.
5. **Human review** — for irreversible or ambiguous changes.

## Non-negotiables
- Never narrate a live process as "running" from captured startup output.
  Probe it, or say "unverified — no probe evidence".
- A gate names the command, the expected result, and the actual result.
- A failed gate blocks the release; a waived gate is recorded with an owner.
- Release notes state what changed, what broke, and what is still open.
- Build artifacts are reproducible and (ideally) signed; the SBOM is attached
  where the ecosystem supports it.

## Checklist
- [ ] `typecheck` / `lint` / unit / integration / e2e results attached.
- [ ] The exact commit sha in every closure/comment.
- [ ] The probe output for any "running/healthy" claim.
- [ ] Rollback path documented and tested at least once.
- [ ] Known issues listed, not hidden.
- [ ] Version bumped in every place the release reads.

## Anti-patterns
- "Tests pass" with no output.
- Closing an issue from a commit that only touches docs.
- A green dashboard fed by stale cache while the process is dead.
- Releasing with an unowned flaky suite.
- A changelog that is a commit log dump.

## Sources
- Google SRE Book: https://sre.google/sre-book/table-of-contents/
- SLSA spec: https://slsa.dev/spec/v1.2/
- Keep a Changelog: https://keepachangelog.com/en/1.1.0/
