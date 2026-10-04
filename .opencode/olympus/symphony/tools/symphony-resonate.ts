/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SYMPHONY-RESONATE TOOL — A God's Vibrational Signature Emitter
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  This tool is registered alongside olympus-dispatch. A God calls it
 *  with its payload + target orchestra, and the tool:
 *
 *    1. Composes a VibrationalSignature (semantic quantization + Vault
 *       registry write + coherence baseline measurement).
 *    2. Returns the signature ID + the symbolic form + the projected
 *       token economy.
 *
 *  The God can then either:
 *    a) Call the existing olympus-dispatch tool for each target demigod,
 *       passing the signature ID as the `task` (the dispatch tool logs
 *       the signature ID to the activity feed for tracking), OR
 *    b) Wait for a future Symphony-native sub-agent fleet that can
 *       accept signatures directly.
 *
 *  This tool is the Symphony's "front door" for Gods. It is non-destructive:
 *  if a God prefers the legacy textual dispatch, it can still use
 *  olympus-dispatch directly without ever calling symphony-resonate.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
// ATLAS (MADRUGA-3 p2): the sync-map funnel — a broadcast prompt is
// recorded by Atlas first.
import {
  atlasIngestDispatch,
  atlasMarkDispatchFailed,
  atlasMarkEmitComplete,
} from "../../lib/atlas-sync.js";
import {
  composeSignature,
  serializeSignature,
  estimateSignatureEconomy,
  symbolicForm,
} from "../../../../src/lib/symphony/index.js";

const symphonyResonateTool: ToolDefinition = tool({
  description:
    "Compose a VibrationalSignature from a free-text payload + target orchestra list. " +
    "This is the Symphony' emit endpoint — a God calls this to delegate " +
    "a task to one or more demigods via the vibrational protocol (latent, compressed, " +
    "zero-loss via the Vault's Resonance Registry). Returns a signature ID + symbolic " +
    "form + projected token economy. The original payload is preserved in full in the " +
    "Vault — the signature is a lossless compressed packet. After calling this, " +
    "either invoke olympus-dispatch for each target demigod (legacy path) or wait " +
    "for Symphony-native sub-agents.",
  args: {
    composer: tool.schema
      .string()
      .describe("Your god ID (e.g., 'apollo', 'athena')."),
    payload: tool.schema
      .string()
      .describe(
        "The free-text payload — what you would have sent as a markdown handoff " +
        "prompt in the legacy system. This is preserved in full in the Vault's " +
        "Resonance Registry (zero-loss). The signature is a compressed packet " +
        "that carries a Vault anchor pointing back to this payload.",
      ),
    targetOrchestra: tool.schema
      .array(tool.schema.string())
      .describe(
        "Array of demigod IDs that should resonate with this signature. " +
        "e.g., ['build-resolver', 'code-verifier'].",
      ),
    broadcastMode: tool.schema
      .string()
      .optional()
      .describe("'parallel' (default) or 'serial'. Parallel is the Symphony default."),
    parentSignature: tool.schema
      .string()
      .optional()
      .describe("Parent signature ID, if this delegation descends from another."),
    ttl: tool.schema
      .number()
      .optional()
      .describe("Time-to-live in ms. Default 300000 (5 min)."),
    stackHints: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Pre-resolved stack hints (skip auto-detection). e.g., ['rust', 'postgres']."),
  },
  execute: async (args: {
    composer: string;
    payload: string;
    targetOrchestra: string[];
    broadcastMode?: "parallel" | "serial";
    parentSignature?: string;
    ttl?: number;
    stackHints?: string[];
  }) => {
    // ATLAS (MADRUGA-3 p2, Phase 1): a Symphony broadcast is a god-dispatch
    // prompt — recorded by Atlas BEFORE anything else happens for it. The
    // lifecycle is emit-shaped: received → done (signature composed +
    // broadcast) | failed.
    const syncEntry = atlasIngestDispatch({
      godId: String(args.composer || "unknown"),
      demigod: `orchestra:${(args.targetOrchestra || []).join(",") || "none"}`,
      task: String(args.payload || ""),
    });
    try {
      const signature = composeSignature({
        composer: args.composer,
        payload: args.payload,
        targetOrchestra: args.targetOrchestra,
        broadcastMode: args.broadcastMode ?? "parallel",
        parentSignature: args.parentSignature,
        ttl: args.ttl,
        stackHints: args.stackHints,
      });

      const economy = estimateSignatureEconomy(
        signature,
        args.payload.length,
      );

      const symbol = symbolicForm(signature.intentVector);

      atlasMarkEmitComplete(syncEntry.id, {
        signatureId: signature.id,
        vaultAnchor: signature.vaultAnchor.anchorId,
      });

      return {
        output: JSON.stringify(
          {
            ok: true,
            signatureId: signature.id,
            protocol: signature.protocol,
            intentType: signature.intentVector.intentType,
            intentHash: signature.intentVector.intentHash,
            symbolicForm: symbol,
            semanticTokens: signature.intentVector.semanticTokens,
            dimensions: signature.intentVector.dimensions,
            constraints: signature.constraintMatrix,
            successPredicates: signature.successCriteria,
            vaultAnchor: signature.vaultAnchor,
            coherenceBaseline: signature.coherenceBaseline,
            targetOrchestra: signature.targetOrchestra,
            broadcastMode: signature.broadcastMode,
            economyEstimate: economy,
            serializedSize: serializeSignature(signature).length,
            nextStep:
              "Now either invoke olympus-dispatch for each target demigod (legacy path), " +
              "passing the signature ID as the task, or wait for Symphony-native " +
              "sub-agents. The signature's full payload is preserved in the Vault at " +
              `registry entry ${signature.vaultAnchor.anchorId}.`,
          },
          null,
          2,
        ),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        atlasMarkDispatchFailed(syncEntry.id, message);
      } catch { /* recording a failed transition never breaks the tool result */ }
      return {
        output: JSON.stringify({ ok: false, error: message }, null, 2),
      };
    }
  },
});

export default symphonyResonateTool;
