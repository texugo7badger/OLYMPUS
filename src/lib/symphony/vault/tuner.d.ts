/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE TUNER — The Vault's Continuous Learning Loop
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Tuner is the active intelligence of the Master Score. It runs after
 *  every Consensus cycle and performs three things:
 *
 *    1. Outcome attribution — tags the signature-source registry entry
 *       with the cycle's outcome (success / failure / partial / fallback).
 *    2. Template promotion — if the cycle was a success, the signature's
 *       intent hash is promoted (or reinforced) in the harmonic templates
 *       file. Future signatures with the same intent can short-circuit.
 *    3. Template demotion — if the cycle was a failure, the intent hash's
 *       template is demoted. If confidence drops below 0.40, the template
 *       is unlearned entirely.
 *
 *  The tuner is invoked by the Conductor after fuseHarmonics() returns.
 *  It is also invoked by the Decoding Choir when a fallback event is
 *  recorded — so the system learns from its own safety trips.
 *
 *  This is the Symphony's "evolving internal pattern language" — the
 *  architectural realization of the vision's "the Vault evolves its
 *  internal pattern language with each interaction."
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import type { VibrationalSignature, Consensus } from '../core/protocol.js';
export interface TunerReport {
    /** The outcome the tuner attributed to the cycle. */
    outcome: 'success' | 'failure' | 'partial' | 'fallback';
    /** The intent hash that was promoted / demoted. */
    intentHash: string;
    /** The new confidence of the template (if it exists). */
    templateConfidence?: number;
    /** Whether a new template was created this cycle. */
    newTemplateCreated: boolean;
    /** Whether a template was unlearned this cycle. */
    templateUnlearned: boolean;
    /** ISO timestamp. */
    tunedAt: string;
}
/**
 * Run the tuner after a Consensus cycle.
 *
 *  signature : the original signature that was broadcast
 *  consensus : the fused result from the Conductor
 *  userAcknowledgedSuccess : optional — true if the user explicitly
 *                            confirmed the output was good (the strongest
 *                            signal). If undefined, the tuner infers
 *                            success from the consensus outcomes.
 */
export declare function tune(signature: VibrationalSignature, consensus: Consensus, userAcknowledgedSuccess?: boolean): TunerReport;
/**
 * Record a fallback event — when the Decoding Choir had to fall back to
 * textual mode. This is a learning signal: the system learns which
 * signatures tend to produce low-coherence consensus, and can avoid
 * the same compression strategy in the future.
 */
export declare function recordFallback(signature: VibrationalSignature, reason: string): void;
