/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/**
 * dev-server-claim — #105 (MADRUGA-SERVE-1 Batch B): the probe-verified-claim
 * doctrine, as a pure shapeable gate. The #105 specimen: Apollo narrated
 * "the dev server is running" from 31s of captured bash output (the banner +
 * "Ready" + "Compiled") while the process was already dead — a claim about
 * LIVE STATE derived from corpse text.
 *
 * The law (one sentence, one source): a live-state claim carries PROBE
 * EVIDENCE or it is not made.
 *   - probe green   → the claim carries host/port/latency (the probe's own numbers)
 *   - probe silent  → the honest down sentence — NEVER "running"
 *   - no probe      → the explicit refusal — captured output text is never a
 *                     source of liveness, never quoted as evidence
 *
 * This helper is PURE (type-only dependency on the manager — importable from
 * client components). The probe itself lives in the dev-server manager's
 * status() (probeDevServer under the hood); this file only shapes honest
 * sentences from its result.
 */

import type { DevServerStatus } from './dev-server-manager';

/** The doctrine's exact refusal sentence — one source of truth for every surface. */
export const UNVERIFIED_CLAIM_REFUSAL = 'unverified — no probe evidence';

export interface DevServerClaim {
  /** true ONLY from a green probe; false ONLY from a silent probe; null = no probe ran. */
  running: boolean | null;
  /** true when a probe decided; false when the path tried to narrate without one. */
  verified: boolean;
  /** the sentence the narrator may say — carries the evidence or the refusal. */
  claim: string;
  /** the evidence line (the probe's own numbers) or the explicit refusal. */
  evidence: string;
  /** what was captured, if anything — NEVER a source; noted only as what-was-said. */
  capturedNote: string | null;
}

export interface DevServerClaimInput {
  /** probe-verified status from the manager's status() — the ONLY source of "running". */
  status?: DevServerStatus | null;
  /** captured output text, if any — never a source of liveness. */
  capturedText?: string | null;
}

/**
 * Build the only honest claim the input permits. The precedence is absolute:
 * a status that exists wins; captured text alone never does.
 */
export function buildDevServerClaim(input: DevServerClaimInput): DevServerClaim {
  const capturedNote = input.capturedText
    ? `captured (not verified): ${String(input.capturedText).slice(0, 200)}`
    : null;

  if (input.status && input.status.running === true) {
    const s = input.status;
    return {
      running: true,
      verified: true,
      claim: `dev server running on port ${s.port} (${s.host ?? 'unknown stack'}) — probe-verified`,
      evidence: `probe: port=${s.port} host=${s.host} latency=${s.responseTimeMs}ms pid=${s.pid} (${s.projectPath})`,
      capturedNote,
    };
  }

  if (input.status && input.status.running === false) {
    const s = input.status;
    return {
      running: false,
      verified: true,
      claim: s.note || `dev server down — probe-verified silence on port ${s.port}`,
      evidence: `probe: port=${s.port ?? 'unknown'} silent (state: ${s.state})`,
      capturedNote,
    };
  }

  // No probe: the explicit refusal — the captured text is NEVER quoted as
  // evidence. The refusal is the whole claim; that is the doctrine.
  return {
    running: null,
    verified: false,
    claim: UNVERIFIED_CLAIM_REFUSAL,
    evidence: `refused: captured output text is never a source of liveness (#105) — probe via the dev-server manager status first`,
    capturedNote,
  };
}
