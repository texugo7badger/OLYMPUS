/**
 * olympus-mcp-tiers — Single source of truth for the Hot/Warm/Cold MCP tier map.
 *
 * Introduces a tiered MCP allowlist per god.
 *
 *   HOT  = always-available MCPs (pre-injected in the god's system prompt).
 *          These are the god's core specialist tools — small set, high value,
 *          always loaded. Roughly mirrors the god's "Available Skills (Hot Tier)"
 *          from mastered-skills/<god>.md.
 *
 *   WARM = stack/domain-relevant MCPs. Loaded on-demand when the task
 *          classification's complexity > 'trivial' AND the task's domain/stack
 *          matches the MCP's domain tags. Medium set.
 *
 *   COLD = all other MCPs in the god's allowlist. NOT loaded by default —
 *          the god must explicitly request them via the olympus-dispatch tool's
 *          `mcp` arg (with a written justification in the dispatch trace).
 *          This guards the input token budget: Cold MCPs are only equipped
 *          when the god has reasoned that it needs them.
 *
 * The tier assignment is hand-curated per god based on the god's domain:
 *   - Apollo (master planner): github + mcp-gateway are HOT (always needed
 *     for dispatch + repo access).
 *   - Athena (frontend): chrome-devtools + playwright are HOT (every UI task
 *     needs them); figma + shadcn + magic are WARM (loaded for non-trivial UI
 *     work); nakkas is COLD (heavyweight, only for design-system extraction).
 *   - Hephaestus (backend): serena is HOT (every code-edit task); context7 +
 *     postgres are WARM (loaded for non-trivial backend work).
 *   - etc.
 *
 * This file is imported by:
 *   - .opencode/plugins/olympus-dynamic-context/index.ts (renders the tiers
 *     into the god's system prompt at chat.messages.transform time)
 *   - .opencode/plugins/olympus-router/index.ts (tier-aware permission.ask
 *     hook — Hot always allowed, Warm allowed when domain matches, Cold
 *     requires explicit dispatch trace justification)
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
export interface McpTierEntry {
    /** MCP server name (matches the key in .mcp.json). */
    server: string;
    /**
     * Domain tags — used by the WARM tier filter. When the task
     * classification's `domain` or any of its `stack` entries matches one of
     * these tags, the MCP is promoted from COLD to WARM.
     *
     * An empty array means "always WARM when complexity > trivial" (i.e. the
     * MCP is relevant to every non-trivial task the god handles).
     */
    domains: string[];
}
export interface GodMcpTiers {
    hot: McpTierEntry[];
    warm: McpTierEntry[];
    cold: McpTierEntry[];
}
/**
 * The canonical per-god MCP tier map.
 *
 * Replaces the per-file flat GOD_MCP_ALLOWLIST that would otherwise live
 * in both olympus-dynamic-context/index.ts and olympus-router/index.ts;
 * those files import this map as the single source of truth.
 *
 * For each god, the union of hot + warm + cold is the full MCP allowlist —
 * tiering is a loading/permission policy, not a membership filter. A Cold
 * MCP the god hasn't explicitly equipped via olympus-dispatch is denied by
 * the permission.ask hook.
 */
export declare const GOD_MCP_TIERS: Record<string, GodMcpTiers>;
/**
 * Returns the flat list of all MCPs across all tiers for a god — used by
 * the permission.ask hook's backward-compatibility path and by anything
 * that still expects the old flat allowlist shape.
 */
export declare function flatAllowlistForGod(god: string): string[];
/**
 * Returns the set of MCPs that should be injected into the god's system
 * prompt for a given task classification.
 *
 *   - HOT: always included.
 *   - WARM: included when complexity > 'trivial' AND (the MCP has no
 *     domain tags OR at least one tag matches the task's domain or stack).
 *   - COLD: NEVER included in the prompt — the god must explicitly equip
 *     them via olympus-dispatch's `mcp` arg.
 *
 * Returns `{ hot, warm, cold }` so the caller can render all three tiers
 * in the prompt (the Cold tier is listed by name with an "equip only with
 * justification" instruction, so the god knows what's available but
 * understands the cost).
 */
export declare function selectMcpsForTask(god: string, classification: {
    complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'architectural';
    domain: string;
    stack: string[];
}): {
    hot: string[];
    warm: string[];
    cold: string[];
};
