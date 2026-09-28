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
import type { IntentVector } from '../core/protocol.js';
/**
 * Measure how coherently an IntentVector represents a payload.
 *  Returns a number in [0,1].
 */
export declare function measureCoherence(payload: string, intent: IntentVector): number;
/**
 * Measure coherence of a full Consensus vs. its source signature.
 *  Used by the Choir to decide Symphony vs. fallback.
 */
export declare function measureConsensusCoherence(sourcePayload: string, sourceIntent: IntentVector, fusedIntentTokens: string[]): number;
export type ChoirMode = 'symphony' | 'augmented' | 'fallback';
/**
 * Decide which mode the Decoding Choir should operate in, given the
 * measured coherence. This is the single decision point that governs
 * Axiom A4 (mandatory fallback).
 */
export declare function decideChoirMode(coherence: number): ChoirMode;
