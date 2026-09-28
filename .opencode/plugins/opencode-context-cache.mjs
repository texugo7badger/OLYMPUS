/**
 * opencode-context-cache — vendored from JackDrogon/opencode-context-cache (MIT).
 * Source: https://github.com/JackDrogon/opencode-context-cache
 *
 * STANDALONE ALTERNATIVE to olympus-router. If you install olympus-router,
 * you do NOT need this file — olympus-router subsumes its logic.
 *
 * MIT License — see CREDITS.md
 */

import crypto from "node:crypto";
import os from "node:os";

function envOverride() {
  return (
    process.env.OPENCODE_PROMPT_CACHE_KEY ??
    process.env.OPENCODE_STICKY_SESSION_ID ??
    null
  );
}

function computeStableKey(cwd) {
  const override = envOverride();
  if (override) return override.slice(0, 64);

  const user = os.userInfo().username || "unknown";
  const host = os.hostname() || "localhost";
  const absCwd = cwd || process.cwd() || "unknown";
  const raw = `${user}@${host}:${absCwd}`;

  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 64);
}

async function plugin(input, _options) {
  return {
    "chat.params": async (hookInput, output) => {
      try {
        const key = computeStableKey(input.directory);
        output.options = output.options ?? {};
        output.options.promptCacheKey = key;
        output.options.prompt_cache_key = key;
        output.options.prompt_cache_retention = "24h";
      } catch (err) {
        console.error("[opencode-context-cache] chat.params error:", err);
      }
    },

    "chat.headers": async (hookInput, output) => {
      try {
        const key = computeStableKey(input.directory);
        output.headers = output.headers ?? {};
        output.headers["x-session-id"] = hookInput.sessionID;
        output.headers["conversation_id"] = key;
        output.headers["session_id"] = key;
      } catch (err) {
        console.error("[opencode-context-cache] chat.headers error:", err);
      }
    },
  };
}

export default plugin;
