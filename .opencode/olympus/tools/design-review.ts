/**
 * olympus-design-review Tool — Athena's IN-CHAT design choice surface.
 *
 * v0.0.24: the Design Studio modal is gone. Athena proposes choices INSIDE
 * the conversation: 3 palettes, 3 logo SVG concepts, 3 layout references —
 * generated for the actual task, never from a fixed catalog.
 *
 * Flow:
 *   1. Athena (interactive session) calls this tool with 2–6 `options`.
 *   2. The tool appends a `design-choice-requested` event to live.jsonl.
 *   3. The terminal renders DesignChoiceCard inline (inside the message
 *      stream, not a modal).
 *   4. The user picks one OR types a refinement ("make the mark warmer").
 *   5. The card injects a normal user message; Athena sees it and either
 *      proceeds or generates 3 NEW options.
 *   6. The choice is persisted to 02_Projects/<slug>/design-decisions.jsonl.
 *
 * The old `candidates` argument remains accepted for compatibility.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function vaultRoot(): string {
  if (process.env.OLYMPUS_VAULT) return process.env.OLYMPUS_VAULT;
  return path.join(os.homedir(), "OLYMPUS-VAULT");
}

function activeProjectSlug(): string | null {
  try {
    const p = path.join(os.homedir(), ".olympus", "active-project.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    const slug = typeof raw?.slug === "string" ? raw.slug : null;
    return slug && /^[a-z0-9][a-z0-9-]*$/i.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

const DESIGN_REVIEW_TOOL: ToolDefinition = tool({
  description:
    "Show DYNAMIC design choices to the user inline in the chat. Call this before implementing UI in an interactive session. Generate 2-6 options for the actual task (palette, logo SVG concept, layout/reference, component direction). The user picks one or asks for a refinement; the answer arrives as a normal user message. In unattended/hop mode do NOT call this — decide from the design contract and record the choice.",
  args: {
    options: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().optional().describe("Stable option id (optional; generated when absent)"),
          label: tool.schema.string().describe("Short option name (e.g. 'Aurora mark', 'Warm editorial')"),
          description: tool.schema.string().optional().describe("One line: why this option fits the task"),
          kind: tool.schema
            .string()
            .optional()
            .describe("palette | logo | layout | reference | component | text"),
          svg: tool.schema
            .string()
            .optional()
            .describe("A complete inline SVG for a logo/mark concept (120x120 viewBox, currentColor, safe area)"),
          imageUrl: tool.schema
            .string()
            .optional()
            .describe("An image URL or vault asset path for a richer concept"),
          colors: tool.schema
            .array(tool.schema.object({ role: tool.schema.string(), hex: tool.schema.string() }))
            .optional()
            .describe("Palette swatches ({role,hex})"),
          text: tool.schema.string().optional().describe("A short text/code snippet (layout recipe, copy)"),
        })
      )
      .min(2)
      .max(6)
      .optional()
      .describe("The dynamic options. Generate them for THIS task — never a fixed catalog."),
    candidates: tool.schema
      .array(
        tool.schema.object({
          name: tool.schema.string(),
          description: tool.schema.string(),
          category: tool.schema.string().optional(),
        })
      )
      .min(1)
      .max(5)
      .optional()
      .describe("Legacy design-system candidates (kept for compatibility)."),
    taskContext: tool.schema
      .string()
      .describe("1-2 sentences describing what is being designed, so the card header is honest."),
    suggestions: tool.schema
      .array(tool.schema.string())
      .max(6)
      .optional()
      .describe("Short refinement prompts the card offers as chips (e.g. 'more minimal', 'warmer', 'different mark')."),
    allowRefine: tool.schema
      .boolean()
      .optional()
      .describe("Show the refinement input (default true)."),
    project: tool.schema
      .string()
      .optional()
      .describe("Project slug (defaults to ~/.olympus/active-project.json)."),
    godId: tool.schema
      .string()
      .optional()
      .describe("The god making the request (default 'athena')."),
  },
  execute: async (args: any, _context: any) => {
    const godId = typeof args?.godId === "string" && args.godId ? args.godId : "athena";
    const taskContext = String(args?.taskContext || "").slice(0, 400);
    const rawOptions = Array.isArray(args?.options) ? args.options : [];
    const rawCandidates = Array.isArray(args?.candidates) ? args.candidates : [];

    // Compatibility: an old caller may send only candidates.
    const options = rawOptions.length
      ? rawOptions.slice(0, 6).map((o: any, i: number) => ({
          id: String(o?.id || `opt-${i + 1}`).slice(0, 64),
          label: String(o?.label || `Option ${i + 1}`).slice(0, 120),
          description: typeof o?.description === "string" ? o.description.slice(0, 400) : "",
          kind: typeof o?.kind === "string" ? o.kind.slice(0, 30) : "option",
          svg: typeof o?.svg === "string" ? o.svg.slice(0, 20_000) : undefined,
          imageUrl: typeof o?.imageUrl === "string" ? o.imageUrl.slice(0, 2_000) : undefined,
          colors: Array.isArray(o?.colors)
            ? o.colors.slice(0, 12).map((c: any) => ({
                role: String(c?.role || "accent").slice(0, 30),
                hex: String(c?.hex || "").slice(0, 20),
              }))
            : undefined,
          text: typeof o?.text === "string" ? o.text.slice(0, 4_000) : undefined,
        }))
      : rawCandidates.slice(0, 5).map((c: any, i: number) => ({
          id: `candidate-${i + 1}`,
          label: String(c?.name || `Candidate ${i + 1}`).slice(0, 120),
          description: typeof c?.description === "string" ? c.description.slice(0, 400) : "",
          kind: "reference",
          text: typeof c?.category === "string" ? c.category : undefined,
        }));

    if (options.length < 2) {
      return {
        output: JSON.stringify({
          ok: false,
          error: "Provide 2-6 dynamic options (or 1-5 legacy candidates). Generate them for the actual task — not a fixed catalog.",
        }, null, 2),
      };
    }

    const project = typeof args?.project === "string" && /^[a-z0-9][a-z0-9-]*$/i.test(args.project)
      ? args.project
      : activeProjectSlug();
    const suggestions = Array.isArray(args?.suggestions)
      ? args.suggestions.filter((s: any) => typeof s === "string").slice(0, 6).map((s: string) => s.slice(0, 80))
      : [];
    const allowRefine = args?.allowRefine !== false;

    const feedPath = path.join(vaultRoot(), "06_Activity_Feed", "live.jsonl");
    try {
      const dir = path.dirname(feedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const reviewId = `design-choice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const event = {
        ts: new Date().toISOString(),
        god: godId,
        action: "design-choice-requested",
        review_id: reviewId,
        task_context: taskContext,
        options,
        suggestions,
        allow_refine: allowRefine,
        project,
        msg: `Design choice requested: ${options.length} dynamic option(s) for "${taskContext.slice(0, 100)}"`,
        meta: {
          reviewId,
          taskContext,
          options,
          suggestions,
          allowRefine,
          project,
        },
      };
      fs.appendFileSync(feedPath, JSON.stringify(event) + "\n", "utf-8");

      return {
        output: JSON.stringify({
          ok: true,
          reviewId,
          project,
          message: `Design choice card shown inline with ${options.length} options. Wait for the user — their pick or refinement arrives as a follow-up message. Do not implement the UI until they answer.`,
          options: options.map((o: any) => o.label),
        }, null, 2),
      };
    } catch (err: any) {
      return {
        output: JSON.stringify({
          ok: false,
          error: `Failed to write design-choice event: ${err.message}`,
        }, null, 2),
      };
    }
  },
});

export default DESIGN_REVIEW_TOOL;
