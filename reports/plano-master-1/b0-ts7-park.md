# PLANO-MASTER-1 / B0 group 2 — the typescript-7 PARK (evidence on disk)

**Verdict: PARKED, honest, with evidence. `typescript` stays 5.9.3. PR #74 stays OPEN.**
This is not a tsc/battery breakage — the PR died one layer earlier, at dependency
RESOLUTION: npm itself refuses to HOLD typescript 7.0.2 under this tree's peer caps.

## The probe sequence (2026-10-09, this box, verbatim mechanism)

1. `npm install typescript@7.0.2 --package-lock-only` → exit 0, the lock gains typescript
   7.0.2 (the root range entry gets pinned — restored to `latest` by the box-side surgery
   per the house doctrine, exactly as group 1 did for 8 packages).
2. The real `npm install` (tree reconciliation against the `latest`-range manifest) →
   **typescript silently backtracks to 5.9.3** in the lock. Exit 0, no warning surfaced in
   the default reporter. `tsc --version` → 5.9.3.
3. The reconciliation residue in the lock diff: `@typescript-eslint/*` 8.65.0 → 8.71.1,
   `bun-ffi-structs@0.2.4` entering the tree, ~480 changed lines — REVERTED (the lock
   restored to the exact safe-set state merged at `07a34b5`; re-verified: typescript
   5.9.3, `tsc --noEmit` 0, tree clean except the frozen pair).

## Why npm backtracks (the peer caps, probed from node_modules)

| Package | Its peer requirement on typescript | Effect on ts-7 |
|---|---|---|
| `@typescript-eslint/eslint-plugin@8.65.0` (+ parser, project-service, scope-manager, tsconfig-utils — the eslint toolchain) | `>=4.8.4 <6.1.0` | **hard cap below 7** |
| `opencode-pty@0.4.0` (the opencode terminal integration, optionalDependencies) | `^5` | **hard cap below 6** |
| `bun-ffi-structs@0.2.4` (enters via the pty's resolution chain) | `^5` | same class |
| `eslint-config-next@16.2.12` | `>=3.3.1` | no objection |
| `ts-api-utils@2.5.0` | `>=4.8.4` | no objection |

The `latest` dist-tag IS 7.0.2 (`npm view typescript dist-tags` → `latest: '7.0.2'`) — so
this is not a tag problem: the PR's intent is the registry's latest. The blocker is that
TWO independent dependency chains (the typescript-eslint toolchain and the opencode-pty
terminal integration) declare peer ranges that typescript 7.0.2 violates. npm's resolver,
facing the conflict, backtracks typescript to the highest peer-compatible version (5.9.3)
— silently, by design, when the range is `latest`.

## What taking ts-7 would actually require

A coordinated toolchain migration: (a) an @typescript-eslint generation whose peer range
admits ^7 (8.71.x was auto-picked by the resolver during the backtrack and did NOT hold
the line either — the backtrack happened WITH it in the tree), AND (b) an opencode-pty
release whose peer admits typescript ^7. Both are upstream releases this repo does not
control. Until then, pinning the manifest to `"typescript": "7.0.2"` would only trade a
silent backtrack for a hard ERESOLVE (or a `--force`/`--legacy-peer-deps` mask — the
opposite of honest).

Per the campaign plan (MASTER-PLAN §B0): *"If typescript-7 breaks: honest PARK of the PR —
5.9.3 stays, PR open with evidence comment; do not burn the campaign on a toolchain
migration."* This park is that clause, fired at the resolution layer.

**State: 5.9.3 healthy** — `tsc --noEmit` 0; the full battery 30/30 GREEN with the group-1
safe-set live (the same battery covers the typescript 5.9.3 toolchain end-to-end).
PR #74: OPEN, carrying the evidence comment with this file's verdict.
Revisit trigger: an opencode-pty (and/or @typescript-eslint) release whose peer range
admits typescript ^7 — at that point the bump becomes a real lock-only candidate again.
