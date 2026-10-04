/**
 * olympus-patterns Tool — v3.0 VaultBrain
 *
 * Lets a god (typically Apollo) query cross-god dispatch chain patterns
 * discovered by Callimachus's LINK stage. Patterns capture emergent
 * knowledge like: "When Apollo dispatches to Hephaestus AND Hephaestus
 * dispatches to build-resolver, the success rate is 94% over 47
 * samples."
 *
 * Apollo queries these patterns to learn which god→demigod chains work best
 * for which task types, even before the specialist god's own instincts fire.
 *
 * Pattern file format (in 05_Auto_Learning/patterns/<id>.md):
 *   ---
 *   type: dispatch-chain
 *   gods: [apollo, hephaestus, build-resolver]
 *   success_rate: 0.94
 *   samples: 47
 *   avg_duration_ms: 11200
 *   trigger_signature: "rust build error"
 *   scope: global
 *   last_updated: 2026-07-17T10:30:00Z
 *   ---
 *
 *   # Pattern: Rust build error → Hephaestus → build-resolver
 *
 *   When Apollo receives a task matching "rust build error", dispatching to
 *   Hephaestus (who dispatches to build-resolver) has a 94% success
 *   rate over 47 samples. This is the highest-success chain for this task type.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import { getVaultRoot } from "../../../src/lib/vault-root.js";

const VAULT_ROOT = getVaultRoot(); // D21: the single canonical resolver
const PATTERNS_DIR = path.join(VAULT_ROOT, "05_Auto_Learning", "patterns");

interface PatternFrontmatter {
  type?: string;
  gods?: string[];
  successRate?: number;
  samples?: number;
  avgDurationMs?: number;
  triggerSignature?: string;
  scope?: "global" | "stack" | "project";
  stacks?: string[];
  projects?: string[];
  lastUpdated?: string;
  id?: string;
  body?: string;
  filePath?: string;
}

/**
 * Parse pattern frontmatter. Same permissive YAML-ish parser as instinct-query.
 */
function parsePatternFrontmatter(raw: string, filePath: string): PatternFrontmatter | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;

  const fm: Record<string, any> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.slice(1, -1);
      fm[key] = inner.split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else if (val === "true" || val === "false") {
      fm[key] = val === "true";
    } else if (/^-?\d+(\.\d+)?$/.test(val)) {
      fm[key] = parseFloat(val);
    } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      fm[key] = val.slice(1, -1);
    } else {
      fm[key] = val;
    }
  }

  return {
    type: typeof fm.type === "string" ? fm.type : "dispatch-chain",
    gods: Array.isArray(fm.gods) ? fm.gods : [],
    successRate: typeof fm.success_rate === "number" ? fm.success_rate : undefined,
    samples: typeof fm.samples === "number" ? fm.samples : undefined,
    avgDurationMs: typeof fm.avg_duration_ms === "number" ? fm.avg_duration_ms : undefined,
    triggerSignature: typeof fm.trigger_signature === "string" ? fm.trigger_signature : undefined,
    scope: (["global", "stack", "project"].includes(fm.scope) ? fm.scope : "global") as PatternFrontmatter["scope"],
    stacks: Array.isArray(fm.stacks) ? fm.stacks : [],
    projects: Array.isArray(fm.projects) ? fm.projects : [],
    lastUpdated: typeof fm.last_updated === "string" ? fm.last_updated : undefined,
    id: path.basename(filePath, ".md"),
    body: m[2],
    filePath,
  };
}

/**
 * Load all patterns from the patterns directory.
 */
function loadPatterns(): PatternFrontmatter[] {
  const out: PatternFrontmatter[] = [];
  if (!fs.existsSync(PATTERNS_DIR)) return out;
  try {
    for (const file of fs.readdirSync(PATTERNS_DIR)) {
      if (!file.endsWith(".md")) continue;
      const filePath = path.join(PATTERNS_DIR, file);
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const p = parsePatternFrontmatter(raw, filePath);
        if (p) out.push(p);
      } catch {
        // skip unreadable
      }
    }
  } catch {
    // ignore
  }
  return out;
}

