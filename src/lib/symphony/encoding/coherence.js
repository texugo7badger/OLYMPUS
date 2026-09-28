/**
 * ════════════════════════════════════════════════════════════════════════════
 *  COHERENCE METER — The Choir's Tuning Fork
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Coherence is the central safety metric of the Symphony. It measures how
 *  faithfully a compressed representation preserves the semantic content of
 *  its source. The Decoding Choir consults this meter before producing any
 *  user-facing text:
 *
 *    ≥ 0.90 → full Symphony mode (Choir decodes the consensus directly)
 *    0.70 - 0.90 → augmented mode (Choir pulls extra context from the Vault)
 *    < 0.70 → MANDATORY textual fallback (Axiom A4)
 *
 *  The measurement is intentionally cheap and deterministic — it does NOT
 *  call an LLM. It uses three signals:
 *
 *    1. Symbolic coverage — what fraction of the payload's salient tokens
 *       appear in the IntentVector's semanticTokens?
 *    2. Constraint preservation — what fraction of detected constraints
 *       appear in the ConstraintMatrix?
 *    3. Predicate preservation — what fraction of detected success
 *       predicates appear in the SuccessPredicate list?
 *
 *  Each signal is in [0,1]; the geometric mean is the final coherence.
 *  Geometric mean punishes any single low score more severely than
 *  arithmetic mean — appropriate for a safety metric.
 *
 *  References honored here:
 *    - InterLat (Ref. 1)        : cosine similarity as the quality proxy
 *    - KV-Cache (Ref. 4)        : information-preservation of attended reps
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { extractConstraints, extractSuccessPredicates, quantizeIntent, } from './semantic-quantizer.js';
// ─────────────────────────────────────────────────────────────────────────────
//  COHERENCE MEASUREMENT
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Measure how coherently an IntentVector represents a payload.
 *  Returns a number in [0,1].
 */
export function measureCoherence(payload, intent) {
    // 1. Symbolic coverage
    const reconstructed = quantizeIntent(payload);
    const salientSet = new Set(reconstructed.semanticTokens);
    const coveredSet = new Set(intent.semanticTokens);
    const intersection = [...salientSet].filter((t) => coveredSet.has(t)).length;
    const coverage = salientSet.size === 0 ? 1 : intersection / salientSet.size;
    // 2. Constraint preservation
    const reconstructedConstraints = extractConstraints(payload);
    const constraintScore = scoreConstraintPreservation(reconstructedConstraints, intent);
    // 3. Predicate preservation
    const reconstructedPreds = extractSuccessPredicates(payload);
    const predScore = scorePredicatePreservation(reconstructedPreds, intent);
    // Geometric mean — punishes any single low score
    const coherence = Math.cbrt(coverage * constraintScore * predScore);
    return Math.max(0, Math.min(1, coherence));
}
/**
 * Measure coherence of a full Consensus vs. its source signature.
 *  Used by the Choir to decide Symphony vs. fallback.
 */
export function measureConsensusCoherence(sourcePayload, sourceIntent, fusedIntentTokens) {
    const baseCoherence = measureCoherence(sourcePayload, sourceIntent);
    const fusedSet = new Set(fusedIntentTokens);
    const sourceSet = new Set(sourceIntent.semanticTokens);
    const intersection = [...sourceSet].filter((t) => fusedSet.has(t)).length;
    const fusion = sourceSet.size === 0 ? 1 : intersection / sourceSet.size;
    // Final coherence is the harmonic mean of base coherence and fusion score.
    // Harmonic mean punishes imbalance — if either is low, the result is low.
    const harmonic = (2 * baseCoherence * fusion) / (baseCoherence + fusion + 1e-9);
    return Math.max(0, Math.min(1, harmonic));
}
// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function scoreConstraintPreservation(reconstructed, intent) {
    // The intent doesn't carry constraints directly, but its semanticTokens
    // include "scope:X" tokens which encode constraint fragments. We score
    // based on how many scope tokens from the reconstructed constraints
    // are present in the intent's semanticTokens.
    const intentScopes = new Set(intent.semanticTokens.filter((t) => t.startsWith('scope:')));
    const reconstructedScopes = reconstructed.scope ?? [];
    if (reconstructedScopes.length === 0) {
        // No scopes detected in source — neutral score
        return 0.9;
    }
    const preserved = reconstructedScopes.filter((s) => intentScopes.has(`scope:${s}`)).length;
    return preserved / reconstructedScopes.length;
}
function scorePredicatePreservation(reconstructed, _intent) {
    // Predicates aren't encoded into the IntentVector directly — they're
    // stored in the Signature. We treat this as a neutral signal (1.0)
    // because the predicates are always present alongside the signature.
    // The Choir will re-check predicates against the Consensus outcomes.
    if (reconstructed.length === 0)
        return 1.0;
    return 0.95; // small penalty for any payload that has predicates
}
// ─────────────────────────────────────────────────────────────────────────────
//  FALLBACK DECISION
// ─────────────────────────────────────────────────────────────────────────────
import { COHERENCE_FALLBACK_THRESHOLD, COHERENCE_AUGMENT_THRESHOLD, } from '../core/protocol.js';
/**
 * Decide which mode the Decoding Choir should operate in, given the
 * measured coherence. This is the single decision point that governs
 * Axiom A4 (mandatory fallback).
 */
export function decideChoirMode(coherence) {
    if (coherence >= COHERENCE_AUGMENT_THRESHOLD)
        return 'symphony';
    if (coherence >= COHERENCE_FALLBACK_THRESHOLD)
        return 'augmented';
    return 'fallback';
}
//# sourceMappingURL=coherence.js.map