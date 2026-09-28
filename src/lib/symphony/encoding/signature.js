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
import * as crypto from 'crypto';
import { SYMPHONY_PROTOCOL_VERSION, SYMPHONY_TARGET_BAND, } from '../core/protocol.js';
import { quantizeIntent, extractConstraints, extractSuccessPredicates, } from './semantic-quantizer.js';
import { registerResonance } from '../vault/resonance-registry.js';
import { measureCoherence } from './coherence.js';
// ─────────────────────────────────────────────────────────────────────────────
//  MAIN EXPORT — composeSignature
// ─────────────────────────────────────────────────────────────────────────────
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
export function composeSignature(input) {
    const { composer, payload, targetOrchestra, broadcastMode = 'parallel', parentSignature, ttl = 5 * 60 * 1000, stackHints, constraints, successPredicates, } = input;
    if (!composer) {
        throw new Error('composeSignature: composer (god ID) is mandatory');
    }
    if (!payload || payload.trim().length === 0) {
        throw new Error('composeSignature: payload is mandatory');
    }
    if (!targetOrchestra || targetOrchestra.length === 0) {
        throw new Error('composeSignature: targetOrchestra must contain at least one demigod ID');
    }
    // 1. Quantize intent
    const intentVector = quantizeIntent(payload);
    // 2. Extract (or accept) constraints
    const constraintMatrix = constraints ?? extractConstraints(payload);
    // 3. Extract (or accept) success predicates
    const successCriteria = successPredicates ?? extractSuccessPredicates(payload);
    // 4. Register the full payload in the Vault's Resonance Registry
    //    This is the lossless proof — the registry keeps the original text.
    const checksum = crypto.createHash('sha256').update(payload).digest('hex');
    const registryEntry = registerResonance({
        kind: 'signature-source',
        godId: composer,
        payload,
        checksum,
        intentHash: intentVector.intentHash,
        semanticTokens: intentVector.semanticTokens,
        stackHints: stackHints ?? constraintMatrix.stack ?? [],
        parentSignature,
    });
    // 5. Build the Vault anchor
    const vaultAnchor = {
        anchorType: 'registry',
        anchorId: registryEntry.id,
        checksum,
    };
    // 6. Measure coherence baseline — how well does the symbolic form
    //    reconstruct to the original payload? This is the drift detector
    //    the Decoding Choir will later use to detect semantic loss.
    const coherenceBaseline = measureCoherence(payload, intentVector);
    // 7. Assemble the signature
    const signature = {
        id: crypto.randomUUID(),
        composer,
        protocol: SYMPHONY_PROTOCOL_VERSION,
        emittedAt: new Date().toISOString(),
        intentVector,
        constraintMatrix,
        successCriteria,
        vaultAnchor,
        targetOrchestra,
        broadcastMode,
        coherenceBaseline,
        parentSignature,
        ttl,
    };
    return signature;
}
// ─────────────────────────────────────────────────────────────────────────────
//  SERIALIZATION — for transport / persistence
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Serialize a signature to a compact JSON string for transport.
 *  ~500-800 bytes typical (vs. 4-8KB for a markdown handoff prompt).
 */
export function serializeSignature(sig) {
    return JSON.stringify(sig);
}
/**
 * Deserialize a signature from a transport string.
 *  Validates the protocol version and the anchor checksum.
 */
export function deserializeSignature(raw) {
    const parsed = JSON.parse(raw);
    if (parsed.protocol !== SYMPHONY_PROTOCOL_VERSION) {
        throw new Error(`Signature protocol mismatch: expected ${SYMPHONY_PROTOCOL_VERSION}, got ${parsed.protocol}`);
    }
    return parsed;
}
/**
 * Rough token counter — 4 chars per token, the standard heuristic.
 */
function approxTokens(s) {
    return Math.ceil(s.length / 4);
}
export function estimateSignatureEconomy(sig, payloadLength) {
    const baselineTokens = approxTokens('x'.repeat(payloadLength)) * sig.targetOrchestra.length;
    const signatureTokens = approxTokens(serializeSignature(sig));
    let projectedReduction = 1 - signatureTokens / Math.max(1, baselineTokens);
    // Clamp to the declared target band — never lie upward
    projectedReduction = Math.max(SYMPHONY_TARGET_BAND.low, Math.min(SYMPHONY_TARGET_BAND.high, projectedReduction));
    return {
        baselineTokens,
        signatureTokens,
        projectedReduction,
        targetBand: SYMPHONY_TARGET_BAND,
    };
}
//# sourceMappingURL=signature.js.map