# OLYMPUS IDE Extensions

> Companion extensions for VSCode-family editors and Zed that embed the live OLYMPUS interactive terminal inside your editor of choice.

OLYMPUS v0.0.2 ships an **External Editor Launcher** (Editor Bridge) + a **Terminal Bridge** that exposes the in-app PTY sessions to external IDEs over a token-gated WebSocket.

## Folder structure

```
extensions/
├── README.md                ← this file
├── vscode-olympus/          ← VSCode / VSCodium / Cursor / Windsurf / Trae
│   ├── src/extension.ts     ← TypeScript entry point
│   ├── media/               ← xterm.js + webview HTML
│   ├── scripts/vendor-xterm.js   ← one-time vendoring script
│   ├── package.json         ← manifest (commands, views, config)
│   ├── tsconfig.json
│   ├── README.md            ← detailed VSCode extension docs
│   └── .vscodeignore
└── zed-olympus/             ← Zed
    ├── src/lib.rs           ← Rust + WASM entry point
    ├── Cargo.toml
    ├── extension.toml       ← Zed manifest
    └── README.md            ← detailed Zed extension docs
```

## Quick start

### VSCode-family (recommended for full embedded terminal experience)

```bash
# From the OLYMPUS root:
node extensions/vscode-olympus/scripts/vendor-xterm.js
cd extensions/vscode-olympus && npm install && npm run compile && npm run package
# Install the resulting .vsix via the editor's "Install from VSIX" command.
```

### Zed (preview — uses Zed's built-in terminal pane)

```bash
# From the OLYMPUS root:
cd extensions/zed-olympus
rustup target add wasm32-wasi
cargo build --release --target wasm32-wasi
# Copy the .wasm + extension.toml into Zed's local extensions dir.
```

### Any terminal (no extension required)

```bash
olympus terminal    # connects to the running OLYMPUS Terminal Bridge
```

## How the terminal sharing works

The OLYMPUS Electron app spawns a WebSocket server on `127.0.0.1:3740` (the **Terminal Bridge**) that exposes every active PTY session managed by the in-app terminal. IDE extensions connect to this bridge with a per-install token from `~/.olympus/terminal-bridge-token` and either:

1. Attach to an existing PTY (the same one shown in the Electron app's terminal tab), or
2. Spawn a fresh PTY (which also appears in the Electron app's terminal tab).

The bridge forwards:
- **Output** → every attached client (Electron renderer + every connected IDE extension).
- **Input** → the PTY (from whichever client typed).
- **Resize** → the PTY (last writer wins; clients resize to match their viewport).
- **Exit** → every attached client (so they can close gracefully).

This means typing in your IDE's terminal panel is visible in the Electron app, and typing in the Electron app's terminal tab is visible in your IDE. Same PTY, multiple views.

## Security model

- The bridge binds to **127.0.0.1 only** — never exposed to the network.
- The token is **32 bytes of crypto-random data**, base64url-encoded.
- The token file (`~/.olympus/terminal-bridge-token`) is created with **0o600 permissions** (owner read/write only).
- The token **rotates on every OLYMPUS restart** — stale IDE extensions must re-read the file (they poll every 2 seconds when disconnected).
- Without the token, the WebSocket handshake is rejected with 401.

## Adding support for a new editor

The bridge protocol is editor-agnostic. To add support for a new editor (Neovim, Helix, Emacs, Sublime, etc.), implement a client that:

1. Reads `~/.olympus/terminal-bridge-token`.
2. Connects to `ws://127.0.0.1:3740/?token=<token>`.
3. Sends `{ "type": "list" }` to enumerate PTYs.
4. Sends `{ "type": "attach", "id": "<id>" }` to attach to one, OR `{ "type": "spawn", "kind": "shell", "cwd": "..." }` to create a new one.
5. Forwards user input as `{ "type": "input", "id": "<id>", "data": "<text>" }`.
6. Forwards resize events as `{ "type": "resize", "id": "<id>", "cols": N, "rows": N }`.
7. Receives output as `{ "type": "output", "id": "<id>", "data": "<text>" }` and writes it to the terminal surface.

The reference implementation is `scripts/olympus-terminal.js` — a Node.js script that does all of the above and works in any terminal. The VSCode and Zed extensions are essentially thin wrappers around this CLI (Zed) or a native WebSocket client (VSCode).

See [EDITORS.md](../../EDITORS.md) for the full list of supported editors + per-OS install commands.

## License

AGPL-3.0-or-later. See [LICENSE](../../LICENSE) in the OLYMPUS root.
