/**
 * ════════════════════════════════════════════════════════════════════════════
 *  HARMONIC ENCODER — The Orchestra's Voice
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  A Demigod (sub-agent) constructs a HarmonicPattern to return its work
 *  to the Conductor. The Demigod does NOT emit user-facing text — it emits
 *  a structured packet of outcomes, artifacts, and a context anchor.
 *
 *  This module provides:
 *
 *    - harmonicFromResult  : build a harmonic from a sub-agent's structured
 *                            result (file paths, exit codes, diffs, ...)
 *    - harmonicFromError   : build a harmonic from a failure
 *    - fuseHarmonics       : the Conductor's fusion step — merge multiple
 *                            harmonics into a Consensus
 *    - measureHarmonicCoherence : how well a harmonic answers its signature
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import * as crypto from 'crypto';
import { SYMPHONY_PROTOCOL_VERSION, REFERENCE_GAINS, SYMPHONY_TARGET_BAND, } from '../core/protocol.js';
import { measureConsensusCoherence } from './coherence.js';
import { registerResonance } from '../vault/resonance-registry.js';
// ─────────────────────────────────────────────────────────────────────────────
//  HARMONIC BUILDERS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Build a HarmonicPattern from a successful sub-agent result.
 *
 *  signatureId      : the signature this harmonic answers
 *  demigod          : the sub-agent ID (e.g., 'build-resolver')
 *  outcomes         : machine-checkable outcomes (pass/fail per predicate)
 *  artifacts        : file paths, diffs, command outputs, MCP resources
 *  contextRead      : a short string describing what the demigod read
 *                     (e.g., "src/auth/jwt.ts, src/middleware/auth.ts")
 *  tokensConsumed   : LLM tokens spent by the demigod
 *  durationMs       : wall-clock time
 *  confidence       : self-assessed [0,1]
 */
export function harmonicFromResult(input) {
    const checksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(input.outcomes) + JSON.stringify(input.artifacts))
        .digest('hex');
    // Register what the demigod read in the Vault's Resonance Registry.
    // This is the demigod's "I-read-this" trail — the lossless proof that
    // no context was lost in the round-trip.
    const registryEntry = registerResonance({
        kind: 'harmonic-context',
        godId: input.demigod,
        payload: input.contextRead,
        checksum,
        intentHash: input.signatureId,
        semanticTokens: [],
        stackHints: [],
        parentSignature: input.signatureId,
    });
    const contextAnchor = {
        anchorType: 'registry',
        anchorId: registryEntry.id,
        checksum,
    };
    return {
        id: crypto.randomUUID(),
        signatureId: input.signatureId,
        demigod: input.demigod,
        protocol: SYMPHONY_PROTOCOL_VERSION,
        emittedAt: new Date().toISOString(),
        outcomes: input.outcomes,
        artifacts: input.artifacts,
        contextAnchor,
        confidence: input.confidence,
        tokensConsumed: input.tokensConsumed,
        durationMs: input.durationMs,
    };
}
/**
 * Build a HarmonicPattern from a failure.
 *
 *  The error is structured — never a free-text blob. The Conductor uses
 *  the `error.code` to decide whether to retry, escalate, or fall back.
 */