/**
 * Compute a fuzzy match score between a task signature and a pattern's
 * trigger signature. Returns 0..1.
 *
 * Heuristic: token overlap (Jaccard) on lowercased tokens, with a small
 * bonus for substring match. Patterns with no trigger_signature match
 * everything at 0.1 (lowest priority).
 */
function matchScore(taskSig: string, triggerSig: string | undefined): number {
  if (!triggerSig) return 0.1;
  const a = new Set(taskSig.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  const b = new Set(triggerSig.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  if (a.size === 0 || b.size === 0) return taskSig.toLowerCase().includes(triggerSig.toLowerCase()) ? 0.5 : 0;
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  const jaccard = intersection.size / union.size;
  // Substring bonus
  const substringBonus = taskSig.toLowerCase().includes(triggerSig.toLowerCase()) ? 0.2 : 0;
  return Math.min(1, jaccard + substringBonus);
}

const patternsTool: ToolDefinition = tool({
  description:
    "Query cross-god dispatch chain patterns discovered by Callimachus. Patterns capture emergent knowledge like 'Apollo → Hephaestus → build-resolver has 94% success rate for rust build errors'. Use this BEFORE dispatching to a specialist god to learn which god→demigod chains work best for the task type. Returns matching patterns sorted by match score × success rate × sample size.",
  args: {
    taskSignature: tool.schema
      .string()
      .describe("The task being considered (e.g., 'rust build error: E0277'). Used to match against pattern trigger_signatures."),
    activeStacks: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("The active project's tech stacks (e.g., ['rust', 'postgres']). Empty array for browsing mode."),
    activeProject: tool.schema
      .string()
      .optional()
      .describe("The active project slug. Null/undefined for browsing mode."),
    topN: tool.schema
      .number()
      .optional()
      .describe("Maximum number of patterns to return. Defaults to 5."),
  },
  execute: async (args: {
    taskSignature: string;
    activeStacks?: string[];
    activeProject?: string | null;
    topN?: number;
  }, _context: any) => {
    const { taskSignature, activeStacks = [], activeProject = null, topN = 5 } = args;

    const all = loadPatterns();
    if (all.length === 0) {
      return {
        output: JSON.stringify({
          ok: true,
          taskSignature,
          patternCount: 0,
          message: `No cross-god patterns found in ${PATTERNS_DIR}. Callimachus's LINK stage will create them once enough dispatches have been observed (success_rate >= 0.85, samples >= 10).`,
        }, null, 2),
      };
    }

    // Filter by scope
    const filtered = all.filter(p => {
      const scope = p.scope ?? "global";
      const stacks = p.stacks ?? [];
      const projects = p.projects ?? [];
      if (!activeProject) {
        if (scope === "project") return false;
        return true;
      }
      if (scope === "project") return projects.includes(activeProject);
      if (scope === "stack") return stacks.some(s => activeStacks.includes(s));
      // global
      if (stacks.length === 0) return true;
      return stacks.some(s => activeStacks.includes(s));
    });

    // Score + sort
    const scored = filtered.map(p => {
      const score = matchScore(taskSignature, p.triggerSignature) *
        (p.successRate ?? 0) *
        Math.sqrt(p.samples ?? 1);
      return { pattern: p, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, topN);

    const formatted = top.map(({ pattern: p, score }) => ({
      id: p.id,
      gods: p.gods,
      success_rate: p.successRate,
      samples: p.samples,
      avg_duration_ms: p.avgDurationMs,
      trigger_signature: p.triggerSignature,
      scope: p.scope,
      stacks: p.stacks,
      last_updated: p.lastUpdated,
      match_score: Math.round(score * 1000) / 1000,
      recommendation: p.gods && p.gods.length > 0
        ? `Dispatch to ${p.gods[0]} (who dispatches to ${p.gods[p.gods.length - 1]}) — ${(p.successRate ?? 0) * 100}% success rate over ${p.samples} samples`
        : undefined,
    }));

    return {
      output: JSON.stringify({
        ok: true,
        taskSignature,
        patternCount: all.length,
        visibleCount: filtered.length,
        topPatterns: formatted,
        message: formatted.length > 0
          ? `Top match: ${formatted[0].recommendation || "no recommendation"}`
          : `No matching patterns. Deliberate normally — Callimachus will create a pattern once this task type has been observed enough times.`,
      }, null, 2),
    };
  },
});

export default patternsTool;
