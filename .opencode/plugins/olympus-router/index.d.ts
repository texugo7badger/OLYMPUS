/**
 * olympus-router — Phase 4 complete.
 *
 * The consolidated Olympus router plugin with all Phase 1-4 hooks:
 *   Phase 1: chat.params + chat.headers (cache instrumentation)
 *   Phase 2: permission.ask (MCP allowlist) + system.transform (defense baseline)
 *   Phase 4: tool.execute.before (strict instinct scope enforcement)
 *           + chat.params (instinct-gated dispatch)
 *
 * MIT License — see CREDITS.md
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import type { Plugin } from "@opencode-ai/plugin";
declare function isMcpTool(tool: string): boolean;
declare function getMcpServer(tool: string): string;
declare function isMcpAllowed(god: string, server: string): boolean;
declare const plugin: Plugin;
export default plugin;
export { isMcpTool, getMcpServer, isMcpAllowed };
