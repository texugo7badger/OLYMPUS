# Generated-Project Delivery Contract (MADRUGA-FIX-1, F3)

> The completion contract for ANY OLYMPUS-generated project (landing pages
> first — the bench-proven defect axis). The prompt-layer contract the
> drivers carry verbatim; the deterministic catch-all is the exit gate
> (`scripts/project-exit-gate.mjs`) — wired at BOTH invocation points: the
> generator's done-condition AND the driver's census (decision F6, replacing
> the retired byte-counting census — D30).

A generation run is **NOT DONE** until ALL of the following hold:

## A. Composition (P-A / D10)

`app/layout.tsx` + `app/page.tsx` exist and **compose the built sections** —
the route entry imports and renders the kit. A component kit without a
route entry is not a landing (the #1 bench defect: 10/16).

## B. Manifest discipline (P-B / D24)

- No version range from memory: resolve every range against the live
  registry (`npm view <pkg>@<range>`) before writing `package.json`.
- Every imported package is declared (imports-vs-deps at emit time).
- The lockfile is part of the deliverable (P-G / D29): run `npm install`
  inside the project and commit `package-lock.json` with it.

## C. Export-surface validation (P-C / D25)

No export or icon name from memory: every named import (e.g. lucide-react
icons) must exist in the library's real export surface. Brand icons
(WhatsApp, Instagram-variants that don't exist, …) are NOT in lucide-react.

## D. The gate is the done-condition (F1 / F6)

Run `node scripts/project-exit-gate.mjs <projectDir>` — the project is done
when the gate exits 0 (all seven checks green: lockfile, `npm ci`, build,
dev + `curl /` == HTTP 200, zero absolute symlinks, imports-vs-deps, route
composition). A gate failure is a FIX list, never a reason to declare done
anyway. Harness artifacts (opencode.json, transcripts, .opencode symlinks)
never live inside the deliverable (P-E / D27).
