# Dependency Security Remediation — 19 Dependabot alerts (+1 at the release cut)

> **Date:** 2026-10-23 · **Release:** v0.0.9 · **Status:** resolved (18 fixed by overrides; 2 withdrawn advisories dismissed) · **Verification:** `npm audit` → 0 vulnerabilities (info 0, low 0, moderate 0, high 0, critical 0) at the release gate.

This note records the full inventory the user asked us to look at carefully: the **19 open Dependabot alerts** on `package-lock.json`, what each one is, the patched version, and exactly how it was cleared. It is the evidence trail for the v0.0.9 security sweep. A **20th advisory** (zod — GHSA-mrhx-c7xc-m3w5) landed between the sweep and the release gate and is recorded in the addendum at the end.

---

## Executive result

| Metric | Before | After |
|---|---:|---:|
| Dependabot alerts (open) | 19 | 0 fixed + 2 withdrawn dismissed (pending GitHub refresh) |
| `npm audit` critical | 6 | **0** |
| `npm audit` high | 7 (+1 at the cut: zod) | **0** |
| `npm audit` moderate | 7 | **0** |
| `npm audit` low | 2 | **0** |

The fix is a set of **npm overrides** in `package.json` (leaf-package pins), plus Dependabot dismissals for the two advisories GitHub itself marks **Withdrawn**. No application code changed for the security fix.

---

## The 19 alerts

| # | Severity | Package | Advisory | Vulnerable range | Patched | Resolution |
|---:|---|---|---|---|---|---|
| 86 | low | `katex` | GHSA-238p-pmpm-9mq7 — prototype pollution bypass | `>=0.11.0 <0.18.2` | 0.18.2 | override **0.19.0** |
| 85 | high | `nanoid` | GHSA-xwg4-73v4-xw9w — integer overflow/wraparound | `>=4.0.0 <5.1.11` | 5.1.11 | override **5.1.16** |
| 84 | high | `nanoid` | GHSA-xwg4-73v4-xw9w — integer overflow/wraparound | `<3.3.12` | 3.3.12 | override **3.3.18** (3.3.19 in tree) |
| 83 | high | `nanoid` | GHSA-28wg-ghj8-5hjv — negative-size loop | `>=4.0.0 <5.1.16` | 5.1.16 | override **5.1.16** |
| 82 | high | `nanoid` | GHSA-28wg-ghj8-5hjv — negative-size loop | `<3.3.16` | 3.3.16 | override **3.3.18** |
| 81 | high | `nanoid` | GHSA-2v37-7h3g-55p8 — zero-size loop | `>=4.0.0 <5.1.6` | 5.1.6 | override **5.1.16** |
| 80 | high | `lodash-es` | GHSA-r5fr-rjxr-66jc — code injection via `_.template` | `>=4.0.0 <=4.17.23` | 4.18.0 | override **4.18.1** |
| 79 | medium | `lodash-es` | GHSA-f23m-r3pf-42rh — prototype pollution (`unset`/`omit`) | `<=4.17.23` | 4.18.0 | override **4.18.1** |
| 78 | medium | `lodash-es` | GHSA-xxjr-mmjv-4gpg — prototype pollution | `>=4.0.0 <=4.17.22` | 4.17.23 | override **4.18.1** |
| 77 | medium | `nanoid` | GHSA-mwcw-c2x4-8c55 — predictable non-integer size | `<3.3.8` | 3.3.8 | override **3.3.18** |
| 76 | medium | `nanoid` | GHSA-mwcw-c2x4-8c55 — predictable non-integer size | `>=4.0.0 <5.0.9` | 5.0.9 | override **5.1.16** |
| 65 | critical | `shell-quote` | GHSA-pqg4-j6r4-53mv — `quote()` command injection | `>=1.8.4 <1.11.0` | 1.11.0 | override **1.12.0** |
| 64 | medium | `sprintf-js` | GHSA-hp3w-g68c-fv3c — **Withdrawn** DoS advisory | `<=1.1.3` | — | **dismissed** (`inaccurate`: advisory withdrawn) |
| 63 | critical | `seroval` | GHSA-p6vx-979v-rg4c — `fromJSON()` thenable callables | `>=0.12.0 <=1.6.0` | 1.6.2 | override **1.6.8** |
| 62 | high | `seroval` | GHSA-jp82-f5mq-hwhp — memory exhaustion via TypedArray | `<=1.6.2` | 1.6.3 | override **1.6.8** |
| 61 | high | `source-map-js` | GHSA-68fv-2mgg-jv7q — event-loop DoS via section offsets | `>=1.0.0 <1.2.2` | 1.2.2 | override **1.2.2** |
| 60 | high | `http-cache-semantics` | GHSA-ch52-4w7c-c8xp — cross-user cached responses | `<=4.2.0` | 4.3.0 (registry latest; alert metadata says none) | override **4.3.0** |
| 59 | high | `braces` | GHSA-vfj7-8cjw-p6xm — **Withdrawn** stack-exhaustion advisory | `<=3.0.3` | — | **dismissed** (`inaccurate`: advisory withdrawn) |
| 9 | high | `nanoid` | GHSA-2v37-7h3g-55p8 — zero-size loop | `<3.3.18` | 3.3.18 | override **3.3.18** |

