/**
 * sub-agent-instinct-query Tool — Phase 4 Extension (Symphony-native)
 *
 * Extends the existing olympus-instinct-query tool to support demigod scope.
 *
 * Demigods query their OWN instincts via this tool. They CANNOT query
 * god-level instincts (enforced by the olympus-router plugin's
 * tool.execute.before hook).
 *
 * This implements Requirement 4: "demigods have local instincts only."
 *
 * Demigods use the continuous-learning-v2 pattern (same as gods), but with
 * a local scope — their instincts are stored at:
 *   ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/sub-agents/<demigod-name>/{seed,empirical}/
 *
 * Gods have their own brain-based learning context (the existing
 * olympus-instinct-query tool) which gives them cross-god visibility.
 *
 * NOTE: The tool NAME stays `sub-agent-instinct-query` for backward
 * compatibility with opencode.json permissions, but all doc strings say
 * "demigod" (the v0.0.1 Symphony-native term).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), "OLYMPUS-VAULT");
const SUB_AGENT_INSTINCTS_ROOT = path.join(VAULT_ROOT, "05_Auto_Learning", "instincts", "sub-agents");

const CONFIDENCE_THRESHOLD = 0.85;

interface SubAgentInstinct {
  id: string;
  agent: string;
  scope: "sub-agent";
  tags: string[];
  confidence: number;
  dispatch_count: number;
  last_invoked_at: string | null;
  type: "seed" | "empirical";
  body: string;
  source_path: string;
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  const fm: Record<string, unknown> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val: string = kv[2].trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      fm[key] = val.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else if (val === "true" || val === "false") {
      fm[key] = val === "true";
    } else if (/^-?\d+(\.\d+)?$/.test(val)) {
      fm[key] = parseFloat(val);
    } else if (val === "null") {
      fm[key] = null;
    } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      fm[key] = val.slice(1, -1);
    } else {
      fm[key] = val;
    }
  }
  return { frontmatter: fm, body: m[2] };
}

function loadSubAgentInstincts(agentName: string): SubAgentInstinct[] {
  const agentDir = path.join(SUB_AGENT_INSTINCTS_ROOT, agentName);
  if (!fs.existsSync(agentDir)) return [];

  const instincts: SubAgentInstinct[] = [];
  for (const kind of ["seed", "empirical"] as const) {
    const kindDir = path.join(agentDir, kind);
    if (!fs.existsSync(kindDir)) continue;
    for (const file of fs.readdirSync(kindDir)) {
      if (!file.endsWith(".md")) continue;
      const filePath = path.join(kindDir, file);
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const parsed = parseFrontmatter(content);
        if (!parsed) continue;
        const fm = parsed.frontmatter;
        instincts.push({
          id: String(fm.id ?? file.replace(/\.md$/, "")),
          agent: String(fm.agent ?? agentName),
          scope: "sub-agent",
          tags: (fm.tags as string[]) ?? [],
          confidence: Number(fm.confidence ?? 1.0),
          dispatch_count: Number(fm.dispatch_count ?? 0),
          last_invoked_at: (fm.last_invoked_at as string) ?? null,
          type: (fm.type as "seed" | "empirical") ?? kind,
          body: parsed.body.trim(),
          source_path: filePath,
        });
      } catch {
        // skip unreadable
      }
    }
  }
  return instincts;
}

function extractTags(query: string): string[] {
  const stopwords = new Set(["the","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","could","should","may","might","must","can","shall","to","of","in","for","on","with","as","by","at","from","up","about","into","through","during","before","after","above","below","and","or","but","not","no","yes","this","that","these","those","i","you","he","she","it","we","they","me","him","her","us","them","my","your","his","its","our","their","what","which","who","when","where","why","how","all","each","every","both","few","more","most","other","some","such","only","own","same","so","than","too","very","just","now"]);
  const words = query.toLowerCase().split(/[^a-z0-9-]+/).filter(w => w.length > 2 && !stopwords.has(w));
  return [...new Set(words)];
}

function tagSimilarity(queryTags: string[], instinctTags: string[]): number {
  if (queryTags.length === 0 || instinctTags.length === 0) return 0;
  const set = new Set(instinctTags.map(t => t.toLowerCase()));
  let hits = 0;
  for (const tag of queryTags) {
    if (set.has(tag.toLowerCase())) hits++;
  }
  return hits / Math.max(queryTags.length, instinctTags.length);
}

const subAgentInstinctQueryTool: ToolDefinition = tool({
  description:
    "Query a demigod's local instincts (seed + empirical). Demigods use this to apply the continuous-learning-v2 pattern at their own scope. Returns matching instincts filtered by tag similarity. If any instinct has confidence >= 0.85, short-circuit (apply the instinct's guidance directly). Demigods CANNOT query god-level instincts — only their own. This enforces the 'local instincts only' rule from Requirement 4. The agentName arg is the unprefixed demigod name (e.g., 'verifier-code', 'mlops-engineer').",
  args: {
    agentName: tool.schema
      .string()
      .describe("The demigod name (unprefixed, e.g., 'verifier-code', 'mlops-engineer', 'build-resolver'). Must match the calling demigod's own name. The parent god is determined by the dispatch context."),
    query: tool.schema
      .string()
      .describe("A description of the task being considered (e.g., 'React component review for prop types'). Used to match against instinct tags."),
    topK: tool.schema
      .number()
      .optional()
      .describe("Number of alternative instincts to return (default 3)."),
  },
  execute: async (args: {
    agentName: string;
    query: string;
    topK?: number;
  }, _context: any) => {
    const { agentName, query, topK = 3 } = args;

    const instincts = loadSubAgentInstincts(agentName);

    if (instincts.length === 0) {
      return {
        output: JSON.stringify({
          ok: true,
          agentName,
          query,
          instinctCount: 0,
          visibleCount: 0,
          shortCircuit: false,
          topInstincts: [],
          vaultBrainVersion: "3.0-sub-agent",
          message: `No instincts found for sub-agent '${agentName}'. Run: node scripts/setup-sub-agent-instincts.js --agent ${agentName} to create seed instincts.`,
        }, null, 2),
      };
    }

    // Parse query as tags
    const queryTags = query.includes(",")
      ? query.split(",").map(t => t.trim().toLowerCase()).filter(Boolean)
      : extractTags(query);

    // Score each instinct by tag overlap × confidence
    const scored = instincts.map(instinct => {
      const sim = tagSimilarity(queryTags, instinct.tags);
      const score = sim * instinct.confidence;
      return { instinct, sim, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const top = scored[0];
    const matching = top && top.sim > 0 ? top.instinct : null;
    const confidence = matching ? top!.score : 0;
    const alternatives = scored.slice(1, 1 + topK).filter(s => s.sim > 0).map(s => s.instinct);

    const shouldShortCircuit = confidence >= CONFIDENCE_THRESHOLD;

    const formatted = (matching ? [matching, ...alternatives] : alternatives).map(i => ({
      id: i.id,
      tags: i.tags,
      confidence: i.confidence,
      dispatch_count: i.dispatch_count,
      type: i.type,
      body: i.body.slice(0, 200) + (i.body.length > 200 ? "..." : ""),
    }));

    return {
      output: JSON.stringify({
        ok: true,
        agentName,
        query,
        queryTags,
        instinctCount: instincts.length,
        visibleCount: matching ? 1 + alternatives.length : alternatives.length,
        shortCircuit: shouldShortCircuit,
        confidence,
        threshold: CONFIDENCE_THRESHOLD,
        matchingInstinct: matching ? {
          id: matching.id,
          tags: matching.tags,
          confidence: matching.confidence,
          body: matching.body,
        } : null,
        topInstincts: formatted,
        vaultBrainVersion: "3.0-sub-agent",
        message: shouldShortCircuit
          ? `SHORT-CIRCUIT: High-confidence instinct '${matching!.id}' matches (confidence ${confidence.toFixed(2)} >= ${CONFIDENCE_THRESHOLD}). Apply the instinct's guidance directly.`
          : `No short-circuit candidates. ${matching ? 1 + alternatives.length : 0} instinct(s) match — deliberate normally.`,
      }, null, 2),
    };
  },
});

export default subAgentInstinctQueryTool;