export function harmonicFromError(input) {
    return {
        id: crypto.randomUUID(),
        signatureId: input.signatureId,
        demigod: input.demigod,
        protocol: SYMPHONY_PROTOCOL_VERSION,
        emittedAt: new Date().toISOString(),
        outcomes: [],
        artifacts: [],
        contextAnchor: {
            anchorType: 'inline',
            anchorId: 'error',
            inlinePayload: input.error.message,
            checksum: crypto
                .createHash('sha256')
                .update(input.error.message)
                .digest('hex'),
        },
        confidence: 0,
        tokensConsumed: input.tokensConsumed,
        durationMs: input.durationMs,
        error: input.error,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
//  CONDUCTOR'S FUSION — merge harmonics into a Consensus
// ─────────────────────────────────────────────────────────────────────────────
/**
 * The Conductor fuses multiple HarmonicPatterns (collected from parallel
 * demigods) into a single Consensus.
 *
 *  Fusion rules:
 *    - Outcomes are merged by predicate key. If demigods report the same
 *      predicate, the worst status wins (fail > indeterminate > pass).
 *    - Artifacts are concatenated and deduplicated by location.
 *    - Dominant intent is taken from the signature (the Conductor doesn't
 *      second-guess the Composer).
 *    - Coherence is measured by the Choir's coherence meter — comparing
 *      the source signature's intent vector to the fused outcome tokens.
 *    - Token economy is the post-cycle accounting (see TokenEconomyReport).
 */
export function fuseHarmonics(signature, harmonics, sourcePayload) {
    // 1. Merge outcomes — worst status wins per predicate key
    const outcomeMap = new Map();
    for (const h of harmonics) {
        for (const o of h.outcomes) {
            const key = `${o.predicateKind}|${o.target}`;
            const existing = outcomeMap.get(key);
            if (!existing) {
                outcomeMap.set(key, o);
            }
            else {
                const worst = worstStatus(existing.status, o.status);
                outcomeMap.set(key, { ...existing, status: worst });
            }
        }
    }
    const fusedOutcomes = Array.from(outcomeMap.values());
    // 2. Merge artifacts — dedup by location
    const artifactMap = new Map();
    for (const h of harmonics) {
        for (const a of h.artifacts) {
            if (!artifactMap.has(a.location))
                artifactMap.set(a.location, a);
        }
    }
    // 3. Dominant intent is the signature's intent
    const dominantIntent = signature.intentVector.intentType;
    // 4. Build the fused intent tokens — union of all harmonic artifact summaries
    //    This is the Choir's input for coherence measurement.
    const fusedIntentTokens = Array.from(artifactMap.values()).flatMap((a) => a.summary.split(/\s+/).filter(Boolean));
    // 5. Measure coherence
    const coherence = measureConsensusCoherence(sourcePayload, signature.intentVector, fusedIntentTokens);
    // 6. Build the token economy report
    const tokenEconomy = buildTokenEconomyReport(signature, harmonics);
    return {
        signatureId: signature.id,
        harmonics,
        fusedOutcomes,
        dominantIntent,
        coherence,
        tokenEconomy,
        fusedAt: new Date().toISOString(),
    };
}
// ─────────────────────────────────────────────────────────────────────────────
//  TOKEN ECONOMY ACCOUNTING
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Build a TokenEconomyReport for the cycle.
 *
 *  baselineTokens  : the projected cost of the legacy textual path
 *                    (= approxTokens(payload) * targetOrchestra.length)
 *  signatureTokens : the cost of encoding the signature (~tiny)
 *  harmonicTokens  : sum of all demigods' tokensConsumed
 *  choirTokens     : estimated cost of the Decoding Choir (small fixed budget)
 *  actualTokens    : signature + harmonic + choir
 *  actualReduction : 1 - (actual / baseline)
 */
function buildTokenEconomyReport(signature, harmonics) {
    // Reconstruct a baseline payload size from the anchor checksum
    // (the registry stored the original payload — we approximate its size here)
    // In production this would query the registry. For economy accounting we
    // use a conservative estimate based on intent complexity.
    const estimatedPayloadTokens = Math.ceil(signature.intentVector.semanticTokens.length * 30 +
        (signature.constraintMatrix.mustSatisfy?.join(' ').length ?? 0) / 4);
    const baselineTokens = estimatedPayloadTokens * signature.targetOrchestra.length;
    // Signature tokens — JSON-serialized signature, ~4 chars/token
    const signatureTokens = Math.ceil(JSON.stringify(signature).length / 4);
    // Harmonic tokens — sum of demigods' reported consumption
    const harmonicTokens = harmonics.reduce((sum, h) => sum + h.tokensConsumed, 0);
    // Choir tokens — small fixed budget for the decoding pass
    const choirTokens = 300;
    const actualTokens = signatureTokens + harmonicTokens + choirTokens;
    const actualReduction = 1 - actualTokens / Math.max(1, baselineTokens);
    return {
        baselineTokens,
        signatureTokens,
        harmonicTokens,
        choirTokens,
        actualTokens,
        actualReduction,
        targetBand: SYMPHONY_TARGET_BAND,
        referenceGains: {
            accp: REFERENCE_GAINS.ACCP_TOKEN_REDUCTION,
            g2cp: REFERENCE_GAINS.G2CP_TOKEN_REDUCTION,
            kvCache: (REFERENCE_GAINS.KVCACHE_REUSE_BAND.low +
                REFERENCE_GAINS.KVCACHE_REUSE_BAND.high) /
                2,
            coordination: (REFERENCE_GAINS.COORDINATION_OVERHEAD_BAND.low +
                REFERENCE_GAINS.COORDINATION_OVERHEAD_BAND.high) /
                2,
        },
    };
}
// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function worstStatus(a, b) {
    if (a === 'fail' || b === 'fail')
        return 'fail';
    if (a === 'indeterminate' || b === 'indeterminate')
        return 'indeterminate';
    return 'pass';
}
/**
 * Check whether all of a signature's success predicates are satisfied
 * by a Consensus's fused outcomes. Returns a list of unsatisfied predicates
 * (empty = all satisfied).
 */
export function unsatisfiedPredicates(signature, consensus) {
    const outcomeMap = new Map(consensus.fusedOutcomes.map((o) => [`${o.predicateKind}|${o.target}`, o]));
    return signature.successCriteria.filter((p) => {
        const key = `${p.kind}|${p.target}`;
        const outcome = outcomeMap.get(key);
        return !outcome || outcome.status !== 'pass';
    });
}
//# sourceMappingURL=harmonic.js.map