> Alerts **#9/#81**, **#84/#85**, **#82/#83**, **#76/#77** are the same advisories on the 3.x and 4.x/5.x lines; each line is pinned to a patched release.

### Where the vulnerable chains live

- **`@excalidraw/excalidraw` → `@excalidraw/mermaid-to-excalidraw` → `mermaid`/`langium`/`chevrotain`:** `nanoid`, `lodash-es`, `katex` (build/browser rendering).
- **`@tarquinen/opencode-dcp` → `@opentui/solid`/`@opencode-ai/plugin`:** `seroval`, `solid-js`, `effect` (runtime for the optional DCP plugin).
- **`concurrently`:** `shell-quote` (dev script runner).
- **`@opencode/plugin` → npm tooling:** `http-cache-semantics` (install-time fetch cache).
- **Tailwind/Next tooling:** `source-map-js` (build-time source maps).
- **`sprintf-js`, `braces`:** only reached through tooling; both advisories were withdrawn by GitHub.

---

## The overrides (the fix)

Added to `package.json` → `overrides`:

```json
"lodash-es": "4.18.1",
"source-map-js": "1.2.2",
"http-cache-semantics": "4.3.0",
"shell-quote": "1.12.0",
"katex": "0.19.0",
"solid-js": "1.9.17",
"seroval": "1.6.8",
"seroval-plugins": "1.6.8",
"effect": "4.0.1",
"toml": "5.0.1",
"@excalidraw/excalidraw": { "nanoid": "3.3.18" },
"@excalidraw/mermaid-to-excalidraw": { "nanoid": "5.1.16" },
"@opencode-ai/plugin": { "zod": "4.6.7" }
```

### Why overrides and not `@excalidraw/excalidraw@0.17.6`

`npm audit` proposed downgrading `@excalidraw/excalidraw` to 0.17.6 (the 0.x semver convention marks it “major”). That would regress the Forge canvas that v0.0.5 shipped and v0.0.6 polished. Pinning the **leaf** packages keeps Excalidraw 0.18.1 while clearing every advisory on its dependency chain.

`effect` is overridden from `4.0.0-beta.83` (pinned by `@opencode-ai/plugin`) to `4.0.1` — the exact version the v2 runtime (`@opencode/plugin@2.1.4`) already uses. `toml` is pinned to 5.0.1 because `effect@4.0.1` no longer pulls it; the override is belt-and-suspenders.

---

## Verification evidence

```bash
npm install --no-audit --no-fund
npm audit --json        # metadata.vulnerabilities: all zero
npm ls nanoid lodash-es katex source-map-js http-cache-semantics shell-quote seroval solid-js effect toml
```

Observed tree (2026-10-23):

- `lodash-es@4.18.1` (deduped/overridden)
- `katex@0.19.0 overridden`
- `nanoid@3.3.18/3.3.19 overridden` + `nanoid@5.1.16 overridden`
- `solid-js@1.9.17 overridden` → `seroval@1.6.8 overridden`
- `shell-quote@1.12.0 overridden`
- `source-map-js@1.2.2`
- `http-cache-semantics@4.3.0`
- `effect@4.0.1 overridden` (no `toml` in the tree)

Gate: `npm audit` reports **0 vulnerabilities of every severity**; the full battery, `electron:compile`, `overlay:compile` and `build:linux` are the runtime/build proof recorded in the v0.0.9 release.

---

## Dependabot dismissals (withdrawn advisories only)

| Alert | Reason | Comment |
|---|---|---|
| #64 `sprintf-js` | `inaccurate` | Withdrawn advisory (GHSA-hp3w-g68c-fv3c) — no action required. |
| #59 `braces` | `inaccurate` | Withdrawn advisory (GHSA-vfj7-8cjw-p6xm) — no action required. |

The remaining 17 alerts close automatically when GitHub re-scans the pushed `package-lock.json`. If an alert lingers, re-run the Dependabot check and verify the lockfile on `main`.

---

## Drift policy (so this does not rot)

1. **Weekly scheduled audit:** `.github/workflows/security.yml` runs `npm audit --audit-level=high` on push, PR, and every Monday 06:00 UTC. A new high/critical advisory fails the job loudly.
2. **Monthly override review:** overrides are temporary pins. Re-check `npm view <pkg> version` and drop an override once the parent ships the patched range.
3. **No `npm audit fix --force`:** never let npm downgrade Excalidraw or the OpenCode runtime automatically.
4. **Dependabot stays on:** alerts are the second pair of eyes; an override can hide nothing from the audit, only force a safe resolution.
5. **Release gate:** every release runs `npm audit` (the v0.0.9 cut did; evidence above).

