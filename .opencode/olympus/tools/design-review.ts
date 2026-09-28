/**
 * olympus-design-review Tool — lets Athena show design references to the user.
 *
 * When Athena receives a UI/design task, she queries OpenDesign for candidate
 * design systems, then calls THIS tool to surface them to the user. The user
 * can review the candidates and select one, which feeds back into the
 * conversation as a user message. The interactive-terminal.tsx +
 * /api/olympus/design-review route render the DesignReviewCard from the
 * `design-review-requested` event this tool writes to live.jsonl.
 *
 * Flow:
 *   1. Athena queries od_list_projects → gets candidate design systems
 *   2. Athena calls olympus-design-review with the candidates
 *   3. This tool writes an event to live.jsonl (action: "design-review-requested")
 *   4. The UI (interactive-terminal.tsx) detects the event and renders a
 *      DesignReviewCard inline in the Apollo chat
 *   5. The user clicks a candidate → the UI calls /api/olympus/design-review
 *      with the selection → the API writes a follow-up event
 *      (action: "design-review-selected")
 *   6. Athena picks up the selection and proceeds with the chosen design system
 *
 * The tool returns immediately with a message telling Athena to wait for the
 * user's selection. The actual selection arrives as a new user message in the
 * conversation (the UI injects it into the chat).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DESIGN_REVIEW_TOOL: ToolDefinition = tool({
  description: "Show design-system candidates to the user for review and selection. Call this AFTER querying OpenDesign (od_list_projects) to surface the candidates as clickable cards in the chat. The user will select one, which feeds back into the conversation.",
  args: {
    candidates: tool.schema
      .array(
        tool.schema.object({
          name: tool.schema.string().describe("Design system name (e.g. 'linear', 'stripe', 'vercel')"),
          description: tool.schema.string().describe("One-line description of why this candidate is relevant"),
          category: tool.schema.string().optional().describe("Category (e.g. 'SaaS', 'E-commerce', 'Developer Tools')"),
        })
      )
      .min(1)
      .max(5)
      .describe("The design-system candidates the user can choose from (max 5). Each has a name, description, and optional category."),
    taskContext: tool.schema
      .string()
      .describe("A brief summary of the design task (1-2 sentences) so the user understands what the selection is for."),
    godId: tool.schema
      .string()
      .describe("The god making the request (always 'athena' for now, but future-proofed for other design gods)."),
  },
  execute: async (args: {
    candidates: Array<{ name: string; description: string; category?: string }>;
    taskContext: string;
    godId: string;
  }, _context: any) => {
    const { candidates, taskContext, godId } = args;

    // Validate candidates
    if (!candidates || candidates.length === 0) {
      return {
        output: JSON.stringify({
          ok: false,
          error: "No candidates provided. Call od_list_projects first to get design systems, then pass the relevant ones here.",
        }, null, 2),
      };
    }

    // Write the event to the activity feed.
    const feedPath = path.join(os.homedir(), "OLYMPUS-VAULT", "06_Activity_Feed", "live.jsonl");
    try {
      const dir = path.dirname(feedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const reviewId = `design-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const event = {
        ts: new Date().toISOString(),
        god: godId,
        action: "design-review-requested",
        review_id: reviewId,
        task_context: taskContext,
        candidates: candidates.map(c => ({
          name: c.name,
          description: c.description,
          category: c.category || null,
        })),
        msg: `Design review requested: ${candidates.length} candidates for "${taskContext.slice(0, 100)}"`,
        meta: {
          reviewId,
          taskContext,
          candidates,
        },
      };
      fs.appendFileSync(feedPath, JSON.stringify(event) + "\n", "utf-8");

      return {
        output: JSON.stringify({
          ok: true,
          reviewId,
          message: `Design review card shown to the user with ${candidates.length} candidates. Wait for the user to select one — the selection will arrive as a follow-up message. Do not proceed until the user responds.`,
          candidates: candidates.map(c => c.name),
        }, null, 2),
      };
    } catch (err: any) {
      return {
        output: JSON.stringify({
          ok: false,
          error: `Failed to write design-review event: ${err.message}`,
        }, null, 2),
      };
    }
  },
});

export default DESIGN_REVIEW_TOOL;
