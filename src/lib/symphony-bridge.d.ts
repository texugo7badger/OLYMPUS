/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SYMPHONY BRIDGE — OLYMPUS / Symphony Interop Layer (always-on)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Bridge is the symmetric adapter between OLYMPUS's textual
 *  infrastructure (caveman, handoff-prompt-builder, olympus-dispatch tool,
 *  VaultBrain v3.0) and the Symphony vibrational protocol.
 *
 *  Symphony is ALWAYS-ON in v0.0.1. It is the standard language between
 *  Gods and Demigods — every dispatch is a VibrationalSignature. The bridge
 *  preserves every existing behavior while making Symphony the transport:
 *
 *    - The caveman skill continues to compress agent output. Symphony
 *      signatures use caveman-grade summaries for the `summary` field of
 *      ArtifactPointers — caveman is the OUTPUT compression, Symphony is
 *      the TRANSPORT compression.
 *
 *    - The olympus-dispatch tool is Symphony-native: it composes a
 *      VibrationalSignature and broadcasts it. The conductor uses dispatchFn
 *      as the injection point — in production, dispatchFn is a wrapper that
 *      calls olympus-dispatch under the hood.
 *
 *    - The VaultBrain v3.0 instinct lifecycle is preserved. Symphony's
 *      tuner is an ANALOG of the instinct lifecycle, operating at the
 *      vibrational level. The two layers coexist: Symphony tracks
 *      signatures and harmonics, the VaultBrain tracks instincts and
 *      dispatch outcomes. They share the same vault root.
 *
 *  The bridge exposes:
 *
 *    - legacyPayloadToSignature : wrap a textual handoff into a signature
 *    - signatureToLegacyPrompt  : unwrap a signature back into a textual
 *                                 prompt (for demigods that haven't yet
 *                                 been Symphony-enabled)
 *    - dispatchFnForOpenCode    : the production dispatchFn that calls
 *                                 olympus-dispatch under the hood
 *    - handoffToSymphony        : a drop-in replacement for the existing
 *                                 handoff-prompt-builder.ts that returns
 *                                 a signature (plus a Choir-ready
 *                                 fallback prompt for legacy demigods)
 *    - runSymphonyCycle         : the single entry point — compose,
 *                                 conduct, decode. Used by the API routes.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
  *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
*/
import type { VibrationalSignature, HarmonicPattern } from './symphony/core/protocol.js';
import { conduct } from './symphony/core/conductor.js';
import { decode } from './symphony/core/choir.js';
/**
 * Convert a legacy textual handoff payload into a VibrationalSignature.
 *
 *  This is the entry point for Symphony-enabling a God that currently
 *  emits markdown handoff prompts. The God continues to compose its
 *  payload as text; the bridge wraps the payload into a signature.
 *  The payload itself is preserved in the Vault's Resonance Registry —
 *  zero-loss.
 *
 *  composer        : the God's ID
 *  payload         : the markdown handoff prompt (preserved in full)
 *  targetOrchestra : the demigod IDs the God would have dispatched to
 */
export declare function legacyPayloadToSignature(input: {
    composer: string;
    payload: string;
    targetOrchestra: string[];
    parentSignature?: string;
}): VibrationalSignature;
/**
 * Convert a VibrationalSignature back into a textual prompt — for
 * demigods that have NOT yet been Symphony-enabled (i.e., demigods that
 * still expect a textual handoff rather than a vibrational broadcast).
 *
 *  The reconstructed prompt is NOT a verbatim copy of the original
 *  payload. It is a SUMMARY that includes:
 *    - The intent type and semantic tokens
 *    - The constraints
 *    - The success predicates
 *    - A pointer to the Vault registry entry (for full context)
 *
 *  This means a Symphony-native God can dispatch to a legacy demigod
 *  WITHOUT re-encoding the full payload — the demigod receives a
 *  compact summary plus a Vault pointer.
 */
export declare function signatureToLegacyPrompt(sig: VibrationalSignature): string;
/**
 * A production-ready dispatchFn that bridges to OLYMPUS's existing
 * olympus-dispatch tool. In a live OLYMPUS deployment, this is the
 * callback passed to `conduct()`.
 *
 *  For each target demigod, this function:
 *    1. Calls signatureToLegacyPrompt() to produce a compact prompt.
 *    2. Invokes the demigod via OpenCode's subtask mechanism (in
 *       production this would call the olympus-dispatch tool; in
 *       the Symphony test harness it can be a stub).
 *    3. Wraps the demigod's textual output into a HarmonicPattern.
 *
 *  The wrapped harmonic carries:
 *    - The demigod's textual output as an inline artifact (summary form)
 *    - A "pass" outcome if the demigod didn't error
 *    - The demigod's reported token consumption (if available)
 */
export declare function dispatchFnForOpenCode(invokeDemigod: (demigod: string, prompt: string) => Promise<{
    output: string;
    tokensConsumed?: number;
    durationMs?: number;
    artifacts?: Array<{
        location: string;
        summary: string;
    }>;
    error?: {
        code: string;
        message: string;
        recoverable: boolean;
    };
}>): (demigod: string, sig: VibrationalSignature) => Promise<HarmonicPattern>;
/**
 * Run a complete Symphony cycle: compose → conduct → decode.
 *
 *  This is the single entry point — used by the API routes and by the
 *  olympus-dispatch tool. A God calls this with its payload and target
 *  orchestra, and receives a polished user-facing response (plus the
 *  underlying Consensus for audit / brain-atlas overlay).
 */
export declare function runSymphonyCycle(input: {
    composer: string;
    payload: string;
    targetOrchestra: string[];
    invokeDemigod: (demigod: string, prompt: string) => Promise<{
        output: string;
        tokensConsumed?: number;
        durationMs?: number;
        artifacts?: Array<{
            location: string;
            summary: string;
        }>;
        error?: {
            code: string;
            message: string;
            recoverable: boolean;
        };
    }>;
}): Promise<{
    signature: VibrationalSignature;
    consensus: ReturnType<typeof conduct> extends Promise<infer R> ? R : never;
    choirOutput: ReturnType<typeof decode>;
}>;
/**
 * Reconstruct the original payload from a signature's Vault anchor.
 *  This is the lossless proof path — used by the Choir in fallback mode
 *  and by the brain-atlas overlay for audit.
 */
export declare function reconstructPayload(sig: VibrationalSignature): string | null;
