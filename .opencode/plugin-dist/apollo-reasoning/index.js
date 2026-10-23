"use strict";
/**
 * apollo-reasoning — V2 ENTRY (the planner patience fix, ported 2026-10-23).
 *
 * THE SPECIMEN (2026-10-16): glm-5.3 served Apollo's planning turn with the
 * full 16384 reasoning mouth — input=1305, reasoning=16384, output=0, 20.6
 * minutes. The replay with reasoning_effort=low: the same killer prompt
 * emitted the full 7,333-char dispatch-plan in 171s.
 *
 * OpenCode v2 has no `chat.params` hook; the request's provider options are
 * built from the SessionContext, so this plugin mutates `ctx.options` in
 * `session.hook("context")` — the v2 wire path (the same place the v2
 * bridge stamps its own request overrides).
 *
 * SCOPE: ONLY the free NVIDIA lanes (providerID starts with "nvidia-") —
 * every god on those lanes runs a pre-planned HOP (the plan already did
 * the thinking). GO/Zen lanes keep full-depth reasoning.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
const plugin = {
    id: "apollo-reasoning",
    async setup(ctx) {
        await ctx.session.hook("context", (sctx) => {
            try {
                const providerID = String(sctx?.model?.providerID ?? "");
                if (!providerID.startsWith("nvidia-"))
                    return;
                sctx.options = sctx.options ?? {};
                // Belt and braces: both spellings ride — the provider builder keeps
                // the honored one (the v1 wire intercept carried provider options
                // verbatim; the top-level key alone was dropped on 1.18).
                sctx.options.reasoning_effort = "low";
                sctx.options.reasoningEffort = "low";
            }
            catch (err) {
                console.error(`[apollo-reasoning:v2] context hook failed: ${err?.message || err}`);
            }
        });
    },
};
module.exports = plugin;
//# sourceMappingURL=index.js.map