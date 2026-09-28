/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SYMPHONY-DECODE TOOL — The Decoding Choir Invocation
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  This tool is invoked by a God (typically Apollo, the master planner)
 *  at the END of a Symphony cycle. The God provides a signature ID + a
 *  list of harmonic IDs (collected from parallel demigods), and the tool:
 *
 *    1. Loads the signature + harmonics from the Vault.
 *    2. Fuses the harmonics into a Consensus (via the Conductor).
 *    3. Invokes the Decoding Choir to produce user-facing text.
 *    4. Returns the ChoirOutput.
 *
 *  If the Choir detects coherence below the fallback threshold, it
 *  transparently switches to textual mode and informs the user (Axiom A4).
 *
 *  This is the Symphony's user-facing boundary — internal agents never
 *  emit text for the user; they only emit vibrations. The Choir is the
 *  sole translator.
 *
 *  `decode()` calls the real `measureConsensusCoherence` (geometric-mean
 *  consensus) via the Symphony core. Arithmetic-mean demigod self-assessed
 *  confidence would be FAKE coherence — the A4 mandatory-fallback safety
 *  net would not be enforced, and low-quality consensus with confident
 *  demigods would be wrongly reported as "symphony mode". This tool imports
 *  the REAL `fuseHarmonics` + `decode` from the Symphony core, which:
 *    - Computes the true coherence via the geometric mean of coverage,
 *      constraint preservation, and predicate preservation
 *    - Enforces the A4 fallback threshold (0.70) correctly
 *    - Produces a real ChoirOutput with the correct mode
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
// Import the REAL Symphony core functions. fuseHarmonics() computes the true
// consensus coherence via a geometric mean, and decode() enforces the A4
// fallback threshold correctly. Computing fake coherence inline (arithmetic
// mean of self-assessed confidence) violates the A4 safety net. The import
// path matches the one used by symphony-resonate.ts and symphony-harmonize.ts.
import {
  fuseHarmonics,
  decode,
  retrieveResonance,
  type VibrationalSignature,
  type HarmonicPattern,
} from "../../../../src/lib/symphony/index.js";

const VAULT_ROOT =
  process.env.OLYMPUS_VAULT || path.join(os.homedir(), "OLYMPUS-VAULT");
const REGISTRY_PATH = path.join(
  VAULT_ROOT,
  "05_Auto_Learning",
  "vibrations",
  "registry.jsonl",
);

