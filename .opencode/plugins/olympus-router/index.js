"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMcpTool = isMcpTool;
exports.getMcpServer = getMcpServer;
exports.isMcpAllowed = isMcpAllowed;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
const index_js_1 = __importDefault(require("../olympus-go-cache/index.js"));
const instinct_gate_js_1 = require("./src/instinct-gate.js");
const skill_index_js_1 = require("./src/skill-index.js");
// Import the canonical tiered MCP map (single source of truth, shared
// with olympus-dynamic-context and the dispatch tool).
const mcp_tiers_js_1 = require("./src/mcp-tiers.js");
let promptDefenseBaseline = null;
function getPromptDefenseBaseline(pluginDir) {
    if (promptDefenseBaseline !== null)
        return promptDefenseBaseline;
    const path = (0, node_path_1.join)(pluginDir, "..", "skills", "prompt-defense-baseline", "SKILL.md");
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    try {
        const content = (0, node_fs_1.readFileSync)(path, "utf8");
        const match = content.match(/## The 6-Bullet Preamble\s*\n\s*```\s*\n([\s\S]*?)\n```/);
        promptDefenseBaseline = match ? match[1] : null;
    }
    catch {
        promptDefenseBaseline = null;
    }
    return promptDefenseBaseline;
}
function isMcpTool(tool) {
    return tool.startsWith("mcp_");
}
function getMcpServer(tool) {
    const withoutPrefix = tool.replace(/^mcp_/, "");
    const lastUnderscore = withoutPrefix.lastIndexOf("_");
    return lastUnderscore > 0 ? withoutPrefix.slice(0, lastUnderscore) : withoutPrefix;
}
function isMcpAllowed(god, server) {
    // The flat allowlist is the union of all three tiers (for legacy
    // callers). Tier-aware enforcement happens in the permission.ask hook
    // below (Hot always allowed, Warm allowed when domain matches, Cold
    // requires explicit dispatch trace justification).
    return (0, mcp_tiers_js_1.flatAllowlistForGod)(god).includes(server);
}
/**
 * Tier-aware MCP permission check.
 *
 * Returns one of:
 *   - 'allow'   — the MCP is in the god's HOT tier, OR in the WARM tier
 *                 and the task classification's domain/stack matches the
 *                 MCP's domain tags, OR the god has explicitly equipped
 *                 it via a recent olympus-dispatch call (recorded in the
 *                 COLD-tier equip log).
 *   - 'deny'    — the MCP is not in the god's allowlist at any tier.
 *   - 'cold'    — the MCP is in the god's COLD tier and the god has NOT
 *                 explicitly equipped it. The permission.ask hook treats
 *                 'cold' as a deny by default (Cold MCPs require explicit
 *                 reasoning to equip), but the god can override by
 *                 including the MCP in its dispatch trace.
 */
function checkMcpTier(god, server, classification, explicitlyEquippedMcps) {
    const tiers = mcp_tiers_js_1.GOD_MCP_TIERS[god];
    if (!tiers)
        return 'deny';
    // HOT — always allowed.
    if (tiers.hot.some(e => e.server === server))
        return 'allow';
    // Explicit equip (olympus-dispatch's `mcp` arg) — always allowed,
    // regardless of tier. This is how the god equips a Cold MCP after
    // reasoning that it needs one.
    if (explicitlyEquippedMcps.has(server))
        return 'allow';
    // WARM — allowed when complexity > trivial AND domain matches.
    if (classification && classification.complexity !== 'trivial') {
        const warmEntry = tiers.warm.find(e => e.server === server);
        if (warmEntry) {
            if (warmEntry.domains.length === 0)
                return 'allow'; // always-relevant
            const taskSignals = [classification.domain, ...classification.stack];
            if (warmEntry.domains.some(d => taskSignals.includes(d)))
                return 'allow';
            // Domain mismatch — fall through to deny. The MCP is in the god's
            // allowlist but not relevant to this task.
        }
    }
    // COLD — never auto-allowed. Must be explicitly equipped.
    if (tiers.cold.some(e => e.server === server))
        return 'cold';
    // Not in any tier for this god.
    return 'deny';
}
const plugin = async (input, options) => {
    const cacheHooks = await (0, index_js_1.default)(input, options);
    const pluginDir = input.directory || process.cwd();
    const hooks = {
        ...cacheHooks,
        "permission.ask": async (permission, output) => {
            try {
                const permStr = typeof permission === "string" ? permission : permission.key ?? "";
                if (!isMcpTool(permStr))
                    return;
                const server = getMcpServer(permStr);
                const { scope, agent } = (0, instinct_gate_js_1.getActiveScopeAndAgent)("");
                const activeGod = scope === "god" ? agent : "apollo";
                // Tier-aware MCP permission check.
                //
                // Parse the task classification from the env var (set by
                // /api/olympus/action and /api/olympus/intake before the opencode
                // spawn). When absent, fall back to the old flat-allowlist check.
                //
                // Read the set of MCPs the god has explicitly equipped via recent
                // olympus-dispatch calls. The dispatch tracker writes these to
                // ~/.olympus/equipped-mcps.json (one set per active dispatch).
                let classification = null;
                try {
                    const raw = process.env.OLYMPUS_TASK_CLASSIFICATION;
                    if (raw) {
                        const o = JSON.parse(raw);
                        classification = {
                            domain: o.domain ?? '',
                            stack: Array.isArray(o.stack) ? o.stack : [],
                            complexity: o.complexity ?? 'simple',
                        };
                    }
                }
                catch { }
                const explicitlyEquipped = new Set();
                try {
                    const equipPath = (0, node_path_1.join)((0, node_os_1.homedir)(), '.olympus', 'equipped-mcps.json');
                    if ((0, node_fs_1.existsSync)(equipPath)) {
                        const arr = JSON.parse((0, node_fs_1.readFileSync)(equipPath, 'utf-8'));
                        if (Array.isArray(arr))
                            for (const s of arr)
                                explicitlyEquipped.add(String(s));
                    }
                }
                catch { }
                const tier = checkMcpTier(activeGod, server, classification, explicitlyEquipped);
                if (tier === 'deny') {
                    output.status = "deny";
                    if (process.env.OLYMPUS_DEBUG === "1") {
                        console.error(`[olympus-router] denied MCP tool "${permStr}" (server "${server}" not in ${activeGod}'s allowlist)`);
                    }
                }
                else if (tier === 'cold') {
                    // COLD-tier MCP not explicitly equipped — deny and tell the god
                    // how to equip it. The god should include `mcp: "<server>"` in
                    // its next olympus-dispatch call to record the explicit equip.
                    output.status = "deny";
                    if (process.env.OLYMPUS_DEBUG === "1") {
                        console.error(`[olympus-router] denied COLD MCP tool "${permStr}" (server "${server}" requires explicit equip via olympus-dispatch)`);
                    }
                }
                // tier === 'allow' → fall through, output.status stays default (allow)
            }
            catch (err) {
                console.error("[olympus-router] permission.ask error:", err);
            }
        },
        "experimental.chat.system.transform": async (_input, output) => {
            try {
                const baseline = getPromptDefenseBaseline(pluginDir);
                if (baseline && output.system && output.system.length > 0) {
                    const last = output.system.length - 1;
                    output.system[last] = output.system[last] + "\n\n" + baseline;
                }
            }
            catch (err) {
                console.error("[olympus-router] system.transform error:", err);
            }
        },
        "tool.execute.before": async (toolInput, output) => {
            try {
                if (toolInput.tool === "olympus-instinct-query") {
                    const args = output.args;
                    if (args?.scope === "god") {
                        const { scope: callerScope, agent: callerAgent } = (0, instinct_gate_js_1.getActiveScopeAndAgent)(toolInput.sessionID);
                        const requestedAgent = args.agent_name ?? "";
                        if (!(0, instinct_gate_js_1.isScopeAllowed)(callerScope, callerAgent, "god", requestedAgent)) {
                            output.args = {
                                ...args,
                                scope: "sub-agent",
                                agent_name: callerAgent,
                                _olympus_enforcement: `Denied scope='god' for sub-agent ${callerAgent}. Forcing local scope.`,
                            };
                            if (process.env.OLYMPUS_DEBUG === "1") {
                                console.error(`[olympus-router] sub-agent ${callerAgent} denied scope='god' query for ${requestedAgent} — forced to local scope`);
                            }
                        }
                    }
                }
            }
            catch (err) {
                console.error("[olympus-router] tool.execute.before error:", err);
            }
        },
        "chat.params": async (hookInput, output) => {
            try {
                const { scope, agent } = (0, instinct_gate_js_1.getActiveScopeAndAgent)(hookInput.sessionID);
                if (scope !== "god")
                    return;
                const messageText = typeof hookInput.message === "string"
                    ? hookInput.message
                    : hookInput.message?.text ?? "";
                if (messageText.length === 0)
                    return;
                const result = (0, instinct_gate_js_1.queryInstincts)("god", agent, messageText, 3);
                output.options = output.options ?? {};
                output.options.olympus_instinct_gate = {
                    confidence: result.confidence,
                    short_circuit: result.short_circuit,
                    matching_instinct: result.matching_instinct
                        ? {
                            id: result.matching_instinct.id,
                            tags: result.matching_instinct.tags,
                            confidence: result.matching_instinct.confidence,
                            body: result.matching_instinct.body,
                        }
                        : null,
                    alternatives: result.alternatives.map((i) => ({
                        id: i.id,
                        tags: i.tags,
                        confidence: i.confidence,
                    })),
                    threshold: instinct_gate_js_1.CONFIDENCE_THRESHOLD,
                };
                // SEMANTIC SKILL SEARCH. When the instinct gate doesn't
                // short-circuit, search the skill index for the top-k most relevant
                // skills for this task. These are surfaced as a hint to the god
                // (not a forced assignment). The god's prompt already tells it to
                // evaluate task + instincts at dispatch time — this just gives it
                // the best skill candidates without loading all 360 skill descriptions.
                if (!result.short_circuit) {
                    try {
                        const skillIndex = (0, skill_index_js_1.getSkillIndex)();
                        if (skillIndex) {
                            const skillHits = skillIndex.search(messageText, agent, 5);
                            if (skillHits.length > 0) {
                                output.options.olympus_skill_search = skillHits.map(h => ({
                                    skill_id: h.skill_id,
                                    title: h.title,
                                    description: h.description,
                                    similarity: Math.round(h.similarity * 100) / 100,
                                    source_path: h.source_path,
                                }));
                                if (process.env.OLYMPUS_DEBUG === "1") {
                                    console.error(`[olympus-router] skill-search for ${agent}: ${skillHits.length} hits (top: ${skillHits[0].skill_id} @ ${skillHits[0].similarity.toFixed(2)})`);
                                }
                            }
                        }
                    }
                    catch (skillErr) {
                        // Graceful degradation — skill search is a hint, not critical
                        if (process.env.OLYMPUS_DEBUG === "1") {
                            console.error("[olympus-router] skill-search error:", skillErr);
                        }
                    }
                }
                if (process.env.OLYMPUS_DEBUG === "1") {
                    console.error(`[olympus-router] instinct-gate for ${agent}: confidence=${result.confidence.toFixed(3)} short_circuit=${result.short_circuit}`);
                }
            }
            catch (err) {
                console.error("[olympus-router] chat.params instinct-gate error:", err);
            }
        },
    };
    if (process.env.OLYMPUS_DEBUG === "1") {
        console.error("[olympus-router] loaded — Phase 4 complete");
    }
    return hooks;
};
exports.default = plugin;
//# sourceMappingURL=index.js.map