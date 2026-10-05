# OLYMPUS Bridge for VSCode / VSCodium / Cursor

> Embed the live OLYMPUS interactive terminal inside your editor. The terminal is shared with the one running in the OLYMPUS Electron app — type in either, see it in both.

**Version:** 0.0.2
**License:** AGPL-3.0-or-later

## What it does

- Adds an **OLYMPUS** icon to your editor's Activity Bar with two views:
  - **Status** — connection state + quick actions.
  - **Live Terminals** — every active PTY running in the OLYMPUS Electron app, with one-click attach.
- Opens a fully interactive terminal panel (xterm.js) inside your editor that mirrors a live OLYMPUS PTY session.
- An **"Open in OLYMPUS"** button brings the Electron app to the foreground (so you can flip back to the brain atlas / god detail / cost dashboard).
- Works in **VSCode**, **VSCodium**, **Cursor**, **Windsurf**, and **Trae** — all share the same extension API.

## Requirements

- **OLYMPUS must be installed and running.** The extension reads a per-install token from `~/.olympus/terminal-bridge-token` (generated when the Electron app starts) and connects to `ws://127.0.0.1:3740`. Without the token file the extension silently shows "Disconnected" in the status bar.
- **OLYMPUS v0.0.2+** required — earlier versions don't ship the Terminal Bridge.

## Install

### From source (development)

```bash
# From the OLYMPUS root:
node extensions/vscode-olympus/scripts/vendor-xterm.js   # one-time: copy xterm.js into media/
cd extensions/vscode-olympus
npm install
npm run compile
npm run package    # produces olympus-bridge-0.0.2.vsix
```

Then in VSCode/VSCodium/Cursor:

```
Extensions → ⋯ → Install from VSIX → pick the .vsix
```

### From the marketplace (when published)

```
code --install-extension olympus.olympus-bridge
```

## Usage

1. **Start OLYMPUS** (`olympus dev` from any terminal).
2. Open VSCode/VSCodium/Cursor — the OLYMPUS icon appears in the Activity Bar.
3. Click the icon → **Status** view shows "OLYMPUS Bridge: Connected".
4. Click **Live Terminals** → expand to see active PTYs.
5. Click any terminal (or use the **"OLYMPUS: Spawn New Terminal"** command) to open it in a panel.
6. Type in the panel — the same input/output appears in the OLYMPUS Electron app's terminal tab. Type in the Electron app — it appears in your editor's panel. Same PTY, two views.

## Commands

| Command | Default keybinding | Description |
|---|---|---|
| `OLYMPUS: Open Terminal Panel` | `Ctrl+Shift+Alt+T` (Mac: `Cmd+Shift+Alt+T`) | Spawn a new PTY and open it in a panel. |
| `OLYMPUS: Attach to Terminal` | — (click in tree view) | Attach the panel to an existing PTY. |
| `OLYMPUS: Spawn New Terminal` | — | Same as Open Terminal Panel. |
| `OLYMPUS: Open in OLYMPUS (focus Electron window)` | `Ctrl+Shift+Alt+O` (Mac: `Cmd+Shift+Alt+O`) | Bring the OLYMPUS Electron app to the foreground. |
| `OLYMPUS: Refresh Terminal List` | — (refresh icon in tree view) | Re-query active PTY sessions. |
| `OLYMPUS: Show Bridge Status` | — (click status bar item) | Print connection + session info. |
| `OLYMPUS: Open OLYMPUS on this workspace` | — | Focus OLYMPUS, prompting you to launch your editor on the current workspace. |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `olympus.bridge.autoConnect` | `true` | Connect to the bridge on startup. |
| `olympus.bridge.tokenFile` | `""` (defaults to `~/.olympus/terminal-bridge-token`) | Override the token file path. |
| `olympus.bridge.reconnectIntervalMs` | `2000` | How often to retry when OLYMPUS is not running. |

## How it works

```
┌─────────────────────────────────────────────────────────────────┐
│  OLYMPUS Electron Main Process                                  │
│  • node-pty PTYs (Map<id, IPty>)                                │
│  • WebSocket Bridge :3740  (token-gated, 127.0.0.1 only)        │
└─────────────────────────────────────────────────────────────────┘
                ↑                                ↑
                │ IPC (in-app terminal)          │ WebSocket + token
                │                                │
   ┌────────────┴────────────┐     ┌─────────────┴────────────────┐
   │  OLYMPUS Electron UI    │     │  VSCode-family extension     │
   │  Terminal tab (xterm)   │     │  • Activity bar: status      │
   │  (existing)             │     │  • Tree view: live PTYs      │
   │                         │     │  • Webview panel: xterm.js   │
   └─────────────────────────┘     └──────────────────────────────┘
```

The extension is **read-only with respect to PTY lifecycle** — it never kills a PTY it didn't spawn. PTYs created from the extension appear in the in-app terminal tab too (and vice versa).

## Troubleshooting

### Status bar shows "Disconnected"
- Make sure OLYMPUS is running: `olympus dev`
- Check that `~/.olympus/terminal-bridge-token` exists and is readable.
- Run `olympus terminal --status` — if it can connect, the bridge is up and the issue is with the extension's token file path (check the `olympus.bridge.tokenFile` setting).
- View → Output → "OLYMPUS Bridge" channel for logs (coming in v0.0.2).

### Terminal panel opens but shows no output
- The PTY may have been spawned before the panel attached. Click "Refresh Terminal List" and pick a different PTY, or spawn a new one.
- Some PTYs (kind: 'opencode') emit JSONL, not TUI output — they won't render meaningfully in xterm.js. Use the in-app Interactive Terminal for those.

### The "Open in OLYMPUS" button doesn't focus the window
- On Linux/Wayland some compositors ignore focus-stealing from foreign clients. The Electron app's `mainWindow.focus()` is called, but your compositor may require an additional click.
- On macOS the app should steal focus via `app.focus({ steal: true })`.

## Privacy

The extension makes exactly one outbound network connection: a WebSocket to `127.0.0.1:3740` on your local machine. It never connects to any external server, never sends telemetry, and never reads any file outside the configured token file path.

## License

AGPL-3.0-or-later. See [LICENSE](../../../LICENSE) in the OLYMPUS root.
