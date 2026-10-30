# OLYMPUS v0.0.25 — THE STABLE SURFACE

Boot that cannot crash on a missing module · an MCP panel that explains every non-green row · a tool budget you can see · panes that answer from cache.

## The boot crash is fixed — and the build now refuses to ship it

`olympus start` died with:

```
Cannot find module './websocket'
Require stack: .next/standalone/node_modules/ws/lib/stream.js
```

Instrumentation loaded `ws` through `eval('require("ws")')`, so Turbopack never traced it; the standalone copy shipped 10 of 12 `ws/lib` files, and `stream.js` requires `./websocket` at module load. A rebuild could “fix” it by copying one more file — the failure was nondeterministic.

- `ws` is now in `serverExternalPackages` and `outputFileTracingIncludes`.
- The instrumentation uses a traceable dynamic import.
- `scripts/sync-standalone-assets.mjs` completes the tree (`.next/static` + `public`) so `node .next/standalone/server.js` is self-sufficient.
- `scripts/verify-standalone.mjs` **fails the build** when: `ws` cannot be required from the standalone, `ws/lib/websocket.js` is missing, `BUILD_ID` is stale, the static chunks are absent, or `server.js` does not answer HTTP without a module error.

Every `npm run build` / `build:app` / `build:linux` runs sync → verify **before** packaging.

## MCP: red means broken — not “needs Docker”

Enabling the whole arsenal used to paint absent dependencies red as “dead”. Now a preflight runs **before any spawn**:

| Status | Meaning | Colour |
|---|---|---|
| `alive` | the JSON-RPC handshake answered | green |
| `needs-auth` | a key is missing (`BRAVE_API_KEY`, …) | amber |
| `needs-service` | no Docker daemon / `DATABASE_URL` / kubeconfig / ComfyUI | amber |
| `needs-binary` | `mcp-gateway` is not on PATH | amber |
| `needs-app` | Godot / Blender / REAPER is not installed | amber |
| `optional-unavailable` | an opt-in server did not start | amber |
| `dead` | its declared dependency IS present and it still fails | **red** |

Absent dependencies are **never spawned** — the panel is faster and no fake 12s timeout appears.

### The 128-tool budget is visible

The provider registry truncates past 128 tools. An all-on arsenal loaded 165. The panel now meters `tools N/128` and turns amber/red over budget.

### One-click cures

- **Reset to curated** — the measured six (filesystem, memory, git, context7, sequential-thinking, olympus-craft = 44 tools).
- **Disable unavailable** — turns off every enabled server whose dependency is absent.
- **Enable available** — turns on every server whose dependency is satisfied right now.
- **Diagnostics** — a JSON with the expanded command, cwd, dependency verdict, key PRESENCE (never values) and the probe error.

The header also names the registry source (`opencode.json · runtime · catalog`) and surfaces stale “on” toggles left by older builds.

## Panes: cache, not re-read

- A shared TTL cache (stale-while-revalidate) backs `brain-stats`, `episodes`, `costs`, `sync-map`, `god/references`, `arsenal-recon`.
- **Craft apps** no longer runs 14 live probes (8s each) on every open: a 30s probe cache answers instantly, the first sweep is **check-only** (no silent 13-app downloads) and runs after 10 minutes.
- The **models** fallback is async — no 30s `execSync` blocking the single event loop.
- God Detail polls at 30s.

### Measured (production standalone, warm p95, budget 300ms)

```
  p50   p95   endpoint
   16ms  20ms  build-info
    7ms  25ms  mcp/list
    5ms   8ms  brain-stats?brief=true
    4ms   5ms  brain-stats
    5ms   6ms  god/references
    5ms   6ms  arsenal-recon
    5ms   5ms  episodes
    4ms   5ms  costs
    9ms  11ms  craft-apps        (warm; first open ≤1.2s)
    7ms   7ms  sync-map
   60ms  69ms  models
```

`npm run perf:routes` re-runs this gate.

## Upgrade notes

- Run `npm install` (or `npm run postinstall`) once: it relinks `node_modules/.bin/opencode` to the v2 CLI if a legacy 1.x bin shadows it.
- Rebuild the app (`npm run build:app` or `npm run build:linux`) — the standalone gate now runs automatically.
- The MCP panel's **Reset to curated** is the fastest way back to a green, 44-tool arsenal.
- Craft updates are check-only by default; use the Update action per app (or `OLYMPUS_CRAFT_AUTO_INSTALL=1`).

## Manual test (10 minutes)

1. **Boot** — `olympus start` opens without `Cannot find module`; the terminal pane connects.
2. **MCP** — open the panel: 28 rows, the tool meter, “Reset to curated” → 6 enabled, 44 tools. Enable `docker`/`postgres`/`rea`: they show **amber** with the reason, never red.
3. **Diagnostics** — download the JSON; each row names its dependency and key presence.
4. **Panes** — click God intelligence, Recent activity, Cost, Craft apps, Sync map: each opens without a multi-second wait; a second open is instant.
5. **Craft apps** — the pane opens immediately; no background download storm.
6. **Perf gate** — `npm run perf:routes` → every endpoint within 300ms.
7. **Standalone gate** — `npm run verify:standalone` → complete and boots.
