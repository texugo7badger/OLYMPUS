/**
 * olympus-skill-search — v0.1.3: the missing consumer for the skill index.
 *
 * The router already computed TF-IDF cosine hits in chat.params but stored
 * them in `output.options.olympus_skill_search`, which NO runtime consumed.
 * This tool makes the index usable on demand: the god asks for the best
 * skills, gets title + one-line description + similarity, and can equip one
 * via its normal skill tool.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { getSkillIndex } from "../../src/olympus-router/src/skill-index.js";

const skillSearchTool: ToolDefinition = tool({
  description:
    "Search OLYMPUS's skill index (TF-IDF cosine over 378 skills) for the skills most relevant to a task. Returns skill_id, title, one-line description and similarity. Use it when the hot/warm skill list does not cover a cold capability; equip the chosen skill with the normal skill tool.",
  args: {
    query: tool.schema.string().describe("What you need to do, in natural language."),
    god: tool.schema.string().optional().describe("God scope (defaults to apollo)."),
    k: tool.schema.number().optional().describe("Number of hits (1-10, default 5)."),
  },
  execute: async (args: { query: string; god?: string; k?: number }) => {
    const query = String(args.query || "").trim();
    if (!query) return { output: JSON.stringify({ ok: false, error: "query is required" }) };
    const k = Math.max(1, Math.min(10, Number(args.k) || 5));
    try {
      const index = getSkillIndex();
      if (!index) {
        return { output: JSON.stringify({ ok: false, error: "skill index unavailable — run node scripts/build-skill-index.js" }) };
      }
      const hits = index.search(query, String(args.god || "apollo").toLowerCase(), k);
      return {
        output: JSON.stringify({
          ok: true,
          query,
          count: hits.length,
          hits: hits.map((h) => ({
            skill_id: h.skill_id,
            title: h.title,
            description: (h.description || "").slice(0, 220),
            similarity: Math.round(h.similarity * 1000) / 1000,
            source_path: h.source_path,
          })),
          note: "Hints, not mandates. Equip a skill only if it fits the task.",
        }, null, 2),
      };
    } catch (err: any) {
      return { output: JSON.stringify({ ok: false, error: err?.message || String(err) }) };
    }
  },
});

export default skillSearchTool;
