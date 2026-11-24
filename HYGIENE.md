# OLYMPUS — hygiene total (v0.0.99)

> The 0.0.99 contract: **zero known errors in the deterministic gates**, and
> every remaining limit declared. `npm run hygiene` is the gate of record;
> `npm run hygiene -- --battery` adds the hermetic suite sweep.

## What "zero errors" means

| Gate | The bar |
|---|---|
| `npx tsc --noEmit` | 0 diagnostics |
| `npm run lint` | 0 errors, 0 warnings from the project config |
| `npm run docs:check` | current version/docs consistent |
| `npm run repo:privacy` | no private roots/credentials in tracked files |
| `node scripts/suites-manifest.mjs` | every suite mapped, PUBLIC/TRACKED_LOCAL present |
| `npm audit --audit-level=high` | 0 high / 0 critical |
| `npm run battery` | the hermetic release-branch battery (54/54 at 0.0.99) |

The **132 maintainer-local suites** read the live app, vault, browser or
OpenCode DB; they are declared in `scripts/local-suites.manifest.json` and
are not silently skipped. They are not re-run while AIME is walking.

## Declared limits (not errors)

- 23 moderate transitive advisories remain (0 high / 0 critical); the
  dependency lane is tracked separately.
- The 2-hour night drill and the 8-hour / 100-hop certification are **not
  claimed** by 0.0.99.
- The retired `v0.0.98-10` … `v0.0.98-17` releases are removed from Releases;
  their tags remain for history. `v0.0.98` is the base and `v0.0.99` is the
  current stable.
- AIME remains the active development lane; no external project was created.

## Run it

```bash
npm run hygiene              # tsc, lint, docs, privacy, manifest, audit
npm run hygiene -- --battery # + the 54 hermetic suites
```
