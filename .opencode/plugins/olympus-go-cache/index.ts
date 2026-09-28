/**
 * olympus-go-cache — Prompt cache instrumentation for OpenCode CLI v1.18.3.
 * Ports the pi-opencode-go-cache recipe to OpenCode v1.18.3's Plugin API.
 *
 * GLM models are SKIPPED — Z.AI's gateway rejects cache_control markers.
 *
 * MIT License — see CREDITS.md
 */

import type { Plugin, Hooks } from "@opencode-ai/plugin";
import crypto from "node:crypto";
import os from "node:os";

const SKIP_MODEL_PATTERNS = [/glm/i, /zhipu/i];
const CACHE_RETENTION = "24h";

function isGlmModel(modelId: string | undefined): boolean {
  if (!modelId) return false;
  return SKIP_MODEL_PATTERNS.some((p) => p.test(modelId));
}

function computeProjectStableKey(cwd: string | undefined): string {
  const override =
    process.env.OPENCODE_PROMPT_CACHE_KEY ??
    process.env.OPENCODE_STICKY_SESSION_ID;
  if (override) return override.slice(0, 64);

  const user = os.userInfo().username || "unknown";
  const host = os.hostname() || "localhost";
  const absCwd = cwd || process.cwd() || "unknown";
  const raw = `${user}@${host}:${absCwd}`;

  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 64);
}

function getModelId(model: { api_id?: string; id?: string; [k: string]: unknown } | undefined): string {
  if (!model) return "";
  return String(model.api_id ?? model.id ?? "");
}

const plugin: Plugin = async (input, _options) => {
  const log = (msg: string) => {
    if (process.env.OLYMPUS_DEBUG === "1") console.error(`[olympus-go-cache] ${msg}`);
  };

  return {
    "chat.params": async (hookInput, output) => {
      try {
        const modelId = getModelId(hookInput.model as { api_id?: string; id?: string });
        const sessionId = hookInput.sessionID;

        if (isGlmModel(modelId)) {
          log(`skipping GLM model "${modelId}" (implicit Z.AI caching only)`);
          return;
        }

        const cwd = input.directory || process.cwd();
        const cacheKey = computeProjectStableKey(cwd);

        output.options = output.options ?? {};
        output.options.promptCacheKey = cacheKey;
        output.options.prompt_cache_key = cacheKey;
        output.options.prompt_cache_retention = CACHE_RETENTION;
        output.options.cache_control = { type: "ephemeral", ttl: "1h" };

        log(`set promptCacheKey for model "${modelId}" session "${sessionId}"`);
      } catch (err) {
        console.error("[olympus-go-cache] chat.params error:", err);
      }
    },

    "chat.headers": async (hookInput, output) => {
      try {
        const modelId = getModelId(hookInput.model as { api_id?: string; id?: string });
        if (isGlmModel(modelId)) return;

        const cwd = input.directory || process.cwd();
        const cacheKey = computeProjectStableKey(cwd);

        output.headers = output.headers ?? {};
        output.headers["x-session-id"] = hookInput.sessionID;
        output.headers["conversation_id"] = cacheKey;
        output.headers["session_id"] = cacheKey;
      } catch (err) {
        console.error("[olympus-go-cache] chat.headers error:", err);
      }
    },
  } satisfies Hooks;
};

export default plugin;
