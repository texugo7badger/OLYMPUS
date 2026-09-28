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

import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import olympusGoCache from "../olympus-go-cache/index.js";
import { isScopeAllowed, getActiveScopeAndAgent, queryInstincts, CONFIDENCE_THRESHOLD } from "./src/instinct-gate.js";
import { getSkillIndex, type SkillHit } from "./src/skill-index.js";
// Import the canonical tiered MCP map (single source of truth, shared
// with olympus-dynamic-context and the dispatch tool).
import { GOD_MCP_TIERS, flatAllowlistForGod } from "./src/mcp-tiers.js";

let promptDefenseBaseline: string | null = null;

function getPromptDefenseBaseline(pluginDir: string): string | null {
  if (promptDefenseBaseline !== null) return promptDefenseBaseline;
  const path = join(pluginDir, "..", "skills", "prompt-defense-baseline", "SKILL.md");
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, "utf8");
    const match = content.match(/## The 6-Bullet Preamble\s*\n\s*```\s*\n([\s\S]*?)\n```/);
    promptDefenseBaseline = match ? match[1] : null;
  } catch {
    promptDefenseBaseline = null;
  }
  return promptDefenseBaseline;
}

// Defensive: permission.ask can fire with a non-string `tool` (observed as
// `tool.replace is not a function` in the opencode log when `tool` was
// undefined). Guard both helpers so the MCP gate never throws on bad input.
function isMcpTool(tool: unknown): boolean {
  return typeof tool === "string" && tool.startsWith("mcp_");
}

function getMcpServer(tool: unknown): string {
  if (typeof tool !== "string") return "";
  const withoutPrefix = tool.replace(/^mcp_/, "");
  const lastUnderscore = withoutPrefix.lastIndexOf("_");
  return lastUnderscore > 0 ? withoutPrefix.slice(0, lastUnderscore) : withoutPrefix;
}

