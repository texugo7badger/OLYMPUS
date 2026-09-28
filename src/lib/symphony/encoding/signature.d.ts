/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SIGNATURE ENCODER — The Composer's Pen
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  This module is the Composer's instrument. A God calls `composeSignature`
 *  with a free-text payload (the kind that used to be a verbose markdown
 *  handoff prompt) plus a target orchestra list, and the encoder returns a
 *  fully-formed VibrationalSignature ready for broadcast.
 *
 *  The encoder does NOT throw away the original payload. It writes the
 *  full payload into the Vault's Resonance Registry and embeds a Vault
 *  anchor in the signature. This is the architectural guarantee of
 *  zero-loss (Axiom A1) — the compressed packet always carries a pointer
 *  to its full uncompressed source.
 *
 *  References honored here:
 *    - InterLat (Ref. 1)        : the signature IS a latent exchange, not text
 *    - Slipstream v3 / ACCP (2) : the factored-intention model
 *    - G²CP (Ref. 3)            : one global signature, many local harmonics
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import type { VibrationalSignature, ConstraintMatrix, SuccessPredicate } from '../core/protocol.js';
import { SYMPHONY_TARGET_BAND } from '../core/protocol.js';
/**
 * The input a God provides when composing a signature. The `payload` is the
 * only mandatory field — everything else can be inferred or defaulted.
 */
export interface SignatureCompositionInput {
    /** The God's ID (e.g., 'apollo', 'athena'). */
    composer: string;
    /**
     * The original free-text payload — what the God would have sent as a
     * verbose markdown prompt in the legacy textual system. This is preserved
     * in full in the Vault's Resonance Registry (zero-loss).
     */
    payload: string;
    /** Demigod IDs that should resonate with this signature. */
    targetOrchestra: string[];
    /** Optional: override the broadcast mode (parallel is the Symphony default). */
    broadcastMode?: 'parallel' | 'serial';
    /** Optional: parent signature ID, if this delegation descends from another. */
    parentSignature?: string;
    /** Optional: time-to-live for the signature, in ms. Default 5 minutes. */
    ttl?: number;
    /** Optional: pre-resolved stack/scope hints (skip auto-detection). */
    stackHints?: string[];
    /** Optional: explicit constraints (skip auto-extraction). */
    constraints?: ConstraintMatrix;
    /** Optional: explicit success predicates (skip auto-extraction). */
    successPredicates?: SuccessPredicate[];
}
/**
 * Compose a VibrationalSignature from a free-text payload.
 *
 *  Steps:
 *    1. Quantize the payload into an IntentVector (semantic-quantizer).
 *    2. Extract the ConstraintMatrix (if not provided).
 *    3. Extract SuccessPredicates (if not provided).
 *    4. Register the FULL payload in the Vault's Resonance Registry —
 *       this is the lossless proof. The registry returns an entry ID.
 *    5. Build a VaultAnchor pointing to the registry entry.
 *    6. Measure the coherence baseline (how well the symbolic form
 *       reconstructs to the original payload). This is the drift detector.
 *    7. Assemble the VibrationalSignature.
 *
 *  Throws if the registry write fails (Axiom A5 — untracked vibrations
 *  are forbidden).
 */
export declare function composeSignature(input: SignatureCompositionInput): VibrationalSignature;
/**
 * Serialize a signature to a compact JSON string for transport.
 *  ~500-800 bytes typical (vs. 4-8KB for a markdown handoff prompt).
 */
export declare function serializeSignature(sig: VibrationalSignature): string;
/**
 * Deserialize a signature from a transport string.
 *  Validates the protocol version and the anchor checksum.
 */
export declare function deserializeSignature(raw: string): VibrationalSignature;
/**
 * Estimate the token economy of a signature broadcast, BEFORE the demigods
 * have responded. The estimate is computed against the 5-reference model:
 *
 *  baselineTokens  : estimated cost of the legacy textual path
 *                    (= payload length in tokens * targetOrchestra.length)
 *  signatureTokens : estimated cost of broadcasting the signature
 *                    (= serializeSignature length in tokens, divided by
 *                     ACCP compression ratio applied once)
 *  projectedReduction : 1 - (signatureTokens / baselineTokens), clamped
 *                       to the SYMPHONY_TARGET_BAND for honesty
 *
 *  The actual numbers come in once the Consensus is built — see
 *  conductor.ts and the TokenEconomyReport type.
 */
export interface SignatureEconomyEstimate {
    baselineTokens: number;
    signatureTokens: number;
    projectedReduction: number;
    targetBand: typeof SYMPHONY_TARGET_BAND;
}
export declare function estimateSignatureEconomy(sig: VibrationalSignature, payloadLength: number): SignatureEconomyEstimate;
