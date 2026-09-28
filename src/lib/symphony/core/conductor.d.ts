/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE CONDUCTOR — Parallel Broadcast Coordinator
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Conductor is the baton of the Symphony. It receives a Signature
 *  from a Composer (God) and broadcasts it to the Orchestra (Demigods)
 *  in parallel — like a conductor's downbeat reaching every section of
 *  the orchestra simultaneously.
 *
 *  In the legacy textual system, a God dispatched to sub-agents serially:
 *    Apollo → Hephaestus → (wait) → Hephaestus returns → Athena → (wait) → ...
 *  Each step paid a full LLM round-trip cost.
 *
 *  In the Symphony, the Conductor broadcasts the signature to ALL target
 *  demigods at once. Demigods process in parallel. The Conductor collects
 *  harmonics and fuses them into a Consensus.
 *
 *  This is the architectural realization of:
 *    - G²CP "global-to-local" topology (Ref. 3)
 *    - "Massive Parallelization & Token Economy" (vision principle 3)
 *
 *  In production, the actual parallel dispatch is performed by OpenCode's
 *  subtask mechanism. The Conductor here is the protocol-level coordinator
 *  that wraps the dispatch + collection + fusion steps into a single
 *  typed operation.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import type { VibrationalSignature, HarmonicPattern, Consensus } from '../core/protocol.js';
import { tune } from '../vault/tuner.js';
export interface DispatchOptions {
    /**
     * Maximum wall-clock time to wait for all harmonics, in ms.
     *  Default 120_000 (2 minutes). Demigods that don't respond in time
     *  are recorded as timed-out harmonics.
     */
    timeoutMs?: number;
    /**
     * Whether to proceed even if some demigods fail. Default true.
     *  If false, the first failure aborts the cycle and produces a
     *  partial Consensus tagged with `error: 'aborted-on-failure'`.
     */
    continueOnFailure?: boolean;
    /**
     * The minimum fraction of targetOrchestra that must respond for the
     *  cycle to be considered complete. Default 1.0 (all must respond).
     *  Below this fraction, the Consensus is tagged `error: 'quorum-not-met'`.
     */
    quorum?: number;
}
export interface DispatchResult {
    consensus: Consensus;
    tunerReport: ReturnType<typeof tune>;
    /** True if every target demigod produced a non-error harmonic. */
    allSucceeded: boolean;
    /** True if any demigod timed out. */
    hadTimeouts: boolean;
    /** True if quorum was not met. */
    quorumMet: boolean;
}
/**
 * Broadcast a signature to the target orchestra, collect harmonics, and
 * fuse them into a Consensus.
 *
 *  In the production OLYMPUS, the `dispatchFn` parameter is a callback
 *  that performs the actual sub-agent invocation (via OpenCode subtask
 *  or olympus-dispatch tool). The Conductor itself is protocol-level
 *  and does not call OpenCode directly — it stays decoupled and testable.
 *
 *  signature   : the VibrationalSignature to broadcast
 *  dispatchFn  : a function that takes a demigod ID + the signature and
 *                returns a Promise<HarmonicPattern>. The Conductor calls
 *                it once per target demigod, in parallel.
 *  options     : see DispatchOptions
 */
export declare function conduct(signature: VibrationalSignature, dispatchFn: (demigod: string, sig: VibrationalSignature) => Promise<HarmonicPattern>, options?: DispatchOptions): Promise<DispatchResult>;
/**
 * If a harmonic template with confidence ≥ 0.85 exists for this signature's
 * intent hash, the Conductor can short-circuit: skip the dispatch entirely
 * and synthesize a Consensus from the template's canonical anchor.
 *
 *  This is the Symphony's "instinct short-circuit" — equivalent to OLYMPUS's
 *  existing instinct-gated dispatch flow, but operating at the vibrational
 *  level. The signature's token cost drops to ~0 because no demigod is
 *  actually invoked.
 *
 *  Returns null if no eligible template exists.
 */
export declare function attemptShortCircuit(signature: VibrationalSignature): Consensus | null;
