/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SYMPHONY-HARMONIZE TOOL — A Demigod's Harmonic Return
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  A Symphony-aware Demigod calls this tool to return its work as a
 *  HarmonicPattern. The tool:
 *
 *    1. Wraps the structured result into a HarmonicPattern.
 *    2. Registers the demigod's read-context in the Vault's Resonance
 *       Registry (the lossless "I-read-this" trail).
 *    3. Returns the harmonic ID + serialized form.
 *
 *  The Demigod should call this AFTER it has completed its work, with:
 *    - The signature ID it was responding to
 *    - Its structured outcomes (which predicates pass/fail)
 *    - Its artifacts (file paths, diffs, command outputs)
 *    - A short context-read string (what files/resources it consulted)
 *    - Its token consumption + duration
 *    - A self-assessed confidence in [0,1]
 *
 *  In the current Symphony v1.0, this tool is OPTIONAL — most existing
 *  sub-agents will continue to return textual output, which the Bridge
 *  layer wraps into harmonics automatically. Symphony-aware demigods
 *  (a future fleet) will call this directly.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import {
  harmonicFromResult,
  harmonicFromError,
  type HarmonicOutcome,
  type ArtifactPointer,
} from "../../../../src/lib/symphony/index.js";

const symphonyHarmonizeTool: ToolDefinition = tool({
  description:
    "Return a HarmonicPattern to the Conductor. A Symphony-aware demigod calls " +
    "this AFTER completing its work. The tool wraps the structured result into " +
    "a harmonic, registers the demigod's read-context in the Vault (lossless " +
    "I-read-this trail), and returns the harmonic ID. The Conductor fuses " +
    "harmonics from all parallel demigods into a Consensus, which the Decoding " +
    "Choir then translates into user-facing text. Most existing sub-agents will " +
    "NOT need this — the Bridge layer auto-wraps textual output. Use this only " +
    "if you are a Symphony-native demigod.",
  args: {
    signatureId: tool.schema
      .string()
      .describe("The ID of the VibrationalSignature this harmonic answers."),
    demigod: tool.schema
      .string()
      .describe("Your demigod ID (e.g., 'build-resolver')."),
    outcomes: tool.schema
      .array(
        tool.schema.object({
          predicateKind: tool.schema.string(),
          target: tool.schema.string(),
          status: tool.schema.string(),
          evidence: tool.schema.string().optional(),
        }),
      )
      .optional()
      .describe("Array of outcome records — one per success predicate."),
    artifacts: tool.schema
      .array(
        tool.schema.object({
          kind: tool.schema.string(),
          location: tool.schema.string(),
          summary: tool.schema.string(),
          bytes: tool.schema.number().optional(),
        }),
      )
      .optional()
      .describe("Artifacts produced — file paths, diffs, command outputs, MCP resources."),
    contextRead: tool.schema
      .string()
      .optional()
      .describe("Short string describing what files/resources you consulted."),
    tokensConsumed: tool.schema
      .number()
      .optional()
      .describe("LLM tokens you consumed while producing this harmonic."),
    durationMs: tool.schema
      .number()
      .optional()
      .describe("Wall-clock time you spent, in ms."),
    confidence: tool.schema
      .number()
      .optional()
      .describe("Self-assessed confidence in [0,1]. Default 0.85."),
    error: tool.schema
      .object({
        code: tool.schema.string(),
        message: tool.schema.string(),
        recoverable: tool.schema.boolean(),
      })
      .optional()
      .describe("Structured error — only set if you could not complete the task."),
  },
  execute: async (args: {
    signatureId: string;
    demigod: string;
    outcomes?: HarmonicOutcome[];
    artifacts?: ArtifactPointer[];
    contextRead?: string;
    tokensConsumed?: number;
    durationMs?: number;
    confidence?: number;
    error?: { code: string; message: string; recoverable: boolean };
  }) => {
    try {
      let harmonic;
      if (args.error) {
        harmonic = harmonicFromError({
          signatureId: args.signatureId,
          demigod: args.demigod,
          error: args.error,
          tokensConsumed: args.tokensConsumed ?? 0,
          durationMs: args.durationMs ?? 0,
        });
      } else {
        harmonic = harmonicFromResult({
          signatureId: args.signatureId,
          demigod: args.demigod,
          outcomes: args.outcomes ?? [],
          artifacts: args.artifacts ?? [],
          contextRead: args.contextRead ?? "",
          tokensConsumed: args.tokensConsumed ?? 0,
          durationMs: args.durationMs ?? 0,
          confidence: args.confidence ?? 0.85,
        });
      }

      return {
        output: JSON.stringify(
          {
            ok: true,
            harmonicId: harmonic.id,
            signatureId: harmonic.signatureId,
            demigod: harmonic.demigod,
            protocol: harmonic.protocol,
            emittedAt: harmonic.emittedAt,
            contextAnchor: harmonic.contextAnchor,
            confidence: harmonic.confidence,
            tokensConsumed: harmonic.tokensConsumed,
            durationMs: harmonic.durationMs,
            outcomeCount: harmonic.outcomes.length,
            artifactCount: harmonic.artifacts.length,
            error: harmonic.error ?? null,
            nextStep:
              "Your harmonic has been registered with the Vault's Resonance " +
              "Registry. The Conductor will fuse it with harmonics from other " +
              "parallel demigods into a Consensus, which the Decoding Choir " +
              "will translate into the user-facing response.",
          },
          null,
          2,
        ),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        output: JSON.stringify({ ok: false, error: message }, null, 2),
      };
    }
  },
});

export default symphonyHarmonizeTool;
