/**
 * verification-sampling-state.ts — v0.0.1 Rebuild
 *
 * Persistent state for the verification sampling hook.
 *
 * The verification sampling rule (from the instinct-lifecycle spec):
 *   "1-in-10 short-circuits are randomly forced to re-deliberate."
 *
 * This module provides:
 *   - shouldForceRedeliberation(dispatchId, instinctId) — deterministic 1-in-10
 *   - markForcedRedeliberation(dispatchId, instinctId, god, originalAgent)
 *   - checkForcedRedeliberation(instinctId) — was this instinct force-re-deliberated?
 *   - clearForcedRedeliberation(instinctId) — clean up after the dispatch completes
 *   - recordRedeliberationOutcome(instinctId, god, pickedDifferentAgent, succeeded)
 *
 * State is persisted to ~/.olympus/verification-sampling-state.json so it
 * survives across agent transitions (the re-deliberation happens in a
 * different agent step than the original short-circuit).
 *
 * Quality constraints:
 *   - All errors caught and logged — never throw (the hook must not break
 *     the tool call it is observing).
 *   - Cross-platform — uses path.join, os.homedir, fs (all cross-platform).
 *   - No emojis.
 *   - Deterministic PRNG (seeded by dispatch ID) — reproducible.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const STATE_DIR = path.join(os.homedir(), ".olympus");
const STATE_FILE = path.join(STATE_DIR, "verification-sampling-state.json");

/**
 * The 1-in-10 ratio. 1 means every 10th dispatch is force-re-deliberated.
 * Tunable — raise to sample more aggressively, lower to sample less.
 */
export const SAMPLE_RATIO = 10;

/**
 * The penalty applied when a verification sample re-deliberation picks a
 * DIFFERENT agent AND that agent SUCCEEDS. Softer than the standard 0.3
 * failure penalty — the original instinct may still be valid; the
 * re-deliberation just found a better fit for this specific case.
 */
export const VERIFICATION_DRIFT_PENALTY = 0.15;

interface ForcedRedeliberationEntry {
  /** When the forced re-deliberation was triggered (ISO timestamp). */
  forced_at: string;
  /** The dispatch ID that triggered it (for correlation). */
  dispatch_id: string;
  /** The god that owns the instinct. */
  god: string;
  /** The agent the instinct originally recommended. */
  original_agent: string;
  /** Whether the re-deliberation has completed. */
  completed: boolean;
  /** Whether the re-deliberation picked a different agent. */
  picked_different_agent?: boolean;
  /** Whether the re-deliberated dispatch succeeded. */
  succeeded?: boolean;
}

interface VerificationState {
  /** Map of instinctId -> ForcedRedeliberationEntry (in-progress). */
  in_progress: Record<string, ForcedRedeliberationEntry>;
  /** Total forced re-deliberations (for stats). */
  total_forced: number;
  /** Total drift penalties applied (for stats). */
  total_drift_penalties: number;
}

function loadState(): VerificationState {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return { in_progress: {}, total_forced: 0, total_drift_penalties: 0 };
    }
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      in_progress: parsed.in_progress ?? {},
      total_forced: parsed.total_forced ?? 0,
      total_drift_penalties: parsed.total_drift_penalties ?? 0,
    };
  } catch {
    return { in_progress: {}, total_forced: 0, total_drift_penalties: 0 };
  }
}

function saveState(state: VerificationState): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // Non-fatal — the state is best-effort
  }
}

/**
 * Deterministic hash of a string to a non-negative integer.
 * Used to seed the 1-in-10 decision so the same dispatch always gets
 * the same verdict (reproducible).
 */
function hashStringToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0; // | 0 keeps it as int32
  }
  return Math.abs(h);
}

/**
 * Should this dispatch be force-re-deliberated?
 *
 * Deterministic: the same dispatch ID always produces the same verdict.
 * This makes verification sampling reproducible (rerunning the same dispatch
 * produces the same re-deliberation decision).
 *
 * @param dispatchId The dispatch ID (from olympus-dispatch tool's callID)
 * @returns true if this dispatch should be force-re-deliberated
 */
