/**
 * olympus-resonance — v0.1.4: the Symphony Resonance Index, on demand.
 *
 * The god asks: "has this task class been proven?" The index answers with the
 * matched signature, its sample count, the Laplace coherence, and the arsenal
 * that succeeded. A quick circuit is returned only when the evidence clears
 * 3+ samples and 0.85 — and never for a certification fixture.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { queryResonance, resonanceStats } from "../../../src/lib/symphony/resonance-index.js";

const resonanceTool: ToolDefinition = tool({
  description:
    "Query the Symphony Resonance Index for a task class. Returns the matched signature, Jaccard similarity, samples, Laplace coherence, the proven arsenal (skills/MCPs/demigods) and whether a quick circuit is earned. A null match means no proven class — deliberate normally.",
  args: {
    task: tool.schema.string().describe("The task to match against past dispatch signatures."),
    god: tool.schema.string().optional().describe("The god requesting the recon (defaults to apollo)."),
  },
  execute: async (args: { task: string; god?: string }) => {
    const task = String(args.task || "").trim();
    const god = String(args.god || "apollo").trim().toLowerCase();
    if (!task) return { output: JSON.stringify({ ok: false, error: "task is required" }) };
    const stats = resonanceStats();
    const match = queryResonance({ task, god });
    return {
      output: JSON.stringify({
        ok: true,
        god,
        task,
        index: stats,
        match,
        note: match
          ? (match.quickCircuit
            ? "Quick circuit earned: the signature has 3+ samples and coherence >= 0.85. Use the proven arsenal; verify it still fits this task."
            : "Hints only: the match is below the quick-circuit bar. Deliberate before dispatching.")
          : "No proven task class. Deliberate normally; the outcome will feed the index.",
      }, null, 2),
    };
  },
});

export default resonanceTool;
