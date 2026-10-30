---
title: Release Engineering
category: release
stacks: []
god: prometheus
last_updated: 2026-10-30
sources:
  - https://semver.org/
  - https://keepachangelog.com/en/1.1.0/
  - https://slsa.dev/spec/v1.2/
  - https://sre.google/sre-book/table-of-contents/
---

# Release Engineering

## When to use
Every shippable change. A release is a repeatable process with evidence, not
a heroic afternoon.

## Non-negotiables
- **SemVer**: breaking → major, feature → minor, fix → patch. Pre-1.0 still
  communicates intent; do not silently break consumers.
- **One source of version truth**: the version file, package manifest,
  artifacts, and docs must agree. A release gate verifies it.
- **Changelog by user impact**, not by commit hash. Added / Changed / Fixed /
  Breaking / Known issues.
- **Reproducible build**: pinned toolchain, lockfile, deterministic output.
  Record the commit sha and build inputs.
- **Artifacts are immutable**: publish once, never overwrite a released tag.
- **Rollback is a first-class path**: know the previous version, how to
  restore it, and how to verify the restore.
- **Canary/health gate**: a smoke check on the deployed artifact before
  calling it done. Probe, do not assume.
- Sign/attest where the ecosystem supports it (SLSA provenance, signatures).

## Checklist
- [ ] Version bumped everywhere the release reads.
- [ ] Changelog + release notes written.
- [ ] Full test/typecheck/lint/build gates green, with output attached.
- [ ] Artifact built from the tagged commit; checksum recorded.
- [ ] Smoke/probe on the artifact.
- [ ] Rollback command documented and, ideally, rehearsed.
- [ ] Known issues and breaking changes called out.

## Anti-patterns
- Tagging a commit that is not the one that was tested.
- A "release" that is only a `git push`.
- Overwriting an existing version/tag.
- Changelog entries like "misc fixes".
- Shipping with a red gate and a promise to fix later (record the waiver or
  do not ship).

## Sources
- SemVer: https://semver.org/
- Keep a Changelog: https://keepachangelog.com/en/1.1.0/
- SLSA: https://slsa.dev/spec/v1.2/
- Google SRE Book: https://sre.google/sre-book/table-of-contents/
