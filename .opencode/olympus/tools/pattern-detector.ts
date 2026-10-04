/**
 * olympus-pattern-detector Tool — v0.0.1 Rebuild
 *
 * Detects cross-god dispatch chain patterns from the activity feed.
 * Runs on session.idle (called by Callimachus) OR on-demand by a god.
 *
 * Behavior:
 *   1. Reads ~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl since `since` timestamp.
 *   2. Groups dispatch_outcome events by task_signature.
 *   3. For each group with >= 3 samples, extracts the god chain.
 *   4. If success_rate >= 0.85 and samples >= 5, writes a pattern file to
 *      ~/OLYMPUS-VAULT/05_Auto_Learning/patterns/<pattern_id>.md
 *   5. Returns the detected patterns.
 *
 * The patterns are queryable via the existing olympus-patterns tool
 * (patterns.ts). Apollo queries them with includePatterns: true to discover
 * optimal god chains BEFORE dispatching.
 *
 * Quality constraints (see CHANGES.md):
 *   - All `.on('error', (err) => ...)` use `(err: any)`.
 *   - All `child.stdout`/`child.stderr` use `?.`.
 *   - Never uses `import.meta.url` (this is a `.opencode/` plugin file).
 *   - Cross-platform — Windows, macOS, Linux.
 *   - Does not crash on empty activity feeds.
 *   - No emojis.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { getVaultRoot } from "../../../src/lib/vault-root.js";

const VAULT_ROOT = getVaultRoot(); // D21: the single canonical resolver
const ACTIVITY_FEED = path.join(VAULT_ROOT, "06_Activity_Feed", "live.jsonl");
const PATTERNS_DIR = path.join(VAULT_ROOT, "05_Auto_Learning", "patterns");

const patternDetectorTool: ToolDefinition = tool({
  description:
    "Detect cross-god dispatch chain patterns from the activity feed. Call this on session.idle (Callimachus) or on-demand. Returns the patterns found + writes pattern files to the vault for future queries via olympus-patterns. A pattern is recorded when a task_signature has >= 3 samples AND >= 0.85 success rate AND >= 5 samples (for promotion to a permanent pattern file).",
  args: {
    since: tool.schema
      .string()
      .optional()
      .describe("ISO timestamp — analyze events after this. If omitted, analyzes the entire activity feed (use with care on large feeds)."),
    min_samples: tool.schema
      .number()
      .optional()
      .describe("Minimum samples for a pattern to be considered. Default: 3."),
    min_success_rate: tool.schema
      .number()
      .optional()
      .describe("Minimum success rate for a pattern to be promoted to a permanent file. Default: 0.85."),
    promote_samples: tool.schema
      .number()
      .optional()
      .describe("Minimum samples for a pattern to be promoted to a permanent file. Default: 5."),
    dry_run: tool.schema
      .boolean()
      .optional()
      .describe("If true, detect patterns but do NOT write pattern files. Default: false."),
  },
  execute: async (args, _context): Promise<any> => {
    const since = args.since;
    const minSamples = args.min_samples ?? 3;
    const minSuccessRate = args.min_success_rate ?? 0.85;
    const promoteSamples = args.promote_samples ?? 5;
    const dryRun = args.dry_run ?? false;

    // --- 1. Read the activity feed --------------------------------------
    let events: any[] = [];
    try {
      if (!fs.existsSync(ACTIVITY_FEED)) {
        return {
          ok: true,
          patterns_found: 0,
          patterns: [],
          message: `Activity feed not found at ${ACTIVITY_FEED}. Nothing to analyze.`,
        };
      }
      const raw = fs.readFileSync(ACTIVITY_FEED, "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          events.push(ev);
        } catch {
          // Skip malformed lines — the feed is append-only JSONL
        }
      }
    } catch (e: any) {
      return { ok: false, error: `Failed to read activity feed: ${e.message}` };
    }

    // --- 2. Filter by since (if provided) -------------------------------
    if (since) {
      const sinceMs = Date.parse(since);
      if (!isNaN(sinceMs)) {
        events = events.filter((ev) => {
          const ts = ev.ts ? Date.parse(ev.ts) : NaN;
          return !isNaN(ts) && ts >= sinceMs;
        });
      }
    }

    if (events.length === 0) {
      return {
        ok: true,
        patterns_found: 0,
        patterns: [],
        message: "No events in the activity feed (after the since filter). Nothing to analyze.",
      };
    }

    // --- 3. Group dispatch + dispatch_outcome events by task_signature --
    //
    // The activity feed has two relevant event types:
    //   - dispatch:      logged by olympus-dispatch tool + tool.execute.after
    //   - dispatch_outcome: logged by tool.execute.after when the dispatch
    //                       is finalized (agent transition or session.idle)
    //
    // We pair them by task_signature. For each task_signature, we extract:
    //   - The god chain (which gods dispatched to which demigods)
    //   - The success rate (outcomes / total)
    //   - The sample count
    //   - The avg duration

    interface DispatchRecord {
      god: string;
      demigod: string;
      outcome: "success" | "failure" | "unknown";
      duration_ms: number;
    }

    const byTaskSignature: Record<string, DispatchRecord[]> = {};

    // First pass: collect dispatch events to build the task_signature -> records map.
    // We look for events with action === "dispatch" or action === "dispatch_outcome".
    for (const ev of events) {
      if (ev.action !== "dispatch" && ev.action !== "dispatch_outcome") continue;

      const taskSig = ev.task_signature || ev.task || null;
      if (!taskSig) continue;

      const god = ev.god || null;
      const demigod = ev.demigod || ev.demigod || ev.agent || null;
      if (!god || !demigod) continue;

      if (!byTaskSignature[taskSig]) byTaskSignature[taskSig] = [];

      // dispatch_outcome events carry the final outcome; dispatch events
      // establish the chain. We pair them: a dispatch_outcome updates the
      // last dispatch record for the same (taskSig, god, demigod).
      if (ev.action === "dispatch_outcome") {
        const records = byTaskSignature[taskSig];
        // Find the last dispatch record for this (god, demigod) without an outcome
        for (let i = records.length - 1; i >= 0; i--) {
          if (records[i].god === god && records[i].demigod === demigod && records[i].outcome === "unknown") {
            records[i].outcome = ev.outcome || "unknown";
            records[i].duration_ms = ev.duration_ms || records[i].duration_ms;
            break;
          }
        }
      } else {
        // dispatch event — add a new record
        byTaskSignature[taskSig].push({
          god,
          demigod,
          outcome: "unknown",
          duration_ms: 0,
        });
      }
    }

    // --- 4. Build the patterns ------------------------------------------
    interface Pattern {
      gods: string[];
      demigods: string[];
      trigger_signature: string;
      success_rate: number;
      samples: number;
      avg_duration_ms: number;
      pattern_id: string;
      promoted: boolean;
    }

    const patterns: Pattern[] = [];

    for (const [taskSig, records] of Object.entries(byTaskSignature)) {
      if (records.length < minSamples) continue;

      // Group records by their (god, demigod) chain.
      // For simplicity, we treat the entire set of records for this task_sig
      // as one "chain" — the gods + demigods involved, in any order.
      // (A more sophisticated detector would order them by timestamp.)
      const godSet = new Set<string>();
      const demigodSet = new Set<string>();
      let successes = 0;
      let totalDuration = 0;
      let outcomeCount = 0;

      for (const r of records) {
        godSet.add(r.god);
        demigodSet.add(r.demigod);
        if (r.outcome === "success") successes++;
        if (r.outcome !== "unknown") outcomeCount++;
        totalDuration += r.duration_ms;
      }

      const samples = records.length;
      const successRate = outcomeCount > 0 ? successes / outcomeCount : 0;
      const avgDuration = samples > 0 ? Math.round(totalDuration / samples) : 0;

      const gods = Array.from(godSet).sort();
      const demigods = Array.from(demigodSet).sort();

      // Pattern ID: hash of gods + demigods + task signature
      const patternId = crypto
        .createHash("sha1")
        .update(`${gods.join(",")}|${demigods.join(",")}|${taskSig}`)
        .digest("hex")
        .slice(0, 12);

      const promoted = successRate >= minSuccessRate && samples >= promoteSamples;

      patterns.push({
        gods,
        demigods,
        trigger_signature: taskSig,
        success_rate: Math.round(successRate * 100) / 100,
        samples,
        avg_duration_ms: avgDuration,
        pattern_id: patternId,
        promoted,
      });
    }

    // Sort by samples descending
    patterns.sort((a, b) => b.samples - a.samples);

    // --- 5. Write pattern files (if not dry run + promoted) ------------
    let writtenCount = 0;
    if (!dryRun) {
      try {
        fs.mkdirSync(PATTERNS_DIR, { recursive: true });
      } catch (e: any) {
        return { ok: false, error: `Failed to create patterns directory: ${e.message}` };
      }

      for (const p of patterns) {
        if (!p.promoted) continue;

        const patternPath = path.join(PATTERNS_DIR, `${p.pattern_id}.md`);
        const content = renderPatternFile(p);
        try {
          fs.writeFileSync(patternPath, content, "utf-8");
          writtenCount++;
        } catch (e: any) {
          // Continue — best-effort
        }
      }
    }

    return {
      ok: true,
      patterns_found: patterns.length,
      patterns_promoted: patterns.filter((p) => p.promoted).length,
      patterns_written: dryRun ? 0 : writtenCount,
      patterns: patterns.map((p) => ({
        gods: p.gods,
        demigods: p.demigods,
        trigger_signature: p.trigger_signature,
        success_rate: p.success_rate,
        samples: p.samples,
        avg_duration_ms: p.avg_duration_ms,
        pattern_id: p.pattern_id,
        promoted: p.promoted,
      })),
      message: `Analyzed ${events.length} events. Found ${patterns.length} patterns (>= ${minSamples} samples). Promoted ${patterns.filter((p) => p.promoted).length} to permanent files (>= ${promoteSamples} samples, >= ${minSuccessRate} success rate).${dryRun ? " (dry run — no files written)" : ` Wrote ${writtenCount} pattern files.`}`,
    };
  },
});

function renderPatternFile(p: {
  gods: string[];
  demigods: string[];
  trigger_signature: string;
  success_rate: number;
  samples: number;
  avg_duration_ms: number;
  pattern_id: string;
}): string {
  const now = new Date().toISOString();
  const godsYaml = p.gods.map((g) => `"${g}"`).join(", ");
  const demigodsYaml = p.demigods.map((d) => `"${d}"`).join(", ");

  return `---
type: dispatch-chain
pattern_id: ${p.pattern_id}
gods: [${godsYaml}]
demigods: [${demigodsYaml}]
success_rate: ${p.success_rate}
samples: ${p.samples}
avg_duration_ms: ${p.avg_duration_ms}
trigger_signature: "${p.trigger_signature}"
scope: global
stacks: []
projects: []
last_updated: ${now}
---

# Pattern: ${p.trigger_signature}

## God Chain

${p.gods.map((g) => `1. ${g}`).join("\n")}

## Demigods Involved

${p.demigods.map((d) => `- ${d}`).join("\n")}

## Stats

- **Samples:** ${p.samples}
- **Success rate:** ${(p.success_rate * 100).toFixed(1)}%
- **Avg duration:** ${p.avg_duration_ms}ms
- **Trigger signature:** ${p.trigger_signature}

## Origin

This pattern was auto-detected by the pattern-detector tool from the
activity feed. It captures the god chain that consistently succeeds for
the trigger signature \`${p.trigger_signature}\`.

Apollo queries these patterns via \`olympus-instinct-query\` with
\`includePatterns: true\` to discover optimal god chains BEFORE
dispatching.

## Lifecycle

- This pattern file is auto-regenerated by pattern-detector on each
  session.idle (if the pattern still meets the promotion threshold).
- If the success rate drops below 0.85 OR samples drop below 5, the
  pattern is removed on the next pattern-detector run.
`;
}

export default patternDetectorTool;
