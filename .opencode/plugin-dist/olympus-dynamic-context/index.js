"use strict";
/**
 * olympus-dynamic-context — V2 ENTRY (the v2 protocol, 2026-10-23).
 *
 * The token-budget preamble builder lives untouched in ./v1.ts; this
 * adapter feeds it the v2 session context. The v1 hook rewrote
 * `output.system` (string[]); v2 carries `SystemPart[]`, so the adapter
 * diffs the last part and appends only the delta — cache hints and
 * metadata on the part survive.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const v1_js_1 = __importDefault(require("./v1.js"));
function lastUserText(messages) {
    if (!Array.isArray(messages))
        return "";
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (!m || m.role !== "user")
            continue;
        const parts = Array.isArray(m.parts) ? m.parts : Array.isArray(m.content) ? m.content : [];
        const text = parts
            .map((p) => (typeof p === "string" ? p : typeof p?.text === "string" ? p.text : ""))
            .join("\n")
            .trim();
        if (text)
            return text;
        if (typeof m.content === "string" && m.content.trim())
            return m.content.trim();
    }
    return "";
}
const plugin = {
    id: "olympus-dynamic-context",
    async setup(ctx) {
        const hooks = await v1_js_1.default({}, {});
        const transform = hooks["experimental.chat.messages.transform"];
        if (typeof transform !== "function")
            return;
        await ctx.session.hook("context", async (sctx) => {
            try {
                const before = (sctx.system ?? []).map((p) => typeof p === "string" ? p : String(p?.text ?? ""));
                const out = { system: before.slice() };
                await transform({ message: lastUserText(sctx.messages) }, out);
                const beforeLast = before.length ? before[before.length - 1] : "";
                const afterLast = out.system.length ? out.system[out.system.length - 1] : "";
                if (afterLast === beforeLast)
                    return;
                if (sctx.system.length > 0) {
                    sctx.system[sctx.system.length - 1].text = afterLast;
                }
                else {
                    sctx.system.push({ type: "text", text: afterLast });
                }
            }
            catch (err) {
                console.error(`[olympus-dynamic-context:v2] context hook failed: ${err?.message || err}`);
            }
        });
    },
};
module.exports = plugin;
//# sourceMappingURL=index.js.map