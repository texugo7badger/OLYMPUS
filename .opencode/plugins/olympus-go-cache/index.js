"use strict";
/**
 * olympus-go-cache — Prompt cache instrumentation for OpenCode CLI v1.18.3.
 * Ports the pi-opencode-go-cache recipe to OpenCode v1.18.3's Plugin API.
 *
 * GLM models are SKIPPED — Z.AI's gateway rejects cache_control markers.
 *
 * MIT License — see CREDITS.md
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_os_1 = __importDefault(require("node:os"));
const SKIP_MODEL_PATTERNS = [/glm/i, /zhipu/i];
const CACHE_RETENTION = "24h";
function isGlmModel(modelId) {
    if (!modelId)
        return false;
    return SKIP_MODEL_PATTERNS.some((p) => p.test(modelId));
}
function computeProjectStableKey(cwd) {
    const override = process.env.OPENCODE_PROMPT_CACHE_KEY ??
        process.env.OPENCODE_STICKY_SESSION_ID;
    if (override)
        return override.slice(0, 64);
    const user = node_os_1.default.userInfo().username || "unknown";
    const host = node_os_1.default.hostname() || "localhost";
    const absCwd = cwd || process.cwd() || "unknown";
    const raw = `${user}@${host}:${absCwd}`;
    return node_crypto_1.default.createHash("sha256").update(raw).digest("hex").slice(0, 64);
}
function getModelId(model) {
    if (!model)
        return "";
    return String(model.api_id ?? model.id ?? "");
}
const plugin = async (input, _options) => {
    const log = (msg) => {
        if (process.env.OLYMPUS_DEBUG === "1")
            console.error(`[olympus-go-cache] ${msg}`);
    };
    return {
        "chat.params": async (hookInput, output) => {
            try {
                const modelId = getModelId(hookInput.model);
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
            }
            catch (err) {
                console.error("[olympus-go-cache] chat.params error:", err);
            }
        },
        "chat.headers": async (hookInput, output) => {
            try {
                const modelId = getModelId(hookInput.model);
                if (isGlmModel(modelId))
                    return;
                const cwd = input.directory || process.cwd();
                const cacheKey = computeProjectStableKey(cwd);
                output.headers = output.headers ?? {};
                output.headers["x-session-id"] = hookInput.sessionID;
                output.headers["conversation_id"] = cacheKey;
                output.headers["session_id"] = cacheKey;
            }
            catch (err) {
                console.error("[olympus-go-cache] chat.headers error:", err);
            }
        },
    };
};
exports.default = plugin;
//# sourceMappingURL=index.js.map