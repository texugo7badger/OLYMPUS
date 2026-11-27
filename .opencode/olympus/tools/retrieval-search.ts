/**
 * olympus-retrieval-search — v0.1.3: hybrid local retrieval for the gods.
 *
 * Wraps the Retrieval Bus (FTS5 + 768d dense + RRF). This is the tool the
 * dynamic-context prompt points at for cold skills/knowledge. It returns
 * cited candidates, never a context dump.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { retrieve, retrievalMetrics } from "../../../src/lib/retrieval/bus.js";
import { getActiveContext } from "../../../src/lib/learning/active-context.js";

const retrievalSearchTool: ToolDefinition = tool({
  description:
    "Search the local hybrid index (FTS5/BM25 + 768d dense + RRF) across skills, knowledge notes, instincts and patterns. Returns cited candidates for the task. Use it for cold capabilities; never treat a hit as a mandate.",
  args: {
    query: tool.schema.string().describe("The task or question to retrieve context for."),
    kinds: tool.schema.array(tool.schema.string()).optional().describe("Optional kinds: skill, knowledge, instinct, pattern, doc."),
    god: tool.schema.string().optional().describe("God scope; defaults to the active god or all."),
    limit: tool.schema.number().optional().describe("Number of hits (1-10, default 6)."),
  },
  execute: async (args: { query: string; kinds?: string[]; god?: string; limit?: number }) => {
    const query = String(args.query || "").trim();
    if (!query) return { output: JSON.stringify({ ok: false, error: "query is required" }) };
    const ctx = getActiveContext();
    const allowed = new Set(["skill", "knowledge", "instinct", "pattern", "doc", "media"]);
    const kinds = Array.isArray(args.kinds) ? args.kinds.filter((k) => allowed.has(k)) : undefined;
    const hits = await retrieve({
      query,
      kinds: kinds as any,
      god: args.god || null,
      project: ctx.slug,
      stacks: ctx.stacks,
      limit: Math.max(1, Math.min(10, Number(args.limit) || 6)),
    });
    return {
      output: JSON.stringify({
        ok: true,
        query,
        count: hits.length,
        hits,
        metrics: retrievalMetrics(hits),
        note: "Cited local context. Verify before acting; the index is a hint, not an oracle.",
      }, null, 2),
    };
  },
});

export default retrievalSearchTool;
