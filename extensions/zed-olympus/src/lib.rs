//! OLYMPUS Bridge — Zed extension
//!
//! v0.0.1 Editor Bridge patch — NEW FILE.
//!
//! Embeds the live OLYMPUS interactive terminal inside Zed. The terminal is
//! shared with the one running in the OLYMPUS Electron app — type in either,
//! see it in both.
//!
//! Zed's extension API (as of 2026-07) supports:
//!   - Context server commands (slash commands in the Assistant).
//!   - Custom commands invoked from the command palette.
//!   - Workspace + settings registration.
//!
//! It does NOT yet support:
//!   - Embedded terminal panes (the xterm.js webview pattern VSCode uses
//!     isn't available in Zed yet). When Zed adds terminal-pane extensions,
//!     this file will gain the `TerminalPane` implementation that connects
//!     to ws://127.0.0.1:3740 and renders xterm-equivalent output.
//!
//! Until then, this extension provides:
//!   1. A slash command `/olympus` in Zed's Assistant that opens a Zed
//!      built-in terminal running `olympus terminal` — which connects to
//!      the running OLYMPUS Terminal Bridge and streams the live PTY.
//!   2. A command palette action "OLYMPUS: Open in OLYMPUS" that focuses
//!      the Electron window via the bridge's `focus-olympus` message.
//!   3. A command palette action "OLYMPUS: Show Bridge Status" that runs
//!      `olympus terminal --status` and prints the output to a new buffer.
//!
//! License: AGPL-3.0-or-later (original OLYMPUS code).

use zed_extension_api::{
    register_slash_command, register_context_server_command,
    Command, ContextServerCommand, SlashCommand, SlashCommandOutput,
    Settings, SettingsStore, worktree, Output,
};

struct OlympusExtension;

impl OlympusExtension {
    fn olympus_bin(&self) -> String {
        // Find the `olympus` binary — check PATH first, then common install locations.
        if let Ok(path) = std::env::var("PATH") {
            for dir in path.split(':') {
                let candidate = std::path::Path::new(dir).join("olympus");
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }
        // Fall back to `olympus` on PATH (will fail with a clear error if missing).
        "olympus".to_string()
    }
}

impl Extension for OlympusExtension {
    fn activate(&mut self) {
        // Register the /olympus slash command in Zed's Assistant.
        register_slash_command(SlashCommand {
            name: "olympus".to_string(),
            description: "Open the live OLYMPUS terminal in a new Zed terminal pane".to_string(),
            tooltip: "Connects to the running OLYMPUS Terminal Bridge (ws://127.0.0.1:3740) and streams the live PTY. Make sure OLYMPUS is running (olympus dev).".to_string(),
        });

        // Register command-palette actions.
        register_context_server_command(ContextServerCommand {
            name: "olympus.open-terminal".to_string(),
            description: "OLYMPUS: Open Live Terminal (new Zed terminal running `olympus terminal`)".to_string(),
        });
        register_context_server_command(ContextServerCommand {
            name: "olympus.focus-electron".to_string(),
            description: "OLYMPUS: Open in OLYMPUS (focus the Electron window)".to_string(),
        });
        register_context_server_command(ContextServerCommand {
            name: "olympus.show-status".to_string(),
            description: "OLYMPUS: Show Bridge Status".to_string(),
        });
    }

    fn deactivate(&mut self) {}

    fn run_slash_command(
        &mut self,
        command: SlashCommand,
        _arguments: Vec<String>,
        _worktree: Option<&mut worktree::Worktree>,
    ) -> Result<SlashCommandOutput, String> {
        if command.name == "olympus" {
            // Open a new Zed terminal running `olympus terminal`.
            // The terminal inherits Zed's PTY, which connects to the OLYMPUS bridge.
            let olympus = self.olympus_bin();
            Command::new(&olympus)
                .arg("terminal")
                .arg("--spawn")
                .spawn_in_terminal()
                .map_err(|e| format!("Failed to spawn `olympus terminal`: {}", e))?;

            Ok(SlashCommandOutput {
                text: "Opened the live OLYMPUS terminal in a new Zed terminal pane. Type `exit` or close the pane to disconnect.".to_string(),
                run_commands_in_place: false,
            })
        } else {
            Err(format!("Unknown slash command: {}", command.name))
        }
    }

    fn run_context_server_command(
        &mut self,
        command: ContextServerCommand,
        _arguments: Vec<String>,
        worktree: Option<&mut worktree::Worktree>,
    ) -> Result<(), String> {
        let olympus = self.olympus_bin();
        match command.name.as_str() {
            "olympus.open-terminal" => {
                Command::new(&olympus)
                    .arg("terminal")
                    .arg("--spawn")
                    .spawn_in_terminal()
                    .map_err(|e| format!("Failed to spawn `olympus terminal`: {}", e))?;
                Ok(())
            }
            "olympus.focus-electron" => {
                // Send the focus-olympus message via a one-off Node script.
                // We can't open a raw WebSocket from Rust without a dep, so
                // we shell out to `node -e '...'` which is available everywhere
                // Zed runs.
                let script = r#"
                    const fs = require('fs');
                    const os = require('os');
                    const path = require('path');
                    const tokenPath = path.join(os.homedir(), '.olympus', 'terminal-bridge-token');
                    if (!fs.existsSync(tokenPath)) {
                        console.error('OLYMPUS not running — token file missing at ' + tokenPath);
                        process.exit(1);
                    }
                    const token = fs.readFileSync(tokenPath, 'utf-8').trim();
                    const WebSocket = require(path.join(process.cwd(), 'node_modules', 'ws'));
                    const ws = new WebSocket('ws://127.0.0.1:3740/?token=' + encodeURIComponent(token));
                    ws.on('open', () => {
                        ws.send(JSON.stringify({ type: 'focus-olympus' }));
                        setTimeout(() => { ws.close(); process.exit(0); }, 200);
                    });
                    ws.on('error', (e) => { console.error(e.message); process.exit(1); });
                "#;
                Command::new("node")
                    .arg("-e")
                    .arg(script)
                    .output()
                    .map_err(|e| format!("Failed to focus OLYMPUS: {}", e))?;
                Ok(())
            }
            "olympus.show-status" => {
                let output = Command::new(&olympus)
                    .arg("terminal")
                    .arg("--status")
                    .output()
                    .map_err(|e| format!("Failed to run `olympus terminal --status`: {}", e))?;
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                // Write the output to a new Zed scratch buffer.
                Output::channel("OLYMPUS Bridge Status")
                    .write_str(&format!("{}\n{}", stdout, stderr))
                    .map_err(|e| format!("Failed to write to output channel: {}", e))?;
                Ok(())
            }
            _ => Err(format!("Unknown command: {}", command.name)),
        }
    }
}

// Boilerplate trait + entry point. The Zed extension API expects an
// `Extension` trait and a `telemetry::register_extension!` macro.
trait Extension {
    fn activate(&mut self);
    fn deactivate(&mut self);
    fn run_slash_command(
        &mut self,
        command: SlashCommand,
        arguments: Vec<String>,
        worktree: Option<&mut worktree::Worktree>,
    ) -> Result<SlashCommandOutput, String>;
    fn run_context_server_command(
        &mut self,
        command: ContextServerCommand,
        arguments: Vec<String>,
        worktree: Option<&mut worktree::Worktree>,
    ) -> Result<(), String>;
}

zed_extension_api::register_extension!(OlympusExtension);
