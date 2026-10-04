/**
 * Dispatch Tracker — v3.0 VaultBrain (Symphony-native)
 *
 * Tracks open god → demigod dispatches so the `tool.execute.after` hook can
 * emit rich `dispatch_outcome` events with duration + outcome + tokens.
 *
 * Lifecycle:
 *   1. `olympus-dispatch` tool fires → registerOpenDispatch({god, demigod,
 *      instinct_id, short_circuited, skill, mcp, task_signature, stack,
 *      project, start_ts, start_tokens}). The tracker holds this in memory
 *      and persists it to ~/.olympus/dispatch-state.json (for crash recovery).
 *   2. Subsequent tool calls (write/edit/bash/read) by the SAME active agent
 *      are attributed to the open dispatch. Errors (non-zero bash exits,
 *      write failures) flip the dispatch's `outcome` to "failure".
 *   3. When the active agent changes away from the dispatched demigod
 *      (back to Apollo, or to a different god), OR when session.idle fires,
 *      the dispatch is finalized: a `dispatch_outcome` event is appended to
 *      live.jsonl with duration_ms, tokens_used, outcome, and all the
 *      original fields. If short_circuited AND outcome=failure, the hook
 *      calls penalizeInstinct() in real time.
 *
 * The tracker is a module-level singleton. Open dispatches survive across
 * `tool.execute.after` invocations within a single OpenCode session. They
 * are persisted to disk so a crash mid-dispatch doesn't lose state.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const OLYMPUS_HOME = path.join(os.homedir(), ".olympus");
const STATE_FILE = path.join(OLYMPUS_HOME, "dispatch-state.json");
const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), "OLYMPUS-VAULT");
const LIVE_FEED = path.join(VAULT_ROOT, "06_Activity_Feed", "live.jsonl");

export interface OpenDispatch {
  /** Unique ID for this dispatch instance (callID or generated). */
  dispatchId: string;
  /** The god that dispatched (e.g., "hephaestus"). */
  god: string;
  /** The demigod dispatched to (unprefixed, e.g., "build-resolver"). */
  demigod: string;
  /** The instinct that triggered the dispatch, if short-circuited. */
  instinctId: string | null;
  /** Whether this dispatch was a short-circuit. */
  shortCircuited: boolean;
  /** Skill equipped on the sub-agent. */
  skill: string | null;
  /** MCP enabled for this dispatch. */
  mcp: string | null;
  /** The task signature dispatched. */
  taskSignature: string;
  /** Issue #54 join key: the classificationId of the run that opened this dispatch (from the in-band marker). */
  classificationId: string | null;
  /** RLM P2 (BATCH 13): the demigod's LAST assistant text — the findings
   *  summary written to dispatch_outcome at finalize (sliced ≤ 2000 chars).
   *  Lossy on material, lossless on the verdict tail. */
  findingsSummary: string | null;
  /** RLM P1 (budgeted recursion): the requested token budget, or null when unbounded. */
  budgetTokens: number | null;
  /** RLM P1 (handoff contract): the requested output shape, or null. */
  outputShape: string | null;
  /** Active stack(s) when the dispatch was opened. */
  stack: string | null;
  /** Active project slug when the dispatch was opened. */
  project: string | null;
  /** ISO timestamp when the dispatch was opened. */
  startTs: string;
  /** Tokens used so far (input + output), updated as tool calls land. */
  tokensUsed: { input: number; output: number };
  /** Whether the dispatch has produced any error events. */
  hadError: boolean;
  /** Number of tool calls attributed to this dispatch. */
  toolCallCount: number;
}

interface PersistedState {
  openDispatches: OpenDispatch[];
  lastUpdated: string;
}

let openDispatches: OpenDispatch[] = [];
let initialized = false;

/**
 * Initialize the tracker from the persisted state file. Called once at
 * plugin load. Stale open dispatches (older than 30 minutes) are finalized
 * as "unknown" outcome so they don't linger forever.
 */
export function initDispatchTracker(): void {
  if (initialized) return;
  initialized = true;

  try {
    if (!fs.existsSync(OLYMPUS_HOME)) {
      fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as PersistedState;
      const cutoff = Date.now() - 30 * 60 * 1000; // 30 minutes
      for (const d of data.openDispatches || []) {
        const age = new Date(d.startTs).getTime();
        if (isNaN(age) || age < cutoff) {
          // Stale — finalize as unknown
          finalizeDispatch(d, "unknown");
        } else {
          openDispatches.push(d);
        }
      }
    }
  } catch {
    // Corrupt state — start fresh
    openDispatches = [];
  }
  persist();
}

