/**
 * Olympus Overlay Plugin — Entry Point
 *
 * This module exports the Olympus overlay plugin for OpenCode. It's
 * registered as the THIRD plugin in opencode.json's plugin array
 * (after ./plugins [ECC] and superpowers), so its hooks run last.
 *
 * The plugin provides:
 *   - permission.ask: blocks Callimachus from writing outside ~/OLYMPUS-VAULT/
 *   - shell.env: injects OLYMPUS_* env vars into bash sessions
 *   - experimental.session.compacting: preserves overlay state across compaction
 *   - tool.execute.before: tracks the active agent
 *   - tool.execute.after: logs dispatches to the activity feed
 *   - session.idle: fires Callimachus heartbeat (with lockfile)
 *   - Custom tools: olympus-instinct-query, olympus-shortcircuit, olympus-dispatch
 *
 * Build: npx tsc --project .opencode/olympus/tsconfig.json
 *        (produces .opencode/olympus/dist/index.js, which OpenCode loads)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export { OlympusHooksPlugin } from "./olympus-hooks.js";

/* ── THE OPENCODE V2 LANE (the activation, 2026-10-18) ──────────────────
 * v2 loads the DEFAULT export as a Plugin.define; v1 (and the battery's
 * v1 shims) keep the named OlympusHooksPlugin export. One source of
 * truth, two protocols: the v2-bridge builds the v1 machinery and wires
 * it to the v2 domains (see v2-bridge.ts). */
export { OlympusV2Plugin, default as defaultV2 } from "./v2-bridge.js";
export { default } from "./v2-bridge.js";


// Re-export for named imports
export * from "./olympus-hooks.js";
