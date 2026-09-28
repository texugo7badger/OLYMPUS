/**
 * olympus-instinct-query Tool — Phase 4 / T13
 *
 * Lets a god query its instincts before acting. Returns matching instincts
 * (seed + empirical) filtered by scope/stack/project + time decay.
 *
 * If any empirical instinct has confidence >= 0.85 and scope matches, the
 * god should short-circuit (dispatch directly per the instinct's `action`).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), "OLYMPUS-VAULT");

interface InstinctFrontmatter {
  god?: string;
  confidence: number;
  scope?: "global" | "stack" | "project";
  stacks?: string[];
  projects?: string[];
  last_used?: string;
  samples?: number;
  successes?: number;
  failures?: number;
  source?: "seed" | "empirical";
  immutable?: boolean;
  trigger?: string;
  action?: string;
  skill?: string;
  mcp?: string;
  demigod?: string;
  id?: string;
  path?: string;
}

/**
 * Parse instinct frontmatter from a markdown file.
 * Permissive YAML-ish parser (matches the pattern in instinct-scope.ts).
 */
function parseInstinctFrontmatter(raw: string, filePath: string): InstinctFrontmatter | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;

  const fm: Record<string, any> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val: string = kv[2].trim();

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

  if (typeof fm.confidence !== "number") return null;

  return {
    god: typeof fm.god === "string" ? fm.god : undefined,
    confidence: fm.confidence,
    scope: (["global", "stack", "project"].includes(fm.scope) ? fm.scope : "global") as InstinctFrontmatter["scope"],
    stacks: Array.isArray(fm.stacks) ? fm.stacks : [],
    projects: Array.isArray(fm.projects) ? fm.projects : [],
    last_used: typeof fm.last_used === "string" ? fm.last_used : undefined,
    samples: typeof fm.samples === "number" ? fm.samples : undefined,
    successes: typeof fm.successes === "number" ? fm.successes : undefined,
    failures: typeof fm.failures === "number" ? fm.failures : undefined,
    source: (["seed", "empirical"].includes(fm.source) ? fm.source : undefined) as InstinctFrontmatter["source"],
    immutable: typeof fm.immutable === "boolean" ? fm.immutable : undefined,
    trigger: typeof fm.trigger === "string" ? fm.trigger : undefined,
    action: typeof fm.action === "string" ? fm.action : undefined,
    skill: typeof fm.skill === "string" ? fm.skill : undefined,
    mcp: typeof fm.mcp === "string" ? fm.mcp : undefined,
    demigod: typeof (fm.demigod || fm.demigod) === "string" ? fm.demigod : undefined,
    id: fm.id || path.basename(filePath, ".md"),
    path: filePath,
  };
}

/**
 * Apply time decay to a confidence score.
 */
function applyTimeDecay(instinct: InstinctFrontmatter, now: Date = new Date()): number {
  if (!instinct.last_used) return instinct.confidence;
  const last = new Date(instinct.last_used);
  if (isNaN(last.getTime())) return instinct.confidence;
  const daysSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 180) return Math.max(0, instinct.confidence - 0.2);
  if (daysSince > 90) return Math.max(0, instinct.confidence - 0.1);
  return instinct.confidence;
}

/**
 * Load all instincts (seed + empirical) for a god.
 */
function loadInstincts(godId: string): InstinctFrontmatter[] {
  const out: InstinctFrontmatter[] = [];
  const godDir = path.join(VAULT_ROOT, "05_Auto_Learning", "instincts", godId);
  if (!fs.existsSync(godDir)) return out;

  for (const tier of ["seed", "empirical"]) {
    const tierDir = path.join(godDir, tier);
    if (!fs.existsSync(tierDir)) continue;
    for (const file of fs.readdirSync(tierDir)) {
      if (!file.endsWith(".md")) continue;
      const filePath = path.join(tierDir, file);
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const instinct = parseInstinctFrontmatter(raw, filePath);
        if (instinct) {
          instinct.source = tier as "seed" | "empirical";
          out.push(instinct);
        }
      } catch {
        // Skip unreadable files
      }
    }
  }
  return out;
}

/**
 * Filter instincts by scope/stack/project (simplified version of instinct-scope.ts).
 */
