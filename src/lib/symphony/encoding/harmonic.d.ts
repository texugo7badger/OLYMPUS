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
import type { HarmonicPattern, HarmonicOutcome, ArtifactPointer, VibrationalSignature, Consensus, SuccessPredicate } from '../core/protocol.js';
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
export declare function harmonicFromResult(input: {
    signatureId: string;
    demigod: string;
    outcomes: HarmonicOutcome[];
    artifacts: ArtifactPointer[];
    contextRead: string;
    tokensConsumed: number;
    durationMs: number;
    confidence: number;
}): HarmonicPattern;
/**
 * Build a HarmonicPattern from a failure.
 *
 *  The error is structured — never a free-text blob. The Conductor uses
 *  the `error.code` to decide whether to retry, escalate, or fall back.
 */
export declare function harmonicFromError(input: {
    signatureId: string;
    demigod: string;
    error: {
        code: string;
        message: string;
        recoverable: boolean;
    };
    tokensConsumed: number;
    durationMs: number;
}): HarmonicPattern;
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
export declare function fuseHarmonics(signature: VibrationalSignature, harmonics: HarmonicPattern[], sourcePayload: string): Consensus;
/**
 * Check whether all of a signature's success predicates are satisfied
 * by a Consensus's fused outcomes. Returns a list of unsatisfied predicates
 * (empty = all satisfied).
 */
export declare function unsatisfiedPredicates(signature: VibrationalSignature, consensus: Consensus): SuccessPredicate[];
