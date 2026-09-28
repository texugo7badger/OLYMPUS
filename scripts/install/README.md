# OLYMPUS Installer

> Linux installer + uninstaller for **OLYMPUS v0.0.1**.
> Other platforms: use WSL. No built-in IDE — bridges to the user's
> preferred editor (Zed, VSCode, VSCodium, Cursor) and shared terminal.

## Quick start

```bash
bash scripts/install/install.sh
```

The installer runs **6 interactive steps**:

1. **Prerequisites** — Node.js v18+ (v22 LTS recommended), npm, Git, a C/C++ compiler (clang / gcc / MSVC).
2. **`npm install`** — bundles OpenCode CLI locally (accessible via `olympus opencode`) so OLYMPUS never touches your global Node setup.
3. **TypeScript build** — compiles the ECC plugin, the OLYMPUS overlay + Symphony extension, and the Electron main process.
4. **Bootstrap runtime state** — creates `~/.olympus/`, seeds the vault at `~/OLYMPUS-VAULT/`, applies the default model strategy (e.g. `go-balanced`).
5. **Detect external editors** — scans `PATH` for Zed / VSCode / VSCodium / Cursor and saves the result to `~/.olympus/editor-config.json`. This drives the **Editor Bridge** (the "Edit in IDE" button opens the user's preferred editor on the active project).
6. **OpenCode authorization** — prints instructions to launch the local OpenCode CLI via `olympus opencode` and authorize **all** LLM access inside OpenCode — GO plan OAuth, OpenCode Zen (`/connect`), or free-tier Groq/OpenRouter providers. Keys are never injected by the installer.

After install, **authorize OpenCode** (the only manual step — required for the GO plan, Zen, and free-tier keys):

```bash
olympus opencode
#   → Path A (GO plan):  sign in with your GO plan account (OAuth flow inside OpenCode)
#   → Path B (Zen):      run /connect and select OpenCode Zen, paste your API key
#   → Path C (free tier): open Settings, add Groq and/or OpenRouter as providers
#   → Exit (Ctrl+C or /exit)
```

(If you don't have `olympus` on PATH, use `npx olympus opencode` or `./node_modules/.bin/opencode`.)

Zen + free-tier API keys are authorized the same way — inside OpenCode — and OLYMPUS detects them automatically. There is no installer or UI field for LLM keys.

Then launch:

```bash
npm run dev          # headless — Next.js + Electron, log -> ~/.olympus/olympus.log
# or
olympus dev          # if you have the CLI on PATH
```


> **Authorized inside OpenCode, not `.env`.** The GO API uses OAuth — it cannot be automated via `.env`. Zen and free-tier providers (Groq, OpenRouter) are authorized inside OpenCode too. After authorization, OpenCode handles all LLM API key routing automatically. MCP API keys (GitHub, Grafana, Figma) are configured later via Settings → API Keys inside OLYMPUS.

---

## Editor Bridge + Terminal Bridge (install implications)

OLYMPUS does not ship a built-in code editor. Gods edit code by launching the user's *preferred* external editor (Zed, VSCode, VSCodium, Cursor) on the active project; the live terminal is shared between the Electron app and the user's IDE via a local WebSocket bridge (port 3740).

This shapes the install story:

- **No embedded IDE stack to build or ship** — OLYMPUS has no built-in code editor, so `@monaco-editor/react` and related editor dependencies are not in `package.json`.
- **`node-pty` powers the terminal** — the Electron app spawns PTY sessions via `node-pty` and shares them with both the in-app Terminal tab and external editors via the bridge. If `node-pty` fails to load (e.g., ABI mismatch, no C++ compiler), a transparent `FallbackPty` using `child_process.spawn` kicks in — the terminal still works, just without full interactive shell support on Windows.
- **The Editor Bridge tab invites the user to pick an IDE** — the installer's Step 5 detects installed editors and the UI surfaces an "Open in <editor>" affordance. The Editor Bridge is config-only; no native modules are involved.

---

## Node.js and compiler notes

| Platform | Notes |
|----------|-------|
| **Linux** | A C/C++ compiler (gcc) is recommended for native module compilation. Install `build-essential` on Ubuntu/Debian. |
| **Other platforms** | Use WSL. OLYMPUS is a Linux-first desktop app. |

> **A C/C++ compiler is entirely optional.** node-pty v1.0+ ships N-API prebuilt binaries that work without compilation. The terminal degrades gracefully via the FallbackPty mechanism.

---

## Node version recommendation

| Node | Status | Notes |
|------|--------|-------|
| v22.x (LTS) | **Recommended** | Matches `npm@latest` engine requirement (Node ≥22.22.2). nvm users: `nvm install 22.23.1 && nvm alias default 22.23.1`. |
| v24.x | **Not recommended** | `install.sh` will pass `--ignore-scripts` to `npm install` on Node ≥24; semantic search will be disabled. |
| v18–v20 | Works, but unsupported | Older Node 22 LTS point releases predate the `npm` engine range we depend on; you'll see `EBADENGINE` warnings. |

---

## Files

| File | Purpose |
|------|---------|
| `install.sh` | Linux installer (6 interactive steps) |
| `uninstall.sh` | Linux uninstaller |
| `common.sh` | Shared shell functions (logging, vault setup, compile plugins) |

## What the installer does

1. **Checks prerequisites** — Node.js v18+, npm, Git, a C/C++ compiler (clang / gcc / MSVC). On Node ≥24 it warns and falls back to `npm install --ignore-scripts`.
2. **Installs dependencies** — `npm install` (includes OpenCode CLI locally as a devDependency). Native modules (`better-sqlite3`, `node-pty`, `electron`, `esbuild`, `sharp`) build via the `allowScripts` field in `package.json`.
3. **Builds TypeScript** — `tsc -p .opencode/tsconfig.json` (ECC plugin + tools), `tsc -p .opencode/olympus/tsconfig.json` (OLYMPUS overlay + Symphony), then `tsc -p electron/tsconfig.json && node scripts/electron-postcompile.js` (Electron main).
4. **Bootstraps runtime state** — creates `~/.olympus/` (config), seeds `~/OLYMPUS-VAULT/` (gods, instincts, patterns, activity feed, indices) via `python3 scripts/seed-vault.py`, applies the default model strategy via `node scripts/apply-strategy.js`, creates sub-agent instincts.
5. **Detects external editors** — runs `node scripts/detect-editors.js`, saves to `~/.olympus/editor-config.json` (consumed by the Editor Bridge tab).
6. **OpenCode authorization** — prints instructions to launch OpenCode via `olympus opencode` and authorize all LLM access inside OpenCode (GO plan OAuth, OpenCode Zen `/connect`, or free-tier Groq/OpenRouter providers).

> **No skill index build at install time.** The skill TF-IDF index (`~/OLYMPUS-VAULT/03_Index/skill-vec.db`) is built on-demand by the OLYMPUS Electron main process (it spawns an incremental watcher on launch). You can force a full rebuild manually with `npm run skill-index` if you want it ready before first launch.

## What the uninstaller does

Three modes:

- **Config only** — removes `~/.olympus/` (keeps the vault + project).
- **Config + vault** — removes `~/.olympus/` + `~/OLYMPUS-VAULT/`.
- **Full** — removes everything (config, vault).

The uninstaller never deletes the vault or project folder without explicit confirmation.

## Manual setup (without the installer)

```bash
npm install                                            # or: npm run setup  (one-click bootstrap)
npm run electron:compile                               # tsc + postcompile
python3 scripts/seed-vault.py                           # initialise the vault
node scripts/apply-strategy.js                           # apply go-balanced
npm run dev                                             # launch

# Windows only — recompile native addons for Electron's ABI (optional):
npm run rebuild:native    # only needed if you have VS Build Tools installed
```

Then authorize OpenCode (see above) and optionally configure MCP API keys via Settings → API Keys inside OLYMPUS.

## Verification

After install, run:

```bash
node scripts/olympus-doctor.js
```

This checks ~70 installation health points. A clean v0.0.1 install reports **0 failures**. The 6 warnings a fresh install will show are all expected runtime-state items (MCP servers not configured, terminal bridge not yet spawned, short-circuit log not yet created) — they clear the first time you launch OLYMPUS.