function persist(): void {
  try {
    if (!fs.existsSync(OLYMPUS_HOME)) {
      fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
    }
    const state: PersistedState = {
      openDispatches,
      lastUpdated: new Date().toISOString(),
    };
    // Atomic write via temp file + rename. `writeFileSync` is NOT atomic — if
    // two OpenCode sessions (or the Electron main process + an API route)
    // call persist() concurrently, the second write could truncate the first,
    // silently losing dispatch data. The atomic write pattern (write to .tmp,
    // then rename) guarantees that the state file is never in a partially-
    // written state — readers either see the old version or the new version,
    // never a corrupt mix. On Windows, we need to unlink the target first
    // (rename fails if the target exists on some Windows versions).
    const tmpFile = STATE_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), "utf-8");
    try {
      if (fs.existsSync(STATE_FILE)) {
        // On Windows, rename fails if the target exists. Unlink first.
        fs.unlinkSync(STATE_FILE);
      }
    } catch {
      // If unlink fails (e.g. file doesn't exist), ignore — the rename
      // might still succeed on Unix.
    }
    fs.renameSync(tmpFile, STATE_FILE);
  } catch {
    // Non-fatal — the dispatch tracker is best-effort. If persist fails,
    // the in-memory state is still correct for this process; only crash
    // recovery across restarts is affected.
  }
}

/**
 * Register a new open dispatch. Called when `olympus-dispatch` fires.
 * If there's already an open dispatch for the same god + demigod, it is
 * finalized as "superseded" before the new one is opened.
 */
/**
 * RLM P2 (BATCH 13): record the latest assistant text observed for a
 * demigod's in-flight work — the message.part.updated handler calls this
 * with (info.agent, part.text). Last write wins; attributed to the most
 * recent OPEN dispatch for that demigod (same candidate-selection rule the
 * tool-call attribution uses). Fold-back becomes lossy-on-material,
 * lossless-on-verdict at finalizeDispatch.
 */
export function recordDispatchFinding(demigod: string, text: string): void {
  if (!demigod || typeof text !== 'string' || !text) return;
  initDispatchTracker();
  for (let i = openDispatches.length - 1; i >= 0; i--) {
    if (openDispatches[i].demigod === demigod) {
      openDispatches[i].findingsSummary = text;
      return;
    }
  }
  // No open dispatch for this agent — the text belongs to the god itself
  // or a completed dispatch; nothing to fold back.
}

export function registerOpenDispatch(input: {
  dispatchId: string;
  god: string;
  demigod: string;
  instinctId?: string | null;
  shortCircuited?: boolean;
  skill?: string | null;
  mcp?: string | null;
  taskSignature: string;
  classificationId?: string | null;
  budgetTokens?: number | null;
  outputShape?: string | null;
  stack?: string | null;
  project?: string | null;
}): void {
  initDispatchTracker();

  // Finalize any existing open dispatches for the same god + demigod
  const supersede = openDispatches.filter(
    d => d.god === input.god && d.demigod === input.demigod,
  );
  for (const d of supersede) {
    finalizeDispatch(d, "superseded");
  }
  openDispatches = openDispatches.filter(
    d => !(d.god === input.god && d.demigod === input.demigod),
  );

  const open: OpenDispatch = {
    dispatchId: input.dispatchId,
    god: input.god,
    demigod: input.demigod,
    instinctId: input.instinctId ?? null,
    shortCircuited: input.shortCircuited ?? false,
    skill: input.skill ?? null,
    mcp: input.mcp ?? null,
    taskSignature: input.taskSignature,
    classificationId: input.classificationId ?? null,
    findingsSummary: null,
    budgetTokens: input.budgetTokens ?? null,
    outputShape: input.outputShape ?? null,
    stack: input.stack ?? null,
    project: input.project ?? null,
    startTs: new Date().toISOString(),
    tokensUsed: { input: 0, output: 0 },
    hadError: false,
    toolCallCount: 0,
  };
  openDispatches.push(open);
  persist();
}

/**
 * Attribute a tool call to the most recent open dispatch for the given god.
 * Called from tool.execute.after for write/edit/bash/read calls. Updates
 * the dispatch's token counts and error flag.
 *
 * Returns the updated open dispatch, or null if no open dispatch exists
 * for the god.
 */
export function attributeToolCall(input: {
  god: string;
  agentId?: string | null;
  tool: string;
  hadError?: boolean;
  tokens?: { input?: number; output?: number };
}): OpenDispatch | null {
  initDispatchTracker();

  // Find the most recent open dispatch for this god
  // (gods may dispatch to multiple demigods sequentially; attribute to
  // the most recent one whose demigod matches the active agent ID, if
  // available, else the most recent open one for this god.)
  let candidate: OpenDispatch | null = null;
  for (let i = openDispatches.length - 1; i >= 0; i--) {
    const d = openDispatches[i];
    if (d.god !== input.god) continue;
    if (input.agentId && input.agentId.includes(d.demigod)) {
      candidate = d;
      break;
    }
    if (!candidate) candidate = d;
  }
  if (!candidate) return null;

  candidate.toolCallCount++;
  if (input.hadError) candidate.hadError = true;
  if (input.tokens) {
    candidate.tokensUsed.input += input.tokens.input ?? 0;
    candidate.tokensUsed.output += input.tokens.output ?? 0;
  }
  persist();
  return candidate;
}

