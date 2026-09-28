/**
 * Active Agent Tracker — Phase 4 / T14 (Symphony-native)
 *
 * Tracks the currently-active OLYMPUS agent (god or demigod) by sniffing
 * tool.execute.before payloads. Persists to ~/.olympus/active-agent.json so
 * the overlay plugin and the base terminal can query it.
 *
 * The tracker is a module-level singleton (like ECC's changed-files-store).
 * It's initialized once per session and updated on every tool.execute.before.
 *
 * Detection heuristics:
 *  - If the tool input's `agent` field is present, use it directly.
 *  - Otherwise, infer from the prompt file being read (if the tool is `read`
 *    and the path matches .opencode/prompts/agents/gods/<god>.txt, the
 *    active god is <god>; if it matches demigods/<god>/<name>.txt, the
 *    active demigod is <name> under <god>).
 *  - Otherwise, leave the last-known agent unchanged.
 *
 * v0.0.1 Symphony-native: gods are identified by NAME (the GOD_NAMES set),
 * not by prefix. Demigods are unprefixed (e.g., 'build-resolver', not
 * 'build-resolver'). The parent god is determined by the dispatch
 * context or the demigods/<god>/ directory path.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const OLYMPUS_HOME = path.join(os.homedir(), ".olympus");
const ACTIVE_AGENT_FILE = path.join(OLYMPUS_HOME, "active-agent.json");

// GOD_NAMES — the canonical 10 gods. Identified by NAME, not by prefix.
const GOD_NAMES = new Set([
  "apollo", "atlas", "artemis", "athena", "dionysus", "hephaestus",
  "hermes", "persephone", "prometheus", "callimachus",
]);

export interface ActiveAgentState {
  /** The agent ID (e.g., "hephaestus", "build-resolver"). Gods are unprefixed;
   *  demigods are unprefixed (e.g., "build-resolver", not "ecc-rust-build-resolver"). */
  agentId: string | null;
  /** The god ID if the agent is an OLYMPUS god (e.g., "hephaestus"). null for demigods. */
  godId: string | null;
  /** The demigod name if the agent is a demigod (e.g., "build-resolver"). null for gods. */
  demigodId: string | null;
  /** The parent god of the demigod (e.g., "hephaestus" for "build-resolver"). null for gods. */
  parentGod: string | null;
  /** Whether the active agent is Callimachus (special-cased for path scoping). */
  isCallimachus: boolean;
  /** ISO 8601 timestamp of the last update. */
  ts: string;
  /** The session ID (if available from the plugin input). */
  sessionId: string | null;
}

let currentState: ActiveAgentState = {
  agentId: null,
  godId: null,
  demigodId: null,
  parentGod: null,
  isCallimachus: false,
  ts: new Date().toISOString(),
  sessionId: null,
};

/**
 * Initialize the tracker. Called once at plugin load.
 */
export function initTracker(sessionId?: string): void {
  // Try to load persisted state (for cross-session continuity)
  try {
    if (fs.existsSync(ACTIVE_AGENT_FILE)) {
      const persisted = JSON.parse(fs.readFileSync(ACTIVE_AGENT_FILE, "utf-8"));
      // Only restore if the session ID matches (otherwise start fresh)
      if (sessionId && persisted.sessionId === sessionId) {
        currentState = persisted;
        return;
      }
    }
  } catch {
    // Ignore — start fresh
  }
  currentState = {
    agentId: null,
    godId: null,
    demigodId: null,
    parentGod: null,
    isCallimachus: false,
    ts: new Date().toISOString(),
    sessionId: sessionId ?? null,
  };
}

/**
 * Update the active agent. Called from tool.execute.before.
 * Heuristics:
 *  1. If `agentId` is explicitly provided, use it.
 *  2. If the tool is `read` and the path matches a god/demigod prompt, infer.
 *  3. Otherwise, leave the last-known agent unchanged.
 */
export function updateActiveAgent(input: {
  agentId?: string;
  tool?: string;
  args?: { filePath?: string; file_path?: string; path?: string; [k: string]: unknown };
  sessionId?: string;
}): void {
  const { agentId, tool, args, sessionId } = input;

  // Explicit agent ID — use it directly
  if (agentId && typeof agentId === "string") {
    setAgent(agentId, sessionId);
    return;
  }

  // Infer from file path being read
  if (tool === "read" && args) {
    const filePath = (args.filePath ?? args.file_path ?? args.path) as string | undefined;
    if (filePath && typeof filePath === "string") {
      const inferred = inferAgentFromPath(filePath);
      if (inferred) {
        setAgentFromInference(inferred, sessionId);
        return;
      }
    }
  }

  // No update — keep the last-known agent
  if (sessionId) {
    currentState.sessionId = sessionId;
    currentState.ts = new Date().toISOString();
  }
}

