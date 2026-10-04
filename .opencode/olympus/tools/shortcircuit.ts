/**
 * olympus-shortcircuit Tool — v3.0 VaultBrain + Symphony
 *
 * Lets a god report that it short-circuited (dispatched directly based on a
 * high-confidence instinct, skipping deliberation). This feeds the brain
 * analytics dashboard and updates the instinct's `samples` + `successes`/
 * `failures` counts + `last_used` timestamp.
 *
 *   - Uses the shared instinct-mutations module (single source of truth for
 *     byte-preserving frontmatter edits).
 *   - Records both `samples` and `successes` (the short-circuit itself counts
 *     as a sample; the outcome — success/failure — is recorded by the
 *     tool.execute.after hook when the dispatch is finalized).
 *   - Emits a `shortcircuit` action event with the instinct_id + demigod so
 *     the brain-stats API can compute the short-circuit hit rate.
 *   - Symphony-native: the `demigod` arg is unprefixed (e.g., 'build-resolver',
 *     'code-verifier'); the parent god is determined by dispatch context.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import { rewardInstinct } from "../lib/instinct-mutations.js";
import { getVaultRoot } from "../../../src/lib/vault-root.js";

const VAULT_ROOT = getVaultRoot(); // D21: the single canonical resolver

const shortcircuitTool: ToolDefinition = tool({
  description:
    "Report that you short-circuited (dispatched directly based on a high-confidence instinct). Records the short-circuit in the activity feed and increments the instinct's samples count. The outcome (success/failure) is recorded later by the tool.execute.after hook when the dispatch is finalized — at which point the instinct's confidence is updated (rewarded on success, penalized on failure). Call this AFTER dispatching via the instinct's recommendation. The demigod arg is unprefixed (e.g., 'build-resolver').",
  args: {
    godId: tool.schema
      .string()
      .describe("Your god ID (e.g., 'hephaestus')."),
    instinctId: tool.schema
      .string()
      .describe("The instinct ID that triggered the short-circuit (from olympus-instinct-query's shortCircuitCandidate.instinct_id)."),
    demigod: tool.schema
      .string()
      .describe("The demigod you dispatched to (unprefixed, e.g., 'build-resolver', 'code-verifier'). The parent god is determined by the dispatch context."),
    taskSignature: tool.schema
      .string()
      .describe("The task that was dispatched (for the activity feed)."),
    verificationSample: tool.schema
      .boolean()
      .optional()
      .describe("Whether this short-circuit was a 1-in-10 verification sample (forced to re-deliberate). Defaults to false. If true, the brain-stats API will track verification sampling separately."),
  },
  execute: async (args: {
    godId: string;
    instinctId: string;
    demigod: string;
    taskSignature: string;
    verificationSample?: boolean;
  }, _context: any) => {
    const { godId, instinctId, demigod, taskSignature, verificationSample = false } = args;

    // Reward the instinct immediately for the short-circuit (samples++,
    // last_used updated). The success/failure counts are updated by the
    // hook when the dispatch is finalized.
    const rewarded = rewardInstinct(instinctId, godId);

    // Append to the activity feed
    try {
      const feedPath = path.join(VAULT_ROOT, "06_Activity_Feed", "live.jsonl");
      const dir = path.dirname(feedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const event = {
        ts: new Date().toISOString(),
        god: godId,
        action: "shortcircuit",
        task_signature: taskSignature,
        demigod: demigod,
        instinct_id: instinctId,
        verification_sample: verificationSample,
        msg: `SHORT-CIRCUIT: dispatched to ${demigod} for "${taskSignature.slice(0, 100)}"${verificationSample ? " (verification sample)" : ""}`,
        meta: {
          short_circuit: true,
          instinct_id: instinctId,
          demigod: demigod,
          task: taskSignature,
          verification_sample: verificationSample,
        },
      };
      fs.appendFileSync(feedPath, JSON.stringify(event) + "\n", "utf-8");
    } catch {
      // Non-fatal
    }

    return {
      output: JSON.stringify({
        ok: true,
        godId,
        instinctId,
        demigod,
        verificationSample,
        statsUpdated: rewarded,
        vaultBrainVersion: "3.0",
        message: rewarded
          ? `Short-circuit recorded. Instinct "${instinctId}" samples incremented, last_used updated. The dispatch outcome (success/failure) will be recorded by the tool.execute.after hook when the dispatch is finalized — at which point the instinct's confidence will be updated.`
          : `Short-circuit recorded in activity feed (instinct stats update failed — instinct may have been pruned, or it may be a seed instinct which is immutable).`,
      }, null, 2),
    };
  },
});

export default shortcircuitTool;
