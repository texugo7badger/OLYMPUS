# OLYMPUS Editor Bridge — Supported Editors

> Editor Bridge — OLYMPUS launches your preferred external editor and shares the live terminal with it via a token-gated WebSocket bridge.

This document lists every editor OLYMPUS supports, how to install each on each OS, and how to configure OLYMPUS to use a custom binary path.

## TL;DR

| Editor | Auto-detect | Embedded live terminal |
|---|---|---|
| **Zed** | ✅ | ✅ (via Zed's built-in terminal + `olympus terminal`) |
| **VSCode** | ✅ | ✅ (xterm.js webview panel) |
| **VSCodium** | ✅ | ✅ (xterm.js webview panel) |
| **Cursor** | ✅ | ✅ (xterm.js webview panel) |
| **Neovim / Helix / Emacs / Sublime** | 🚧 | ✅ (via `olympus terminal` in any terminal) |

If your editor isn't listed, you can still use OLYMPUS — just run `olympus terminal` from your editor's built-in terminal to attach to the live OLYMPUS PTY.

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
   │  OLYMPUS Electron UI    │     │  Your editor                 │
   │  Terminal tab (xterm)   │     │  * `olympus terminal` CLI    │
   │  (launchpad)            │     │                              │
   └─────────────────────────┘     └──────────────────────────────┘
```

The bridge is **token-gated** — only local clients holding `~/.olympus/terminal-bridge-token` can connect. The token rotates on every OLYMPUS restart, so stale IDE extensions must re-read the file (they poll every 2 seconds when disconnected).

## Installing an editor

### Zed

| OS | Command |
|---|---|
| macOS | `brew install --cask zed` OR download from https://zed.dev/download |
| Linux | `curl -f https://zed.dev/install.sh \| sh` (installs to `~/.local/bin/zed`) |
| Windows | Download from https://zed.dev/download (installs to `%LOCALAPPDATA%\Programs\Zed\`) |

OLYMPUS auto-detects Zed at `~/.local/bin/zed`, `/usr/bin/zed`, `/usr/local/bin/zed`, `/snap/bin/zed`, `~/.local/share/zed/cli/zed`, and the standard `.app` / `.exe` install locations.

### VSCode

| OS | Command |
|---|---|
| macOS | `brew install --cask visual-studio-code` OR download from https://code.visualstudio.com/download |
| Linux (Debian/Ubuntu) | Download the `.deb` from https://code.visualstudio.com/download and `sudo dpkg -i code_*.deb` |
| Linux (Fedora/RHEL) | Download the `.rpm` from https://code.visualstudio.com/download and `sudo rpm -i code_*.rpm` |
| Linux (Snap) | `sudo snap install code --classic` |
| Windows | Download from https://code.visualstudio.com/download (installs to `%LOCALAPPDATA%\Programs\Microsoft VS Code\`) |

OLYMPUS auto-detects VSCode via `which code` and the standard install locations.

### VSCodium

| OS | Command |
|---|---|
| macOS | `brew install --cask vscodium` OR download from https://vscodium.com/#download |
| Linux (Debian/Ubuntu) | See https://vscodium.com/#download for the repo + apt install instructions |
| Linux (Snap) | `sudo snap install codium --classic` |
| Windows | Download from https://vscodium.com/#download (installs to `%LOCALAPPDATA%\Programs\VSCodium\`) |

OLYMPUS auto-detects VSCodium via `which codium` and the standard install locations.

### Cursor

| OS | Command |
|---|---|
| macOS | Download from https://cursor.com/download |
| Linux | Download the `.AppImage` from https://cursor.com/download |
| Windows | Download from https://cursor.com/download |

OLYMPUS auto-detects Cursor via `which cursor` and `~/.local/bin/cursor` / `/opt/cursor/cursor`.

## Using `olympus terminal` in any editor

Open your editor's built-in terminal and run:

```bash
olympus terminal              # interactive: list + pick or spawn
olympus terminal --spawn      # spawn a new shell PTY
olympus terminal --attach <id> # attach to a specific PTY
olympus terminal --list       # list active sessions + exit
olympus terminal --status     # show bridge status + exit
```

The CLI handles token discovery, raw-mode stdin forwarding, resize events, and scrollback replay. Works in any terminal — tmux, SSH, Zed's built-in terminal, VSCode's integrated terminal, etc.

## Configuring OLYMPUS to use a specific editor

By default, OLYMPUS auto-detects the first installed editor in this priority order: Zed → VSCode → VSCodium → Cursor. To override:

1. Open OLYMPUS.
2. Click the **Editor** tab in the right pane.
3. Click the gear icon → **Editor Settings**.
4. Pick a different editor from the dropdown, or set a custom binary path.
5. Click **Save**.

The config is persisted to `~/.olympus/editor-config.json`:

```json
{
  "preferred": "zed",
  "customBinPath": null,
  "lastDetected": [...],
  "lastDetectedAt": "2026-07-28T..."
}
```

## The Terminal Bridge protocol

The bridge is at `ws://127.0.0.1:3740/?token=<token>`. After the handshake, the client sends JSON messages:

| Message | Reply | Description |
|---|---|---|
| `{ "type": "ping" }` | `{ "type": "pong", "ts": <ms> }` | Keep-alive. |
| `{ "type": "list" }` | `{ "type": "sessions", "sessions": [...] }` | List active PTYs. |
| `{ "type": "attach", "id": "<id>" }` | `{ "type": "attached", "id": "<id>", "history": "<scrollback>" }` | Attach to a PTY. Server then sends `output` + `exit` events for that id. |
| `{ "type": "detach", "id": "<id>" }` | `{ "type": "detached", "id": "<id>" }` | Stop receiving events for a PTY. |
| `{ "type": "input", "id": "<id>", "data": "<text>" }` | (none) | Write to the PTY's stdin. |
| `{ "type": "resize", "id": "<id>", "cols": N, "rows": N }` | (none) | Resize the PTY. |
| `{ "type": "spawn", "kind": "shell"\|"command", "cwd"?: "...", "command"?: "...", "label"?: "...", "cols"?: N, "rows"?: N }` | `{ "type": "spawned", "id": "<id>", "info": {...}, "history": "" }` | Spawn a new PTY (visible in both the in-app terminal + the bridge). |
| `{ "type": "focus-olympus" }` | `{ "type": "focused", "ok": true }` | Bring the OLYMPUS Electron window to the foreground. |

The server also sends unsolicited events:

| Event | Description |
|---|---|
| `{ "type": "hello", "version": "1.0", "server": "olympus-terminal-bridge", "pid": <pid> }` | Sent immediately after the handshake succeeds. |
| `{ "type": "output", "id": "<id>", "data": "<text>" }` | PTY output (only for PTYs you've attached to). |
| `{ "type": "exit", "id": "<id>", "exitCode": N, "signal"?: N }` | PTY exited. Auto-detaches you. |
| `{ "type": "error", "error": "<msg>" }` | Something went wrong. |

Binary WebSocket frames are treated as raw input to the first attached PTY (low-latency keystroke path — no JSON wrapping).

## Security

- The bridge binds to **127.0.0.1 only** — never exposed to the network.
- The token is **32 bytes of crypto-random data**, base64url-encoded.
- The token file (`~/.olympus/terminal-bridge-token`) is created with **0o600 permissions** (owner read/write only).
- The token **rotates on every OLYMPUS restart** — stale IDE extensions must re-read the file (they poll every 2 seconds when disconnected).
- Without the token, the WebSocket handshake is rejected with 401.

## Troubleshooting

### "No editor detected" in the Editor Bridge tab

- Install one of Zed, VSCode, VSCodium, or Cursor (see above).
- If your editor is installed in a non-standard location, set a custom binary path in Editor Settings.
- Run `node scripts/detect-editors.js` from the OLYMPUS root to see what OLYMPUS detects.

### `olympus terminal` says "token not found"

OLYMPUS isn't running. Start it with `olympus dev`. The token file is generated by the Electron main process at startup.

## Adding support for a new editor

The bridge protocol is editor-agnostic. To add support for a new editor:

1. **Auto-detection.** Add an entry to `EDITOR_CATALOG` in `src/lib/editor-bridge.ts` (and the parallel catalog in `scripts/detect-editors.js`). Include the editor's CLI binary name(s) + known install locations per platform.

2. **Documentation.** Add a section to this file + a README in your extension's folder.

3. **Terminal Bridge client (optional).** Build a client that reads `~/.olympus/terminal-bridge-token` and connects to `ws://127.0.0.1:3740/?token=<token>`. The reference implementation is `scripts/olympus-terminal.js` — a Node.js CLI that handles stdin/stdout.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE) in the OLYMPUS root.
