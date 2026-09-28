/**
 * MCP API Key Gate.
 *
 * The maintainer said: "MCPs that require API keys must NOT be called unless
 * their API is registered." This module implements that gate.
 *
 * The olympus-hooks.ts `tool.execute.before` hook calls
 * `isMcpApiKeyConfigured(name)` before allowing an MCP tool call. If the
 * required env vars are missing, the hook BLOCKS the call with a user-facing
 * message pointing to Settings → API Keys.
 *
 * Configuration sources (checked in order, first hit wins):
 *   1. ~/.olympus/api-configs.json (JSON object: { KEY: "value", ... })
 *   2. ~/.olympus/.env (KEY=value lines)
 *   3. process.env (fallback — set by the launcher)
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Maps MCP server name → required env vars.
 *
 * Only lists MCPs that ship with OLYMPUS and require API keys.
 * MCPs NOT in this map are treated as "no API key required" and pass.
 *
 * Keep these sources in sync:
 *   - src/lib/mcp-api-requirements.ts (source of truth — UI rendering)
 *   - .opencode/olympus/lib/mcp-gate.ts (this file — runtime gate)
 */
export const MCP_API_REQUIREMENTS: Record<string, {
  envVars: string[];
  note?: string;
}> = {
  github:        { envVars: ["GITHUB_PERSONAL_ACCESS_TOKEN"] },
  grafana:       { envVars: ["GRAFANA_URL", "GRAFANA_API_KEY"] },
  figma:         { envVars: ["FIGMA_API_KEY"] },
};

/**
 * Cached reads of the config files. We re-read on every call (the files
 * are tiny and the gate is called per-tool-call — caching would risk
 * returning stale data after the user adds a key via Settings → API Keys).
 */
function readApiConfigs(): Record<string, string> {
  const p = join(homedir(), ".olympus", "api-configs.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function readEnvFile(): Record<string, string> {
  const p = join(homedir(), ".olympus", ".env");
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(p, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* ignore */ }
  return out;
}

/**
 * Check whether a single env var is configured. Checks (in order):
 *   1. ~/.olympus/api-configs.json
 *   2. ~/.olympus/.env
 *   3. process.env
 */
function isEnvVarConfigured(key: string): boolean {
  const apiConfigs = readApiConfigs();
  if (apiConfigs[key]) return true;
  const envFile = readEnvFile();
  if (envFile[key]) return true;
  if (process.env[key]) return true;
  // Do NOT fall back from OPENCODE_API_KEY to OPENAI_API_KEY. The OpenCode GO
  // plan key is not an OpenAI key — using it as one would silently mislead
  // the user (different API, different provider). Clients requiring an
  // OPENAI_API_KEY must have one explicitly configured; otherwise the
  // dependent MCP is locked.
  return false;
}

/**
 * Returns true if the MCP server is allowed to be invoked.
 *
 * Checks BOTH:
 *   1. The enable/disable toggle from ~/.olympus/mcp-state.json
 *      (set by the MCP Configuration panel). Disabled MCPs are blocked.
 *   2. API key requirements (for MCPs that need keys).
 *
 * For MCPs in MCP_API_REQUIREMENTS, ALL required env vars must be present.
 * For MCPs NOT in the map (no API key required), only the toggle is checked.
 */
export function isMcpApiKeyConfigured(mcpServer: string): {
  configured: boolean;
  missing: string[];
  disabled?: boolean;
} {
  // Check the enable/disable toggle first
  if (!isMcpEnabled(mcpServer)) {
    return { configured: false, missing: [], disabled: true };
  }

  const req = MCP_API_REQUIREMENTS[mcpServer];
  if (!req) return { configured: true, missing: [] };
  const missing: string[] = [];
  for (const k of req.envVars) {
    if (!isEnvVarConfigured(k)) missing.push(k);
  }
  return { configured: missing.length === 0, missing };
}

/**
 * Check if an MCP is enabled in ~/.olympus/mcp-state.json.
 * Returns true if enabled (default when not in the state file).
 */
function isMcpEnabled(mcpServer: string): boolean {
  try {
    const p = join(homedir(), ".olympus", "mcp-state.json");
    if (!existsSync(p)) return true; // default: enabled
    const data = JSON.parse(readFileSync(p, "utf-8"));
    const enabled = data.enabled || data;
    if (typeof enabled === "object" && mcpServer in enabled) {
      return enabled[mcpServer] === true;
    }
    return true; // not in the map → default enabled
  } catch {
    return true; // error reading → default enabled
  }
}

/**
 * Build a user-facing error message for a blocked MCP call. Used by the
 * olympus-hooks.ts tool.execute.before hook.
 */
export function mcpGateErrorMessage(mcpServer: string, missing: string[]): string {
  return `MCP "${mcpServer}" requires ${missing.join(", ")} — configure it in Settings → API Keys.`;
}
