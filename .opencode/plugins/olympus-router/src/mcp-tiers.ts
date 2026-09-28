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
export const GOD_MCP_TIERS: Record<string, GodMcpTiers> = {
  apollo: {
    hot: [
      { server: 'github', domains: [] },
      { server: 'mcp-gateway', domains: [] },
    ],
    warm: [],
    cold: [],
  },
  artemis: {
    // Artemis carries only sequential-thinking (HOT) — it does security
    // review via skills + the LLM, not via paid observability MCPs like
    // sentry/langfuse. Users who want those can add them back.
    hot: [
      { server: 'sequential-thinking', domains: [] },
    ],
    warm: [],
    cold: [],
  },
  athena: {
    hot: [
      { server: 'chrome-devtools', domains: ['frontend', 'ui'] },
      { server: 'playwright', domains: ['frontend', 'ui', 'testing'] },
    ],
    warm: [
      // opendesign — free, open-source, BYOK design-systems MCP (the
      // no-charge stand-in for the paid "magic" MCP): 71+ production design
      // systems queried on-demand via od_list_projects + od_get_project.
      // Low token cost.
      { server: 'opendesign', domains: ['frontend', 'design', 'design-system'] },
      { server: 'figma', domains: ['frontend', 'design'] },
      { server: 'shadcn', domains: ['frontend', 'design-system'] },
    ],
    cold: [
      // nakkas is heavyweight — only equip for design-system extraction tasks
      // where the god has explicitly reasoned that it needs the full design
      // token extraction pipeline.
      { server: 'nakkas', domains: ['design-system'] },
    ],
  },
  dionysus: {
    hot: [
      { server: 'playwright', domains: ['testing', 'e2e'] },
    ],
    warm: [],
    cold: [],
  },
  hephaestus: {
    hot: [
      { server: 'serena', domains: ['backend', 'code-edit'] },
    ],
    warm: [
      { server: 'context7', domains: ['backend', 'docs'] },
      { server: 'postgres', domains: ['backend', 'database'] },
    ],
    cold: [],
  },
  hermes: {
    hot: [
      { server: 'context7', domains: ['integration', 'docs'] },
    ],
    // Hermes relies on context7 (free library docs) as its primary research
    // tool; paid MCPs (firecrawl, tavily, langfuse) are not bundled. Users
    // who want web scraping/search can add firecrawl/tavily back.
    warm: [],
    cold: [],
  },
  persephone: {
    hot: [
      { server: 'postgres', domains: ['database', 'data'] },
    ],
    warm: [
      // kubernetes is bundled (free); the paid AWS MCPs (awslabs-s3,
      // awslabs-iam) are not. Users who need S3/IAM can add them back.
      { server: 'kubernetes', domains: ['devops', 'orchestration'] },
    ],
    cold: [],
  },
  prometheus: {
    hot: [
      { server: 'docker', domains: ['devops', 'container'] },
    ],
    warm: [
      // kubernetes + grafana are bundled (free); the paid vercel MCP is not.
      // Users who want Vercel deploy integration can add it back.
      { server: 'kubernetes', domains: ['devops', 'orchestration'] },
      { server: 'grafana', domains: ['devops', 'observability'] },
    ],
    cold: [],
  },
  callimachus: {
    // Callimachus is the background vault curator — he never dispatches to
    // MCPs. His allowlist is empty at every tier.
    hot: [],
    warm: [],
    cold: [],
  },
};

/**
 * Returns the flat list of all MCPs across all tiers for a god — used by
 * the permission.ask hook's backward-compatibility path and by anything
 * that still expects the old flat allowlist shape.
 */
export function flatAllowlistForGod(god: string): string[] {
  const tiers = GOD_MCP_TIERS[god];
  if (!tiers) return [];
  return [
    ...tiers.hot.map(e => e.server),
    ...tiers.warm.map(e => e.server),
    ...tiers.cold.map(e => e.server),
  ];
}

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
export function selectMcpsForTask(
  god: string,
  classification: {
    complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'architectural';
    domain: string;
    stack: string[];
  },
): { hot: string[]; warm: string[]; cold: string[] } {
  const tiers = GOD_MCP_TIERS[god];
  if (!tiers) return { hot: [], warm: [], cold: [] };

  const hot = tiers.hot.map(e => e.server);

  const warm = classification.complexity === 'trivial'
    ? []
    : tiers.warm
        .filter(e => {
          if (e.domains.length === 0) return true; // always-relevant
          const taskSignals = [classification.domain, ...classification.stack];
          return e.domains.some(d => taskSignals.includes(d));
        })
        .map(e => e.server);

  const warmSet = new Set(warm);
  const cold = tiers.cold
    .filter(e => {
      // A Cold MCP is "listed" (visible to the god as available-but-requires-
      // justification) only when its domains match the task — otherwise it
      // would clutter the prompt with irrelevant heavyweight tools.
      if (e.domains.length === 0) return true;
      const taskSignals = [classification.domain, ...classification.stack];
      return e.domains.some(d => taskSignals.includes(d));
    })
    .map(e => e.server)
    // De-dup against warm (in case a WARM-tier filter already promoted it).
    .filter(s => !warmSet.has(s));

  return { hot, warm, cold };
}
