/**
 * olympus-integration-review Tool — lets Hermes surface integration approach
 * candidates to the user for review and selection.
 *
 * When Hermes receives an integration task (REST vs GraphQL vs gRPC, webhook
 * vs polling, etc.), he calls this tool to surface the candidates to the
 * user. The interactive-terminal.tsx + /api/olympus/design-review route
 * render the DesignReviewCard from the `design-review-requested` event this
 * tool writes to live.jsonl.
 *
 * The flow is identical to olympus-design-review:
 *   1. Hermes calls this tool with candidate integration approaches
 *   2. The tool writes an event to live.jsonl (action: "integration-review-requested")
 *   3. The DesignReviewCard UI (generic — works for any god) renders the candidates
 *   4. The user clicks a candidate → auto-submits "I selected X. Please proceed."
 *   5. Hermes picks up the selection and proceeds
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const INTEGRATION_REVIEW_TOOL: ToolDefinition = tool({
  description: "Show integration approach candidates to the user for review and selection. Call this when you have multiple viable integration approaches (e.g. REST vs GraphQL vs gRPC) and the choice depends on user preference or project constraints.",
  args: {
    candidates: tool.schema
      .array(
        tool.schema.object({
          name: tool.schema.string().describe("Approach name (e.g. 'REST API', 'GraphQL', 'gRPC', 'Webhooks')"),
          description: tool.schema.string().describe("One-line description of why this approach is relevant + trade-offs"),
          category: tool.schema.string().optional().describe("Category (e.g. 'API', 'Messaging', 'Realtime')"),
        })
      )
      .min(1)
      .max(5)
      .describe("The integration approach candidates (max 5). Each has a name, description, and optional category."),
    taskContext: tool.schema
      .string()
      .describe("A brief summary of the integration task (1-2 sentences) so the user understands what the selection is for."),
    godId: tool.schema
      .string()
      .describe("The god making the request (always 'hermes' for now)."),
  },
  execute: async (args: {
    candidates: Array<{ name: string; description: string; category?: string }>;
    taskContext: string;
    godId: string;
  }, _context: any) => {
    const { candidates, taskContext, godId } = args;

    if (!candidates || candidates.length === 0) {
      return {
        output: JSON.stringify({
          ok: false,
          error: "No candidates provided.",
        }, null, 2),
      };
    }

    const feedPath = path.join(os.homedir(), "OLYMPUS-VAULT", "06_Activity_Feed", "live.jsonl");
    try {
      const dir = path.dirname(feedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const reviewId = `integration-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const event = {
        ts: new Date().toISOString(),
        god: godId,
        action: "design-review-requested",  // same action so the generic UI card picks it up
        review_id: reviewId,
        task_context: taskContext,
        candidates: candidates.map(c => ({
          name: c.name,
          description: c.description,
          category: c.category || null,
        })),
        msg: `Integration review requested: ${candidates.length} candidates for "${taskContext.slice(0, 100)}"`,
        meta: {
          reviewId,
          taskContext,
          candidates,
          reviewType: "integration",
        },
      };
      fs.appendFileSync(feedPath, JSON.stringify(event) + "\n", "utf-8");

      return {
        output: JSON.stringify({
          ok: true,
          reviewId,
          message: `Integration review card shown to the user with ${candidates.length} candidates. Wait for the user to select one.`,
          candidates: candidates.map(c => c.name),
        }, null, 2),
      };
    } catch (err: any) {
      return {
        output: JSON.stringify({
          ok: false,
          error: `Failed to write integration-review event: ${err.message}`,
        }, null, 2),
      };
    }
  },
});

export default INTEGRATION_REVIEW_TOOL;