function isMcpAllowed(god: string, server: string): boolean {
  // The flat allowlist is the union of all three tiers (for legacy
  // callers). Tier-aware enforcement happens in the permission.ask hook
  // below (Hot always allowed, Warm allowed when domain matches, Cold
  // requires explicit dispatch trace justification).
  return flatAllowlistForGod(god).includes(server);
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
function checkMcpTier(
  god: string,
  server: string,
  classification: { domain: string; stack: string[]; complexity: string } | null,
  explicitlyEquippedMcps: Set<string>,
): 'allow' | 'deny' | 'cold' {
  const tiers = GOD_MCP_TIERS[god];
  if (!tiers) return 'deny';

  // HOT — always allowed.
  if (tiers.hot.some(e => e.server === server)) return 'allow';

  // Explicit equip (olympus-dispatch's `mcp` arg) — always allowed,
  // regardless of tier. This is how the god equips a Cold MCP after
  // reasoning that it needs one.
  if (explicitlyEquippedMcps.has(server)) return 'allow';

  // WARM — allowed when complexity > trivial AND domain matches.
  if (classification && classification.complexity !== 'trivial') {
    const warmEntry = tiers.warm.find(e => e.server === server);
    if (warmEntry) {
      if (warmEntry.domains.length === 0) return 'allow'; // always-relevant
      const taskSignals = [classification.domain, ...classification.stack];
      if (warmEntry.domains.some(d => taskSignals.includes(d))) return 'allow';
      // Domain mismatch — fall through to deny. The MCP is in the god's
      // allowlist but not relevant to this task.
    }
  }

  // COLD — never auto-allowed. Must be explicitly equipped.
  if (tiers.cold.some(e => e.server === server)) return 'cold';

  // Not in any tier for this god.
  return 'deny';
}

const plugin: Plugin = async (input, options) => {
  const cacheHooks = await olympusGoCache(input, options);
  const pluginDir = input.directory || process.cwd();

  const hooks: Hooks = {
    ...cacheHooks,

    "permission.ask": async (permission, output) => {
      try {
        const permStr = typeof permission === "string" ? permission : (permission as { key?: string }).key ?? "";
        if (!isMcpTool(permStr)) return;
        const server = getMcpServer(permStr);
        const { scope, agent } = getActiveScopeAndAgent("");
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
        let classification: { domain: string; stack: string[]; complexity: string } | null = null;
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
        } catch {}

        const explicitlyEquipped = new Set<string>();
        try {
          const equipPath = join(homedir(), '.olympus', 'equipped-mcps.json');
          if (existsSync(equipPath)) {
            const arr = JSON.parse(readFileSync(equipPath, 'utf-8'));
            if (Array.isArray(arr)) for (const s of arr) explicitlyEquipped.add(String(s));
          }
        } catch {}

        const tier = checkMcpTier(activeGod, server, classification, explicitlyEquipped);
        if (tier === 'deny') {
          output.status = "deny";
          if (process.env.OLYMPUS_DEBUG === "1") {
            console.error(`[olympus-router] denied MCP tool "${permStr}" (server "${server}" not in ${activeGod}'s allowlist)`);
          }
        } else if (tier === 'cold') {
          // COLD-tier MCP not explicitly equipped — deny and tell the god
          // how to equip it. The god should include `mcp: "<server>"` in
          // its next olympus-dispatch call to record the explicit equip.
          output.status = "deny";
          if (process.env.OLYMPUS_DEBUG === "1") {
            console.error(`[olympus-router] denied COLD MCP tool "${permStr}" (server "${server}" requires explicit equip via olympus-dispatch)`);
          }
        }
        // tier === 'allow' → fall through, output.status stays default (allow)
      } catch (err) {
        console.error("[olympus-router] permission.ask error:", err);
      }
    },

    "experimental.chat.system.transform": async (hookInput, output) => {
      try {
        // Groq-only skills strip. Groq's free tier has a razor-thin 12K TPM
        // window and opencode 1.18 injects the full <available_skills> block
        // (130K+ chars) regardless of agent.skills[]. Stripping it only for
        // Groq keeps the free tier usable while leaving GO/OpenRouter prompts
        // untouched. Conservative: if the block can't be matched exactly, we
        // leave the prompt unchanged.
        const model = hookInput.model;
        const isGroq =
          model?.providerID === "groq" ||
          (typeof model?.id === "string" && model.id.startsWith("groq/"));
        if (isGroq && output.system && output.system.length > 0) {
          for (let i = 0; i < output.system.length; i++) {
            const blockStart = output.system[i].indexOf("<available_skills>");
            if (blockStart === -1) continue;
            const blockEnd = output.system[i].indexOf("</available_skills>", blockStart);
            if (blockEnd === -1) continue;
            const replacement =
              output.system[i].slice(0, blockStart) +
              "<available_skills>Skills list omitted for Groq free tier (12K TPM window). Use the skill tool to look up skills on demand.</available_skills>" +
              output.system[i].slice(blockEnd + "</available_skills>".length);
            output.system[i] = replacement;
            if (process.env.OLYMPUS_DEBUG === "1") {
              console.error("[olympus-router] stripped <available_skills> block for Groq free tier");
            }
            break;
          }
        }

        const baseline = getPromptDefenseBaseline(pluginDir);
        if (baseline && output.system && output.system.length > 0) {
          const last = output.system.length - 1;
          output.system[last] = output.system[last] + "\n\n" + baseline;
        }
      } catch (err) {
        console.error("[olympus-router] system.transform error:", err);
      }
    },

    "tool.execute.before": async (toolInput, output) => {
      try {
        if (toolInput.tool === "olympus-instinct-query") {
          const args = output.args as { scope?: string; agent_name?: string } | undefined;
          if (args?.scope === "god") {
            const { scope: callerScope, agent: callerAgent } = getActiveScopeAndAgent(toolInput.sessionID);
            const requestedAgent = args.agent_name ?? "";
            if (!isScopeAllowed(callerScope, callerAgent, "god", requestedAgent)) {
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
      } catch (err) {
        console.error("[olympus-router] tool.execute.before error:", err);
      }
    },

    "chat.params": async (hookInput, output) => {
      try {
        const { scope, agent } = getActiveScopeAndAgent(hookInput.sessionID);
        if (scope !== "god") return;
        const messageText =
          typeof hookInput.message === "string"
            ? hookInput.message
            : (hookInput.message as { text?: string })?.text ?? "";
        if (messageText.length === 0) return;
        const result = queryInstincts("god", agent, messageText, 3);
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
          threshold: CONFIDENCE_THRESHOLD,
        };

        // SEMANTIC SKILL SEARCH. When the instinct gate doesn't
        // short-circuit, search the skill index for the top-k most relevant
        // skills for this task. These are surfaced as a hint to the god
        // (not a forced assignment). The god's prompt already tells it to
        // evaluate task + instincts at dispatch time — this just gives it
        // the best skill candidates without loading all 360 skill descriptions.
        if (!result.short_circuit) {
          try {
            const skillIndex = getSkillIndex();
            if (skillIndex) {
              const skillHits: SkillHit[] = skillIndex.search(messageText, agent, 5);
              if (skillHits.length > 0) {
                output.options.olympus_skill_search = skillHits.map(h => ({
                  skill_id: h.skill_id,
                  title: h.title,
                  description: h.description,
                  similarity: Math.round(h.similarity * 100) / 100,
                  source_path: h.source_path,
                }));
                if (process.env.OLYMPUS_DEBUG === "1") {
                  console.error(
                    `[olympus-router] skill-search for ${agent}: ${skillHits.length} hits (top: ${skillHits[0].skill_id} @ ${skillHits[0].similarity.toFixed(2)})`
                  );
                }
              }
            }
          } catch (skillErr) {
            // Graceful degradation — skill search is a hint, not critical
            if (process.env.OLYMPUS_DEBUG === "1") {
              console.error("[olympus-router] skill-search error:", skillErr);
            }
          }
        }

        if (process.env.OLYMPUS_DEBUG === "1") {
          console.error(
            `[olympus-router] instinct-gate for ${agent}: confidence=${result.confidence.toFixed(3)} short_circuit=${result.short_circuit}`
          );
        }
      } catch (err) {
        console.error("[olympus-router] chat.params instinct-gate error:", err);
      }
    },
  };

  if (process.env.OLYMPUS_DEBUG === "1") {
    console.error("[olympus-router] loaded — Phase 4 complete");
  }

  return hooks;
};

export default plugin;
// GOD_MCP_ALLOWLIST is intentionally NOT re-exported from this module.
// The tier map lives in ./src/mcp-tiers.js (imported above as GOD_MCP_TIERS);
// callers that need the flat allowlist should use flatAllowlistForGod()
// from ./src/mcp-tiers.js.
export { isMcpTool, getMcpServer, isMcpAllowed };
