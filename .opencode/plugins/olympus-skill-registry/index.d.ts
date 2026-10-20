/**
 * olympus-skill-registry — v0.0.2 Lazy-Load Edition
 *
 * Auto-discovers skills created by gods and registers them in OpenCode's
 * config. This makes god-created skills immediately available without
 * manual opencode.json edits.
 *
 * UPDATE v0.0.2: Switched from "scan all skills at config-load time" to
 * "lazy scan on first chat.params hook". This prevents the 330-skill
 * directory scan from blocking OpenCode startup.
 *
 * Behavior:
 *   - On `config` hook: NO scan (just initializes the config.skills.paths
 *     array if missing). This is critical — scanning 330 skill files at
 *     startup adds 200-500ms to cold-start time, which combined with
 *     other plugin loads can push startup past the user's patience.
 *   - On first `chat.params` hook: lazy-scan .opencode/skills/<god>/
 *     for SKILL.md files. Add each god's skill directory to
 *     config.skills.paths (idempotent). The scan runs ONCE per session
 *     and is cached — subsequent chat.params calls skip it.
 *   - The skill-author tool touches a sentinel file
 *     (~/.olympus/skills-registry.reload) when it creates a new skill.
 *     The next chat.params call checks the sentinel and re-scans if
 *     the sentinel is newer than the last scan.
 *
 * Why a plugin (not just opencode.json):
 *   - The opencode.json `skills.paths` array is a fixed list at session start.
 *   - But gods can create new skills DURING a session (via skill-author).
 *   - This plugin re-scans on sentinel change, so newly-created skills
 *     are picked up within the same session.
 *
 * Quality constraints:
 *   - Cross-platform — Windows, macOS, Linux.
 *   - No emojis.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import type { Plugin } from "@opencode-ai/plugin";
declare const plugin: Plugin;
export default plugin;
