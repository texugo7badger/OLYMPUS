# OLYMPUS — hygiene total (v0.1.0)

> The 0.1.0 contract: **zero known errors in the deterministic gates**, and
> every remaining limit declared. `npm run hygiene` is the gate of record;
> `npm run hygiene -- --battery` adds the hermetic suite sweep.

## What "zero errors" means

| Gate | The bar |
|---|---|
| `npx tsc --noEmit` | 0 diagnostics |
| `npm run lint` | 0 errors, 0 warnings from the project config |
| `npm run docs:check` | current version/docs consistent |
| `node scripts/check-strategy-sync.js` | the strategy tables and every UI mirror agree |
| `npm run repo:privacy` | no private roots/credentials in tracked files |
| `node scripts/suites-manifest.mjs` | every suite mapped, PUBLIC/TRACKED_LOCAL present |
| `npm audit --audit-level=high` | 0 high / 0 critical |
| `npm run battery` | the hermetic release-branch battery (57/57 at 0.1.0) |

The **manifest-declared local suites** read the live app, vault, browser or
OpenCode DB; they are declared in `scripts/local-suites.manifest.json` and
are not silently skipped. They are not re-run while AIME is walking.

The v0.0.99 preview/mobile contract is covered by
`scripts/v099-preview-mobile.test.mjs`: the real-origin surface, replay-safe
hop stream, language header, answer accumulator, abortable prompt, voice
primer, presence route and the stat-keyed hop-events cache.

The v0.1.0 launch contract adds `scripts/learning-loop.test.mjs` (a completed
hop writes an empirical instinct; the gate short-circuits only on both
specific tags; invalid frontmatter is tolerated) and
`scripts/go-lane-fallback.test.mjs` (verified GO roster, dead-lane fallback,
advisory harness-only probe, generation apply, Apollo-only marks, status brief,
design provenance, notification dedupe). The live UI gate is
`node scripts/verify-v010-ui.mjs` (production boot handshake, status brief,
Cost settles, Model lanes all clear, preview iframe, mark queue).

## Declared limits (not errors)

- 23 moderate transitive advisories remain (0 high / 0 critical); the
  dependency lane is tracked separately.
- The 100-hop certification **passed** (100/100 script hops, p50/p95
  189/225ms, 0 lost, 0 parked). The **8-hour model soak is NOT claimed**; it
  remains a declared P2 gap (`npm run soak -- --minutes 480 --interval 10`
  with a real campaign).
- The retired `v0.0.98-10` … `v0.0.98-17` releases are removed from Releases;
  their tags remain for history. `v0.0.98` is the base, `v0.0.99` is the
  previous stable and `v0.1.0` is the current stable.
- AIME remains the active development lane; no external project was created
  for v0.1.0 (the preview/mark evidence used the live AIME surface).

## Run it

```bash
npm run hygiene              # tsc, lint, docs, strategy sync, privacy, manifest, audit
npm run hygiene -- --battery # + the 57 hermetic suites
```
