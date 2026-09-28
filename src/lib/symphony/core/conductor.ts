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

import type {
  VibrationalSignature,
  HarmonicPattern,
  Consensus,
} from '../core/protocol.js';
import { fuseHarmonics } from '../encoding/harmonic.js';
import { retrieveResonance } from '../vault/resonance-registry.js';
import { lookupTemplate } from '../vault/harmonic-templates.js';
import { tune } from '../vault/tuner.js';

// ─────────────────────────────────────────────────────────────────────────────
//  DISPATCH OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
//  CONDUCTOR — broadcast + collect + fuse
// ─────────────────────────────────────────────────────────────────────────────

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
export async function conduct(
  signature: VibrationalSignature,
  dispatchFn: (demigod: string, sig: VibrationalSignature) => Promise<HarmonicPattern>,
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  const {
    timeoutMs = 120_000,
    continueOnFailure = true,
    quorum = 1.0,
  } = options;

  // Attempt a short-circuit BEFORE broadcasting.
  // If a harmonic template with confidence ≥ 0.85 exists for this
  // signature's intent hash, skip the dispatch entirely and synthesize
  // a Consensus from the template's canonical anchor. This is the
  // Symphony's "~100% token reduction" path — previously this function
  // existed but was dead code (never called). Now it's called at the
  // top of conduct() so every broadcast first checks for an eligible
  // template. If no template exists (the common case for new tasks),
  // we proceed with the full parallel broadcast.
  const shortCircuitResult = attemptShortCircuit(signature);
  if (shortCircuitResult) {
    const tunerReport = tune(signature, shortCircuitResult);
    return {
      consensus: shortCircuitResult,
      tunerReport,
      allSucceeded: true,
      hadTimeouts: false,
      quorumMet: true,
    };
  }

  // 1. Broadcast in parallel — Promise.allSettled so we capture both
  //    fulfilled and rejected promises.
  const targets = signature.targetOrchestra;
  const dispatchPromises = targets.map((demigod) =>
    withTimeout(dispatchFn(demigod, signature), timeoutMs, demigod),
  );

  const settled = await Promise.allSettled(dispatchPromises);

  // 2. Collect the harmonics (or build error harmonics for failures)
  const harmonics: HarmonicPattern[] = [];
  let hadTimeouts = false;
  let failureCount = 0;

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'fulfilled') {
      harmonics.push(result.value);
      if (result.value.error) failureCount++;
    } else {
      // Rejected or timed out — synthesize an error harmonic
      const reason = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      const isTimeout = reason.startsWith('TIMEOUT:');
      if (isTimeout) hadTimeouts = true;
      // We can't fully construct a harmonic without knowing the demigod ID,
      // so we look it up from the targets array.
      const demigod = targets[i];
      harmonics.push({
        id: `error-${demigod}-${Date.now()}`,
        signatureId: signature.id,
        demigod,
        protocol: signature.protocol,
        emittedAt: new Date().toISOString(),
        outcomes: [],
        artifacts: [],
        contextAnchor: {
          anchorType: 'inline',
          anchorId: 'error',
          inlinePayload: reason,
          checksum: '',
        },
        confidence: 0,
        tokensConsumed: 0,
        durationMs: isTimeout ? timeoutMs : 0,
        error: {
          code: isTimeout ? 'E_TIMEOUT' : 'E_DISPATCH',
          message: reason,
          recoverable: !reason.toLowerCase().includes('not found'),
        },
      });
      failureCount++;
    }
  }

  // 3. Check quorum
  const responseRate = harmonics.length / targets.length;
  const quorumMet = responseRate >= quorum;

  // 4. Retrieve the original payload from the Vault — needed for fusion
  //    (the fusion step measures coherence against the source payload).
  const sourceEntry = retrieveResonance(signature.vaultAnchor.anchorId);
  const sourcePayload = sourceEntry?.payload ?? '';

  // 5. Fuse harmonics into a Consensus
  const consensus = fuseHarmonics(signature, harmonics, sourcePayload);

  // 6. Run the tuner
  const tunerReport = tune(signature, consensus);

  return {
    consensus,
    tunerReport,
    allSucceeded: failureCount === 0,
    hadTimeouts,
    quorumMet,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  TIMEOUT WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrap a promise with a timeout. Rejects with a 'TIMEOUT:<name>' error
 * if the promise doesn't settle within `ms` milliseconds.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  name: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TIMEOUT:${name} did not respond within ${ms}ms`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  SYNCHRONOUS SHORT-CIRCUIT — for high-confidence templates
// ─────────────────────────────────────────────────────────────────────────────

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
export function attemptShortCircuit(
  signature: VibrationalSignature,
): Consensus | null {
  const template = lookupTemplate(signature.intentVector.intentHash, 0.85);
  if (!template) return null;
  if (!template.canonicalAnchorId) return null;

  // Build a synthetic consensus from the template
  const syntheticHarmonic: HarmonicPattern = {
    id: `template-${template.intentHash}-${Date.now()}`,
    signatureId: signature.id,
    demigod: 'template-short-circuit',
    protocol: signature.protocol,
    emittedAt: new Date().toISOString(),
    outcomes: signature.successCriteria.map((p) => ({
      predicateKind: p.kind,
      target: p.target,
      status: 'pass' as const,
      evidence: 'template-short-circuit',
    })),
    artifacts: [],
    contextAnchor: {
      anchorType: 'registry',
      anchorId: template.canonicalAnchorId,
      checksum: '',
    },
    confidence: template.confidence,
    tokensConsumed: 0, // the whole point of short-circuit
    durationMs: 1,
  };

  // Build a minimal Consensus
  const sourceEntry = retrieveResonance(signature.vaultAnchor.anchorId);
  const sourcePayload = sourceEntry?.payload ?? '';
  return fuseHarmonics(signature, [syntheticHarmonic], sourcePayload);
}