const symphonyDecodeTool: ToolDefinition = tool({
  description:
    "Invoke the Decoding Choir. Given a signature ID + a list of harmonic IDs " +
    "(collected from parallel demigods), this tool fuses the harmonics into a " +
    "Consensus and translates it into pristine user-facing text. The Choir " +
    "measures coherence — if it falls below the safe threshold, the Choir " +
    "transparently falls back to textual mode and informs the user. " +
    "This is the Symphony's user-facing boundary — internal agents never " +
    "emit text for the user; only the Choir does. Call this at the END of " +
    "a Symphony cycle, after all demigods have returned their harmonics.",
  args: {
    signatureId: tool.schema
      .string()
      .describe("The ID of the VibrationalSignature that started this cycle."),
    harmonicIds: tool.schema
      .array(tool.schema.string())
      .describe("Array of harmonic IDs collected from the parallel demigods."),
    composer: tool.schema
      .string()
      .optional()
      .describe("Your god ID (for audit logging). Default 'apollo'."),
  },
  execute: async (args: {
    signatureId: string;
    harmonicIds: string[];
    composer?: string;
  }) => {
    try {
      // Load the signature + harmonics from the registry
      if (!fs.existsSync(REGISTRY_PATH)) {
        return {
          output: JSON.stringify(
            {
              ok: false,
              error:
                "Resonance Registry not found. The Symphony has not been initialized — " +
                "no signatures have been composed yet.",
            },
            null,
            2,
          ),
        };
      }

      const lines = fs
        .readFileSync(REGISTRY_PATH, "utf-8")
        .split("\n")
        .filter(Boolean);

      // Find the signature-source entry + harmonic entries
      let signatureEntry: any = null;
      const harmonicEntries: any[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (
            entry.id === args.signatureId &&
            entry.kind === "signature-source"
          ) {
            signatureEntry = entry;
          }
          if (args.harmonicIds.includes(entry.id)) {
            harmonicEntries.push(entry);
          }
        } catch {
          // skip malformed
        }
      }

      if (!signatureEntry) {
        return {
          output: JSON.stringify(
            {
              ok: false,
              error: `Signature ${args.signatureId} not found in the registry.`,
            },
            null,
            2,
          ),
        };
      }

      if (harmonicEntries.length === 0) {
        return {
          output: JSON.stringify(
            {
              ok: false,
              error: `No harmonics found for IDs: ${args.harmonicIds.join(", ")}`,
            },
            null,
            2,
          ),
        };
      }

      // Reconstruct a REAL VibrationalSignature + HarmonicPattern[] from the
      // registry entries, then call the REAL fuseHarmonics() + decode() from
      // the Symphony core.
      //
      // The registry stores the signature's payload (zero-loss) and the
      // harmonics' structured outcomes. We reconstruct enough of the
      // signature to call fuseHarmonics() — the fusion only needs:
      //   - signature.id, signature.composer, signature.protocol
      //   - signature.targetOrchestra
      //   - signature.successCriteria
      //   - signature.vaultAnchor
      //   - harmonics[].id, .demigod, .outcomes, .artifacts, .confidence, etc.
      //
      // fuseHarmonics() computes the REAL coherence via a geometric mean of:
      //   - coverage (how many harmonics responded)
      //   - constraint preservation (did the harmonics respect the constraints)
      //   - predicate preservation (did the outcomes match the success criteria)
      //
      // decode() then uses the REAL coherence to decide the Choir mode:
      //   - ≥ 0.90 → symphony (full speed, polished output)
      //   - 0.70–0.90 → augmented (pull extra context from the Vault)
      //   - < 0.70 → fallback (mandatory textual mode, A4)
      //
      // Arithmetic mean of demigod self-assessed confidence is NOT coherence
      // and does not enforce the A4 safety net; computing it inline would be
      // FAKE coherence.

      const signature: VibrationalSignature = {
        id: signatureEntry.id,
        protocol: signatureEntry.protocol || "symphony/1.0",
        composer: signatureEntry.godId || args.composer || "apollo",
        emittedAt: signatureEntry.registeredAt || new Date().toISOString(),
        intentVector: signatureEntry.intentVector || {
          intentType: "orchestrate",
          intentHash: signatureEntry.intentHash || "",
          semanticTokens: signatureEntry.semanticTokens || [],
          dimensions: { priority: 0.5, risk: 0.3, complexity: 0.5, novelty: 0.5 },
        },
        constraintMatrix: signatureEntry.constraintMatrix || {},
        successCriteria: signatureEntry.successCriteria || [],
        vaultAnchor: {
          anchorType: "registry",
          anchorId: signatureEntry.id,
          checksum: signatureEntry.checksum || "",
        },
        coherenceBaseline: signatureEntry.coherenceBaseline ?? 0.85,
        targetOrchestra: signatureEntry.targetOrchestra || [],
        broadcastMode: signatureEntry.broadcastMode || "parallel",
        ttl: signatureEntry.ttl,
      };

      const harmonics: HarmonicPattern[] = harmonicEntries.map((h) => ({
        id: h.id,
        signatureId: args.signatureId,
        demigod: h.godId || h.demigod || "unknown",
        protocol: h.protocol || "symphony/1.0",
        emittedAt: h.registeredAt || h.emittedAt || new Date().toISOString(),
        outcomes: h.outcomes || [],
        artifacts: h.artifacts || [],
        contextAnchor: h.contextAnchor || {
          anchorType: "inline",
          anchorId: "reconstructed",
          inlinePayload: h.payload || "",
          checksum: "",
        },
        confidence: h.confidence ?? 0.85,
        tokensConsumed: h.tokensConsumed ?? 0,
        durationMs: h.durationMs ?? 0,
        error: h.error,
      }));

      // Call the REAL fuseHarmonics + decode from the Symphony core
      const sourcePayload = signatureEntry.payload || "";
      const consensus = fuseHarmonics(signature, harmonics, sourcePayload);
      const choirOutput = decode(signature, consensus);

      return {
        output: JSON.stringify(
          {
            ok: true,
            signatureId: args.signatureId,
            harmonicCount: harmonicEntries.length,
            coherence: choirOutput.coherence,
            mode: choirOutput.mode,
            fellBack: choirOutput.fellBack,
            text: choirOutput.text,
            tokensSpent: choirOutput.tokensSpent,
            consensus: {
              fusedOutcomes: consensus.fusedOutcomes.length,
              harmonics: consensus.harmonics.length,
              tokenEconomy: consensus.tokenEconomy,
            },
            nextStep:
              "Deliver the `text` field to the user. The Symphony cycle is now " +
              "complete. The tuner has updated the harmonic templates based on " +
              "the cycle outcome.",
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

export default symphonyDecodeTool;
