# Build verify — the honest vocabulary

`src/lib/hop-runtime/verify.ts` executes a small, deterministic set of checks
(0 LLM tokens). Everything else a build declares is **prompt guidance**: it
tells the god what to inspect, but it cannot fail the hop. The Build Hub's
`verify` list mixes both, so this page is the mapping the catalog is held to.
`npm run builds:check` fails any curated build whose checks are guidance-only.

## Executable (the gate can fail the hop)

| Family | Spec | What it proves |
|--------|------|----------------|
| `build` | `build` | `npm run build` exits 0 in the lane |
| `lint` | `lint` | `npm run lint` exits 0 |
| `test` | `test` | `npm run test` exits 0 (v0.0.86) |
| `typecheck` | `typecheck` | `npm run typecheck` exits 0 (v0.0.86; 120s cap) |
| `visual` | `visual` or `visual:<json>` | the visual review JSON exists and has no false console/login/opacity result |
| `file-exists` | `file-exists:<rel>` | the artifact was written inside the lane (traversal refused) |
| `file-contains` | `file-contains:<rel>::<text>` | the artifact carries a required marker |
| `file-omits` | `file-omits:<rel>::<text>` | the artifact must not carry a marker |
| `mounted` | `mounted:<artifact>::<entry>` | the artifact is imported by the entry (not dead code) |
| `design-score` | `design-score:<n>` | `design-review.json` overall ≥ n |

Unknown checks fail loudly — `verifyHopDeterministic` reports
`unknown check (supported: …)`, never a silent pass.

## Guidance (recorded, never a gate)

These families name the work the god should do; they are reviewed by the god,
not by the deterministic engine. They are kept because they carry intent, but
a build with ONLY these is rejected by `builds:check`.

`a11y`, `axe`, `keyboard`, `interaction`, `viewport`, `perf`, `tokens`,
`asset`, `artifact`, `review`, `scan`, `secrets`, `coverage`, `tests`,
`workflow`, `handshake`, `tools`, `probe`, `note`, `index`, `docs`, `drill`,
`spec`, `scope`, `report`, `html`, `svg`, `meta`, `openapi`, `--help`, `exit`,
`job`, `rotate`, `restore`, `count`, `explain`, `time`, `ttl`, `invalidate`,
`dash`, `alert`, `tag`, `release`, `signature`, `retry`, `idempotency`,
`webhook`, `plan`, `gate`, `backup`, `migrate`, `data`, `route`, `tsc`.

### Why the split is honest

The audit found 59 declared families and 8 executors. A card that says
`scan:0-high` looked verified while nothing could fail the hop. The rule is
now: every curated build carries at least one executable gate, and the
guidance checks stay visible as intent. Where a project has no `test` script,
the gate fails and names it — that is a real signal (the project is not ready
for that build), not a silent green.