/**
 * Infer the active agent from a file path.
 * Matches (case-insensitive on the directory name):
 *  - .opencode/prompts/agents/gods/<god>.txt → { kind: 'god', god: <god> }
 *  - .opencode/prompts/agents/demigods/<god>/<name>.txt → { kind: 'demigod', god: <god>, name: <name> }
 */
function inferAgentFromPath(filePath: string): { kind: "god" | "demigod"; god: string; name?: string } | null {
  const normalized = filePath.replace(/\\/g, "/");

  // God prompt: gods/<god>.txt (case-insensitive directory)
  const godMatch = normalized.match(/prompts\/agents\/[Gg]ods\/(\w+)\.txt$/);
  if (godMatch) {
    const god = godMatch[1].toLowerCase();
    if (GOD_NAMES.has(god)) {
      return { kind: "god", god };
    }
  }

  // Demigod prompt: demigods/<god>/<name>.txt (case-insensitive directory)
  const demigodMatch = normalized.match(/prompts\/agents\/[Dd]emigods\/(\w+)\/([\w-]+)\.txt$/);
  if (demigodMatch) {
    const god = demigodMatch[1].toLowerCase();
    const name = demigodMatch[2];
    // The demigod ID uses hyphens (matching opencode.json agent keys)
    return { kind: "demigod", god, name };
  }

  return null;
}

/**
 * Set the active agent from an inference result (god or demigod).
 */
function setAgentFromInference(inferred: { kind: "god" | "demigod"; god: string; name?: string }, sessionId?: string): void {
  if (inferred.kind === "god") {
    currentState = {
      agentId: inferred.god,
      godId: inferred.god,
      demigodId: null,
      parentGod: null,
      isCallimachus: inferred.god === "callimachus",
      ts: new Date().toISOString(),
      sessionId: sessionId ?? currentState.sessionId,
    };
  } else {
    // Demigod — unprefixed name, parent god from the directory
    currentState = {
      agentId: inferred.name!,
      godId: null,
      demigodId: inferred.name!,
      parentGod: inferred.god,
      isCallimachus: false,
      ts: new Date().toISOString(),
      sessionId: sessionId ?? currentState.sessionId,
    };
  }
  persistState();
}

/**
 * Set the active agent and persist to disk.
 * The agentId may be a god name (e.g., "hephaestus") or a demigod name
 * (e.g., "build-resolver"). Gods are identified by the GOD_NAMES set.
 */
function setAgent(agentId: string, sessionId?: string): void {
  const isGod = GOD_NAMES.has(agentId);
  const isCallimachus = agentId === "callimachus";

  currentState = {
    agentId,
    godId: isGod ? agentId : null,
    demigodId: isGod ? null : agentId,
    parentGod: isGod ? null : currentState.parentGod, // parent god set by dispatch context
    isCallimachus,
    ts: new Date().toISOString(),
    sessionId: sessionId ?? currentState.sessionId,
  };

  persistState();
}

function persistState(): void {
  // Persist (best-effort — don't fail if ~/.olympus doesn't exist yet)
  try {
    if (!fs.existsSync(OLYMPUS_HOME)) {
      fs.mkdirSync(OLYMPUS_HOME, { recursive: true });
    }
    fs.writeFileSync(ACTIVE_AGENT_FILE, JSON.stringify(currentState, null, 2), "utf-8");
  } catch {
    // Non-fatal — the tracker still works in-memory
  }
}

/**
 * Get the current active agent state.
 */
export function getActiveAgent(): ActiveAgentState {
  return { ...currentState };
}

/**
 * Clear the active agent (called on session.idle / session.deleted).
 */
export function clearActiveAgent(): void {
  currentState = {
    agentId: null,
    godId: null,
    demigodId: null,
    parentGod: null,
    isCallimachus: false,
    ts: new Date().toISOString(),
    sessionId: currentState.sessionId,
  };
  try {
    fs.writeFileSync(ACTIVE_AGENT_FILE, JSON.stringify(currentState, null, 2), "utf-8");
  } catch {
    // Non-fatal
  }
}

/**
 * Check if a file path is inside ~/OLYMPUS-VAULT/.
 * Used by the permission.ask hook to scope Callimachus's writes.
 */
export function isInsideVault(filePath: string): boolean {
  const vaultRoot = process.env.OLYMPUS_VAULT || path.join(os.homedir(), "OLYMPUS-VAULT");
  const resolved = path.resolve(filePath);
  const vaultResolved = path.resolve(vaultRoot);
  return resolved.startsWith(vaultResolved + path.sep) || resolved === vaultResolved;
}