---

## The release-cut addendum (2026-10-23, 18:1x — the 20th advisory)

The release gate re-ran `npm audit` and found **5 high** the earlier sweep did not see: the **zod** advisory **GHSA-mrhx-c7xc-m3w5** ("Zod can exhaust memory while validating oversized constrained collections", CWE-770, CVSS 7.5, range `<4.6.6`) entered the database after the sweep and arrived through **`@opencode-ai/plugin@1.18.34` → `zod@4.1.8`** (an exact pin in the plugin's manifest, inherited by `opencode-pty`, `opencode-token-monitor` and `@tarquinen/opencode-dcp`).

The cure is the same doctrine as the other seventeen — a scoped leaf override, not a plugin downgrade (`npm audit fix` proposed `opencode-pty@0.1.1`, a semver-major regression):

```json
"@opencode-ai/plugin": { "zod": "4.6.7" }
```

`zod@4.6.7` is the same major the plugin already uses (4.x) and is above the patched bound 4.6.6; the nested copy is deduped to the root. After `npm install --package-lock-only` + `npm install`:

- `npm audit` → **0 vulnerabilities of every severity** (info 0, low 0, moderate 0, high 0, critical 0)
- `npm ls zod` → root `4.6.7`, no nested `4.1.8` under `@opencode-ai/plugin`
- `npx tsc --noEmit` → 0, `npm run lint` → 0, `npm run battery` → 57 PASS / 0 FAIL / 1 declared SKIP

The gate is now durable: every lockfile change re-runs `npm audit --audit-level=high` in `.github/workflows/security.yml` (weekly + on lockfile change), so a new advisory of this class fails the workflow instead of reaching a release cut unseen.

---

## The gate's second catch (the same night — the 21st and the 8 the rescan found)

The workflow added in this release failed on the release commit itself: **electron GHSA-jr5w-w6x2-84p9** (high, vulnerable `>=44.0.0-alpha.1 <44.9.1`) had entered the registry after the local audit and flagged the shipped `44.9.0`. That is the gate doing its job — a red workflow, not a silent release. Cure: `electron ^44.8.0 → ^44.9.1` (same major; 45.0.0 is a major bump and was not taken).

The Dependabot rescan that followed the fix listed **8 more alerts on the dev/build paths** — packages `npm audit` did not flag from the root (its advisory window differed):

| Package | Advisory | Vulnerable → patched | Cure |
|---|---|---|---|
| `undici` (6.x, via `@electron/rebuild → node-gyp`) | GHSA-xjj6-f33q-929c / GHSA-4qv8-2p9j-2685 | 6.29.0 → 6.29.1 | nested override `node-gyp → undici 6.29.1` |
| `undici` (7.x, via `electron → @electron/get`) | same | 7.30.0 → 7.30.1 | nested override `@electron/get → undici 7.30.1` |
| `undici` (8.x, via `@opencode/util`) | same | 8.12.3 | already patched — no action |
| `fast-uri` (via `electron-builder → ajv`) | GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp | 3.1.8 → 3.1.9 | override `fast-uri 3.1.9` |
| `@azure/msal-node` (extension build tool, `@vscode/vsce → @azure/identity`) | GHSA-xcx6-jx8p-x3h5 | 6.0.1 → 7.1.0 | extension override `@azure/identity → @azure/msal-node 7.1.0` |

Two versions of `undici` had to be pinned separately because the consumers live on different majors — a single global override would break one of them. `@azure/msal-node` is a **devDependency of the vsce build tool** (not shipped in the app or the extension runtime); the 7.1.0 bump was verified by re-packaging the vsix (`vsce package --no-dependencies` → green, 25.97 KB).

After the overrides: `npm audit` → **0** in the root **and** in `extensions/vscode-olympus`; tsc 0, eslint 0, `electron:compile` 0, battery 57 PASS / 0 FAIL / 1 declared SKIP.

---

## Residual risk

- The three “latest” pins (`electron`, `next`, etc.) can introduce new advisories between releases; the weekly job is the detector.
- `http-cache-semantics@4.3.0` is the registry latest and clears the advisory under `npm audit`; Dependabot’s metadata reports no `first_patched_version`, so its alert may need a manual close after the push if GitHub does not auto-resolve it.
- Overrides apply to the **root** lockfile. The `extensions/vscode-olympus` lockfile has no open alerts (its `mute-stream@0.0.8` is unrelated to the advisory list).

---

## References

- Dependabot alerts: `https://github.com/texugo7badger/OLYMPUS/security/dependabot`
- Advisory IDs are in the table above (GHSA links: `https://github.com/advisories/<GHSA-ID>`).
- `package.json` → `overrides` (the fix), `package-lock.json` (resolved tree).
- `.github/workflows/security.yml` (the weekly gate).
- `CHANGELOG.md` → v0.0.9 → the security bullet.