/**
 * Finalize all open dispatches for a god (or all gods if godId is null).
 * Called when the active agent changes (back to Apollo) or on session.idle.
 *
 * For each finalized dispatch:
 *   1. Compute duration_ms = now - startTs.
 *   2. Determine outcome: "failure" if hadError, "success" if toolCallCount
 *      > 0 and no errors, "unknown" if no tool calls were attributed.
 *   3. Append a `dispatch_outcome` event to live.jsonl.
 *   4. Remove from the open list.
 *
 * Returns the finalized dispatches (for the hook to apply penalties).
 */
export function finalizeDispatchesForGod(
  godId: string | null,
  finalizeFn?: (d: OpenDispatch, outcome: "success" | "failure" | "unknown" | "superseded") => void,
): OpenDispatch[] {
  initDispatchTracker();

  const finalized: OpenDispatch[] = [];
  const remaining: OpenDispatch[] = [];
  for (const d of openDispatches) {
    if (godId && d.god !== godId) {
      remaining.push(d);
      continue;
    }
    let outcome: "success" | "failure" | "unknown" | "superseded";
    if (d.hadError) outcome = "failure";
    else if (d.toolCallCount > 0) outcome = "success";
    else outcome = "unknown";
    finalizeDispatch(d, outcome);
    if (finalizeFn) finalizeFn(d, outcome);
    finalized.push(d);
  }
  openDispatches = remaining;
  persist();
  return finalized;
}

/**
 * Finalize a single dispatch: append the rich event to live.jsonl.
 * Does NOT remove from the open list (caller does that).
 */
function finalizeDispatch(
  d: OpenDispatch,
  outcome: "success" | "failure" | "unknown" | "superseded",
): void {
  try {
    const dir = path.dirname(LIVE_FEED);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const durationMs = Date.now() - new Date(d.startTs).getTime();
    // RLM P1: budget adherence = used / requested, rounded to 3 decimals.
    // Null when no budget was requested (unbounded — behavior identical
    // to pre-P1). >= 1 means the budget was exceeded.
    const totalTokensUsed = (d.tokensUsed?.input ?? 0) + (d.tokensUsed?.output ?? 0);
    const budgetAdherence =
      typeof d.budgetTokens === "number" && d.budgetTokens > 0
        ? Math.round((totalTokensUsed / d.budgetTokens) * 1000) / 1000
        : null;
    const event = {
      ts: new Date().toISOString(),
      god: d.god,
      action: "dispatch_outcome",
      task_signature: d.taskSignature,
      demigod: d.demigod,
      skill_equipped: d.skill,
      mcp_enabled: d.mcp,
      instinct_id: d.instinctId,
      short_circuited: d.shortCircuited,
      classification_id: d.classificationId,
      findings_summary: typeof d.findingsSummary === 'string' && d.findingsSummary ? d.findingsSummary.slice(0, 2000) : null,
      budget_tokens: d.budgetTokens,
      output_shape: d.outputShape,
      budget_adherence: budgetAdherence,
      outcome,
      duration_ms: durationMs,
      tokens_used: d.tokensUsed,
      stack: d.stack,
      project: d.project,
      tool_call_count: d.toolCallCount,
      dispatch_id: d.dispatchId,
      msg: `Dispatch to ${d.demigod} ${outcome} after ${durationMs}ms (${d.toolCallCount} tool calls)`,
    };
    fs.appendFileSync(LIVE_FEED, JSON.stringify(event) + "\n", "utf-8");

    // v0.0.1 — Log to the Arsenal Resonance log for Symphony Arsenal Recon.
    // This is the FEEDBACK LOOP — every dispatch outcome updates the
    // skill-confidence map, making future arsenal recon more accurate.
    try {
      const arsenalLog = path.join(VAULT_ROOT, "03_Index", "arsenal-resonance.jsonl");
      const arsenalDir = path.dirname(arsenalLog);
      if (!fs.existsSync(arsenalDir)) fs.mkdirSync(arsenalDir, { recursive: true });
      const arsenalEntry = {
        ts: new Date().toISOString(),
        task_signature: d.taskSignature.slice(0, 64).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).slice(0, 12).join(' '),
        god: d.god,
        skill: d.skill,
        mcp: d.mcp,
        demigod: d.demigod,
        outcome: outcome === "superseded" ? "unknown" : outcome,
      };
      fs.appendFileSync(arsenalLog, JSON.stringify(arsenalEntry) + "\n", "utf-8");
    } catch {
      // Non-fatal — arsenal log is best-effort
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Get all open dispatches (for debugging / UI display).
 */
export function getOpenDispatches(): OpenDispatch[] {
  initDispatchTracker();
  return [...openDispatches];
}

/**
 * Clear all open dispatches WITHOUT finalizing them. Used on session.deleted
 * to prevent stale state from leaking into the next session.
 */
export function clearAllDispatches(): void {
  openDispatches = [];
  persist();
}