export function shouldForceRedeliberation(dispatchId: string): boolean {
  if (!dispatchId) return false;
  const hash = hashStringToInt(dispatchId);
  return (hash % SAMPLE_RATIO) === 0;
}

/**
 * Mark an instinct as force-re-deliberated. Called when the
 * olympus-shortcircuit tool fires AND shouldForceRedeliberation returns true.
 *
 * The god's prompt instructs it to check this state before dispatching —
 * if the instinct is marked, the god skips the short-circuit and
 * deliberates normally.
 *
 * @param dispatchId The dispatch ID
 * @param instinctId The instinct that was short-circuited
 * @param god The god that owns the instinct
 * @param originalAgent The agent the instinct recommended
 */
export function markForcedRedeliberation(
  dispatchId: string,
  instinctId: string,
  god: string,
  originalAgent: string,
): void {
  const state = loadState();
  state.in_progress[instinctId] = {
    forced_at: new Date().toISOString(),
    dispatch_id: dispatchId,
    god,
    original_agent: originalAgent,
    completed: false,
  };
  state.total_forced++;
  saveState(state);
}

/**
 * Check if an instinct is currently force-re-deliberated.
 *
 * Called by the god (via the olympus-shortcircuit tool's verificationSample
 * arg, OR via a direct check before dispatching) to decide whether to
 * skip the short-circuit and deliberate normally.
 *
 * @param instinctId The instinct ID to check
 * @returns The forced re-deliberation entry, or null if not forced
 */
export function checkForcedRedeliberation(instinctId: string): ForcedRedeliberationEntry | null {
  const state = loadState();
  return state.in_progress[instinctId] ?? null;
}

/**
 * Record the outcome of a force-re-deliberated dispatch.
 *
 * Called when the re-deliberated dispatch is finalized (in the
 * tool.execute.before agent-transition block, or in session.idle).
 *
 * If the re-deliberation picked a DIFFERENT agent AND that agent SUCCEEDED,
 * the instinct's confidence is penalized by VERIFICATION_DRIFT_PENALTY (0.15)
 * — a softer penalty than the standard 0.3 failure penalty, because the
 * original instinct may still be valid; the re-deliberation just found a
 * better fit for this specific case.
 *
 * This function does NOT apply the penalty directly — it returns the
 * decision, and the caller (olympus-hooks.ts) applies the penalty via
 * penalizeInstinct(instinctId, god, VERIFICATION_DRIFT_PENALTY).
 *
 * @param instinctId The instinct that was force-re-deliberated
 * @param pickedDifferentAgent Did the re-deliberation pick a different agent?
 * @param succeeded Did the re-deliberated dispatch succeed?
 * @returns { applyDriftPenalty: boolean, god: string | null } — the caller
 *          applies the penalty if applyDriftPenalty is true
 */
export function recordRedeliberationOutcome(
  instinctId: string,
  pickedDifferentAgent: boolean,
  succeeded: boolean,
): { applyDriftPenalty: boolean; god: string | null } {
  const state = loadState();
  const entry = state.in_progress[instinctId];

  if (!entry) {
    return { applyDriftPenalty: false, god: null };
  }

  entry.completed = true;
  entry.picked_different_agent = pickedDifferentAgent;
  entry.succeeded = succeeded;

  const applyDriftPenalty = pickedDifferentAgent && succeeded;

  if (applyDriftPenalty) {
    state.total_drift_penalties++;
  }

  // Clean up the in-progress entry
  delete state.in_progress[instinctId];
  saveState(state);

  return { applyDriftPenalty, god: entry.god };
}

/**
 * Get verification sampling stats (for the brain-stats API + dashboard).
 */
export function getVerificationStats(): {
  total_forced: number;
  total_drift_penalties: number;
  in_progress_count: number;
} {
  const state = loadState();
  return {
    total_forced: state.total_forced,
    total_drift_penalties: state.total_drift_penalties,
    in_progress_count: Object.keys(state.in_progress).length,
  };
}
