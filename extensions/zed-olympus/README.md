# OLYMPUS Bridge for Zed

> Embed the live OLYMPUS interactive terminal inside Zed. The terminal is shared with the one running in the OLYMPUS Electron app — type in either, see it in both.

**Version:** 0.0.2 (preview)
**License:** AGPL-3.0-or-later

## What it does (today)

- Adds the command palette action **OLYMPUS: Open Live Terminal** that opens a Zed built-in terminal running `olympus terminal` — which connects to the running OLYMPUS Terminal Bridge and streams the live PTY.
- Adds the command palette action **OLYMPUS: Open in OLYMPUS** that focuses the Electron window via the bridge's `focus-olympus` WebSocket message.
- Adds the slash command `/olympus` in Zed's Assistant that does the same.

## What it does NOT do yet (roadmap)

- **Embedded terminal pane inside Zed's UI** (like the VSCode extension's webview panel). Zed's extension API doesn't yet expose terminal-pane rendering — it only supports spawning commands in Zed's *built-in* terminal pane. The `olympus terminal` CLI does the heavy lifting (raw mode, resize forwarding, scrollback replay), so the in-pane experience is already great — but it's the Zed terminal, not a custom xterm.js webview.

  **When Zed adds terminal-pane extensions**, the `src/lib.rs` file in this folder will gain a `TerminalPane` implementation that connects to `ws://127.0.0.1:3740` directly and renders xterm-equivalent output. The infrastructure (bridge protocol, token discovery, PTY attachment) is already in place — only the rendering surface is missing.

- **Status bar item** showing connection state. Zed's extension API doesn't yet support status bar items.

## Requirements

- **OLYMPUS must be installed and running.** The `olympus terminal` CLI reads the per-install token from `~/.olympus/terminal-bridge-token` (generated when the Electron app starts) and connects to `ws://127.0.0.1:3740`.
- **`olympus` on PATH.** The extension shells out to `olympus terminal`; if `olympus` isn't on PATH the commands will fail with a clear error.
- **OLYMPUS v0.0.2+** required — earlier versions don't ship the Terminal Bridge or the `terminal` CLI subcommand.

## Install

### From source (preview — not yet on the Zed extensions marketplace)

```bash
# From the OLYMPUS root:
cd extensions/zed-olympus

# Compile to WASM (requires Rust + the wasm32-wasi target):
rustup target add wasm32-wasi
cargo build --release --target wasm32-wasi

# Install into Zed's local extensions dir:
cp target/wasm32-wasi/release/zed_olympus.wasm \
   ~/.local/share/zed/extensions/installed/olympus-bridge/olympus-bridge.wasm
cp extension.toml \
   ~/.local/share/zed/extensions/installed/olympus-bridge/
```

Then restart Zed. The "OLYMPUS" commands appear in the command palette (`Cmd+Shift+P`).

### Without the extension (fallback)

If you don't want to compile the extension, just open a Zed terminal (`Cmd+` `) and run:

```bash
olympus terminal
```

This connects to the running OLYMPUS Terminal Bridge and streams the live PTY in Zed's built-in terminal — functionally identical to what the extension does, just without the command-palette integration.

## Usage

1. **Start OLYMPUS** (`olympus dev` from any terminal).
2. Open Zed. Run `Cmd+Shift+P` → **OLYMPUS: Open Live Terminal**.
3. A new terminal pane opens, showing the list of active OLYMPUS PTY sessions. Pick one (or type `n` to spawn a new one).
4. Type in the pane — the same input/output appears in the OLYMPUS Electron app's terminal tab. Type in the Electron app — it appears in your Zed pane. Same PTY, two views.
5. To focus the OLYMPUS Electron window: `Cmd+Shift+P` → **OLYMPUS: Open in OLYMPUS**.

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
   │  OLYMPUS Electron UI    │     │  Zed                          │
   │  Terminal tab (xterm)   │     │  • Built-in terminal pane     │
   │  (existing)             │     │    running `olympus terminal` │
   │                         │     │  • Command palette actions    │
   └─────────────────────────┘     └──────────────────────────────┘
```

The Zed extension's Rust code shells out to the `olympus terminal` CLI, which is a Node.js script (`scripts/olympus-terminal.js`) that handles:
- Token discovery from `~/.olympus/terminal-bridge-token`
- WebSocket connection to `ws://127.0.0.1:3740`
- Raw-mode stdin forwarding
- Terminal resize forwarding
- Scrollback replay on attach
- Graceful exit on `Ctrl+D` or PTY termination

So the Zed extension is essentially a thin command-palette wrapper around the CLI — but the CLI itself is a first-class OLYMPUS citizen that works in any terminal (Zed, tmux, SSH, etc.).

## Roadmap

| Feature | Status | Blocked on |
|---|---|---|
| Command palette: Open Live Terminal | ✅ Working | — |
| Command palette: Open in OLYMPUS (focus Electron) | ✅ Working | — |
| Command palette: Show Bridge Status | ✅ Working | — |
| Slash command `/olympus` in Assistant | ✅ Working | — |
| Status bar item showing connection state | 🚧 Planned | Zed extension API: status bar items |
| Embedded xterm.js-equivalent terminal pane | 🚧 Planned | Zed extension API: terminal panes |
| Auto-spawn OLYMPUS PTY on Zed startup | 🚧 Planned | Zed extension API: workspace events |
| Per-project PTY tagging | 🚧 Planned | — |

## Privacy

The extension makes exactly one outbound network connection (via the `olympus terminal` CLI): a WebSocket to `127.0.0.1:3740` on your local machine. It never connects to any external server, never sends telemetry, and never reads any file outside the configured token file path.

## License

AGPL-3.0-or-later. See [LICENSE](../../../LICENSE) in the OLYMPUS root.
