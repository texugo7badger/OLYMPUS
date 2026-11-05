# OLYMPUS distribution — the v0.1.0 installer plan

> Status: **plan** (v0.0.81). The current installed launcher
> (`~/.local/bin/olympus-desktop`) runs the repo in development mode; the
> AppImage is the production artifact. This document is the contract for the
> v0.1.0 installer and the Windows/macOS lanes.

## Why this exists

The Linux "application is not responding" flash when entering the Talent
Builder or hibernating is **on-demand Next.js compilation**: the installed
launcher runs `olympus dev` (`next dev`), so a route that was never compiled
blocks the renderer while webpack builds it. A production standalone has the
pages precompiled; the transition is a paint, not a build. The installer must
ship and launch the **standalone production server**, never `next dev`.

## Targets

| OS | Format | Minimum | Notes |
|---|---|---|---|
| Linux | AppImage + `.deb` | Ubuntu 22.04 / glibc 2.35 | The AppImage is the portable lane; `.deb` for desktop integration. |
| Windows | NSIS `.exe` | Windows 10 22H2+ | WebView2 is bundled by Electron; `node-pty`/`better-sqlite3` need `electron-rebuild`. |
| macOS | `.dmg` + `.zip` | macOS 13+ | `arm64` and `x64`; hardened runtime + notarization for Gatekeeper. |

## Architecture of the installed app

```
OLYMPUS.exe / OLYMPUS.app / OLYMPUS.AppImage
  └─ Electron main (electron/main.ts)
       ├─ Next standalone server (resources/next-standalone/server.js)
       ├─ OpenCode binary (resources/opencode/<platform>)
       └─ vault + config in the user's home (~/.olympus, ~/OLYMPUS-VAULT)
```

- **No `next dev` in a packaged build.** `electron/main.ts` already prefers
  `.next/standalone/server.js` when it exists; the installer must ship it and
  set `OLYMPUS_DEV=0`.
- **The repo launcher** can keep `olympus dev` for contributors; the installed
  desktop entry must call `olympus start` (production if the standalone is
  complete). The v0.0.81 release updates the maintainer's launcher to `start`
  after the standalone build.
- **First run** creates `~/.olympus`, asks for the OpenCode key (or detects
  `auth.json`), the vault root, and the GO/Zen/local strategy. No secrets in
  the installer or the AppImage.
- **Updates** use the stable channel (`public/stable.json`) written only by a
  green battery; development builds are opt-in in Settings. The updater
  downloads the full installer/AppImage (not a patched tree).

## Size and speed budget (v0.1.0)

The current AppImage is ~500 MB because it carries the whole source tree and
node_modules. Target: **≤ 220 MB compressed**, cold start ≤ 4 s on a mid-range
SSD.

- `electron-builder` `files` allowlist: `dist-electron/`, `next-standalone/`,
  `public/`, `bin/`, the OpenCode binary, the Python TTS helper, and the
  licenses. No `.next/cache`, no source maps, no tests, no `node_modules` dev
  dependencies.
- `asar: true`, `compression: maximum`, `npmRebuild` with the native deps
  (`better-sqlite3`, `node-pty`, `sharp`) rebuilt per platform/arch.
- Next standalone `output: 'standalone'` + `scripts/sync-standalone-assets.mjs`
  (already in the release gate) and `scripts/verify-standalone.mjs` (boots the
  server, checks `ws`, `BUILD_ID` and chunks).
- The OpenCode binary is the largest single asset; ship one per platform, not
  all. Edge-TTS is optional (the browser voice is the fallback).

## CI matrix (v0.1.0)

```
linux-x64   ubuntu-22.04   AppImage + deb
win-x64     windows-2022   NSIS
mac-arm64   macos-14       dmg + zip (signed/notarized)
mac-x64     macos-13       dmg + zip (signed/notarized)
```

Each lane runs: `tsc`, `lint`, the pure core suites, the production build,
the standalone verify, and a smoke boot. The stable manifest is written only
after the full battery is green on the release commit.

## Stable channel

`scripts/mark-stable.mjs` refuses on any battery FAIL and writes
`public/stable.json` + `public/versions.json`. Settings shows the running
version, the stable version and the evidence; development versions are
selectable only when stable is disabled. The binary swap is the installer's
job; the channel is the declaration.

## Out of scope for v0.1.0

- App Store / Play Store publishing.
- Auto-update delta patches (full installer first).
- iOS/Android native apps (the PWA is the mobile lane; see `MOBILE.md` when
  it lands).
- Bundling an LLM; OLYMPUS is a client of OpenCode/GO/Zen/local lanes.

## Acceptance for v0.1.0

- The three installers boot on a clean VM with no repo checkout.
- The installed app runs the standalone production server (no `next dev`).
- Cold start ≤ 4 s; entering/exiting the Talent Builder never shows the Linux
  "not responding" dialog.
- A green battery writes the stable manifest; a red one leaves the previous
  stable untouched.
- No secret, token, home path or vault content in the installer payload.