function filterInstincts(
  instincts: InstinctFrontmatter[],
  activeStacks: string[],
  activeProject: string | null,
): InstinctFrontmatter[] {
  const now = new Date();
  return instincts.filter(instinct => {
    const effectiveConfidence = applyTimeDecay(instinct, now);
    const scope = instinct.scope ?? "global";
    const stacks = instinct.stacks ?? [];
    const projects = instinct.projects ?? [];

    // Seed instincts always pass
    if (instinct.source === "seed" || instinct.immutable === true) {
      return true;
    }

    // Browsing mode (no active project)
    if (!activeProject) {
      if (scope === "project") return false;
      return true;
    }

    // Active project mode
    if (scope === "project") {
      return projects.includes(activeProject);
    }
    if (scope === "stack") {
      return stacks.some(s => activeStacks.includes(s));
    }
    // scope === "global"
    if (stacks.length === 0) return true; // universal
    if (stacks.some(s => activeStacks.includes(s))) return true; // stack match
    // Cross-stack promotion
    if (effectiveConfidence >= 0.85) return true;
    return false;
  });
}

const instinctQueryTool: ToolDefinition = tool({
  description:
    "Query your instincts (seed + empirical) for the active god. Returns matching instincts filtered by scope/stack/project + time decay. If any empirical instinct has confidence >= 0.85 and scope matches, short-circuit by dispatching directly per the instinct's `action` field. v3.0: optionally also returns matching cross-god dispatch chain patterns (from the olympus-patterns tool) so Apollo can discover optimal god→demigod chains even before the specialist god's own instincts fire.",
  args: {
    godId: tool.schema
      .string()
      .describe("The god ID querying its instincts (e.g., 'hephaestus', 'athena'). Must match the active agent."),
    taskSignature: tool.schema
      .string()
      .describe("A description of the task being considered (e.g., 'Rust build error involving borrow checker'). Used to match against instinct triggers."),
    activeStacks: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("The active project's tech stacks (e.g., ['rust', 'postgres']). Empty array for browsing mode."),
    activeProject: tool.schema
      .string()
      .optional()
      .describe("The active project slug. Null/undefined for browsing mode."),
    includePatterns: tool.schema
      .boolean()
      .optional()
      .describe("Whether to also query cross-god dispatch chain patterns (from 05_Auto_Learning/patterns/). Defaults to true for Apollo, false for other gods. Patterns let Apollo discover optimal god→demigod chains."),
  },
  execute: async (args: {
    godId: string;
    taskSignature: string;
    activeStacks?: string[];
    activeProject?: string | null;
    includePatterns?: boolean;
  }, _context: any) => {
    const { godId, taskSignature, activeStacks = [], activeProject = null, includePatterns = godId === "apollo" } = args;

    // Load all instincts for this god
    const allInstincts = loadInstincts(godId);
    if (allInstincts.length === 0) {
      return {
        output: JSON.stringify({
          ok: true,
          godId,
          taskSignature,
          instinctCount: 0,
          shortCircuit: false,
          message: `No instincts found for god "${godId}". The brain is empty for this god — deliberate normally and let Callimachus extract patterns over time.`,
        }, null, 2),
      };
    }

    // Filter by scope
    const filtered = filterInstincts(allInstincts, activeStacks, activeProject);

    // Sort by confidence (descending)
    const sorted = filtered.sort((a, b) => {
      const aConf = applyTimeDecay(a);
      const bConf = applyTimeDecay(b);
      return bConf - aConf;
    });

    // Check for short-circuit candidates (empirical, confidence >= 0.85, has demigod)
    const shortCircuitCandidates = sorted.filter(
      i => i.source === "empirical" && applyTimeDecay(i) >= 0.85 && (i.demigod || i.demigod),
    );

    const shouldShortCircuit = shortCircuitCandidates.length > 0;

    // Format the output
    const formatted = sorted.slice(0, 10).map(i => ({
      id: i.id,
      source: i.source,
      confidence: applyTimeDecay(i).toFixed(2),
      scope: i.scope,
      stacks: i.stacks,
      trigger: i.trigger,
      action: i.action,
      skill: i.skill,
      mcp: i.mcp,
      demigod: (i.demigod || i.demigod),
      last_used: i.last_used,
      samples: i.samples,
      successes: (i as any).successes,
      failures: (i as any).failures,
    }));

    // v3.0: also query cross-god dispatch chain patterns (if requested)
    let patterns: any[] | null = null;
    if (includePatterns) {
      try {
        const patternsDir = path.join(VAULT_ROOT, "05_Auto_Learning", "patterns");
        if (fs.existsSync(patternsDir)) {
          const patternFiles = fs.readdirSync(patternsDir).filter(f => f.endsWith(".md"));
          patterns = [];
          for (const file of patternFiles) {
            try {
              const raw = fs.readFileSync(path.join(patternsDir, file), "utf-8");
              const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
              if (!m) continue;
              const fm: Record<string, any> = {};
              for (const line of m[1].split(/\r?\n/)) {
                const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
                if (!kv) continue;
                const key = kv[1];
                const val = kv[2].trim();
                if (val.startsWith("[") && val.endsWith("]")) {
                  fm[key] = val.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
                } else if (/^-?\d+(\.\d+)?$/.test(val)) {
                  fm[key] = parseFloat(val);
                } else {
                  fm[key] = val;
                }
              }
              // Filter by scope
              const scope = fm.scope || "global";
              const pStacks = Array.isArray(fm.stacks) ? fm.stacks : [];
              const pProjects = Array.isArray(fm.projects) ? fm.projects : [];
              let visible = true;
              if (activeProject) {
                if (scope === "project" && !pProjects.includes(activeProject)) visible = false;
                else if (scope === "stack" && !pStacks.some(s => activeStacks.includes(s))) visible = false;
              } else {
                if (scope === "project") visible = false;
              }
              if (!visible) continue;
              // Compute match score
              const trigger = fm.trigger_signature || "";
              const taskTokens = new Set(taskSignature.toLowerCase().split(/\W+/).filter((t: string) => t.length > 2));
              const triggerTokens = new Set(trigger.toLowerCase().split(/\W+/).filter((t: string) => t.length > 2));
              const intersection = new Set([...taskTokens].filter(x => triggerTokens.has(x)));
              const union = new Set([...taskTokens, ...triggerTokens]);
              const score = union.size > 0 ? (intersection.size / union.size) * (fm.success_rate || 0) * Math.sqrt(fm.samples || 1) : 0;
              patterns!.push({
                id: path.basename(file, ".md"),
                gods: fm.gods,
                success_rate: fm.success_rate,
                samples: fm.samples,
                avg_duration_ms: fm.avg_duration_ms,
                trigger_signature: fm.trigger_signature,
                scope: fm.scope,
                match_score: Math.round(score * 1000) / 1000,
              });
            } catch {
              // skip unreadable
            }
          }
          patterns!.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
          patterns = patterns!.slice(0, 5);
        }
      } catch {
        // Non-fatal
      }
    }

    return {
      output: JSON.stringify({
        ok: true,
        godId,
        taskSignature,
        instinctCount: allInstincts.length,
        visibleCount: filtered.length,
        shortCircuit: shouldShortCircuit,
        shortCircuitCandidate: shouldShortCircuit ? {
          instinct_id: shortCircuitCandidates[0].id,
          demigod: (shortCircuitCandidates[0].demigod || shortCircuitCandidates[0].demigod),
          skill: shortCircuitCandidates[0].skill,
          mcp: shortCircuitCandidates[0].mcp,
          confidence: applyTimeDecay(shortCircuitCandidates[0]).toFixed(2),
        } : null,
        topInstincts: formatted,
        patterns: includePatterns ? patterns : undefined,
        vaultBrainVersion: "3.0",
        message: shouldShortCircuit
          ? `SHORT-CIRCUIT: ${shortCircuitCandidates.length} high-confidence instinct(s) match. Dispatch directly to ${(shortCircuitCandidates[0].demigod || shortCircuitCandidates[0].demigod)} with skill ${shortCircuitCandidates[0].skill}. Skip deliberation.`
          : `No short-circuit candidates. ${filtered.length} instinct(s) visible${includePatterns && patterns && patterns.length > 0 ? `, ${patterns.length} cross-god pattern(s) match` : ""} — deliberate normally and choose the best demigod.`,
      }, null, 2),
    };
  },
});

export default instinctQueryTool;
