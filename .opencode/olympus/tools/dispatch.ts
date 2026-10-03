/**
 * olympus-dispatch Tool — v3.1 Auto-Inject Edition
 *
 * Lets a god dispatch to a demigod via the Symphony protocol.
 *
 * UPDATE v3.1: Auto-injects the target demigod into opencode.json before
 * the dispatch. This makes the dispatch flow SELF-CONFIGURING — even when
 * the active strategy is free-tier (which keeps only 10 gods in
 * opencode.json to fit under Groq's 12K TPM limit), the god can dispatch
 * to ANY demigod and the demigod will be loaded on-demand.
 *
 * Symphony is the STANDARD language between Gods and Demigods — there is no
 * textual dispatch path. Every dispatch is a VibrationalSignature composed
 * by the God, broadcast by the Conductor, and decoded by the Decoding Choir.
 *
 * This tool:
 *   - AUTO-INJECTS the target demigod into opencode.json if it's not
 *     already present. The demigod is loaded from opencode.demigods.json
 *     (the registry of all 118 demigods). If the demigod is unknown (not
 *     in the registry), the tool refuses the dispatch with a helpful
 *     message — the god should use the demigod-author tool to create it.
 *   - Composes a REAL VibrationalSignature from the task payload (via
 *     composeSignature() from the Symphony core library). The signature
 *     is persisted to the Vault's Resonance Registry (zero-loss — Axiom A1
 *     + A5). A Vault anchor is built so the original payload can always be
 *     reconstructed.
 *   - Broadcasts the signature to the target demigod(s).
 *   - Logs the dispatch to the activity feed (rich event with task_signature,
 *     skill, mcp, instinct_id, short_circuited, stack, project).
 *   - Registers an open dispatch with the dispatch tracker so the
 *     tool.execute.after hook can attribute subsequent tool calls to this
 *     dispatch and finalize it with outcome + duration + tokens.
 *
 * Compose a real VibrationalSignature via the Symphony core. composeSignature()
 * from src/lib/symphony/index.js:
 *   - Quantizes the intent via the semantic-quantizer
 *   - Writes the source payload to the Resonance Registry (zero-loss)
 *   - Builds a proper VaultAnchor with a checksum
 *   - Extracts constraints + success predicates
 *   - Measures the real coherence baseline
 *   - Produces a correctly-typed VibrationalSignature
 *
 * Inline fabrication of a "signature" (wrong field names, hardcoded
 * dimensions, no Vault anchor, no registry write) violates Axioms A1 (no
 * Vault anchor) and A5 (not persisted to the registry).
 *
 * Demigods are unprefixed (e.g., 'build-resolver', 'verifier-code', 'sast-scanner').
 * The parent god is determined by the dispatch context, not by a name prefix.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
// Import the REAL Symphony composer. composeSignature() writes the payload
// to the Resonance Registry (zero-loss), builds a proper VaultAnchor,
// quantizes the intent, and measures the real coherence baseline.
// Fabricating an inline signature would violate Axioms A1 (no Vault anchor)
// and A5 (not persisted to the registry).
//
// The import path must be RELATIVE to this file's location. dispatch.ts is at
// .opencode/olympus/tools/dispatch.ts. To reach src/lib/symphony/index.js at
// the project root:
//   ..        → .opencode/olympus/
//   ../..     → .opencode/
//   ../../..  → project root (where src/ lives)
// So the correct path is ../../../src/lib/symphony/index.js (3 ../). Using
// ../../../../src/lib/... (4 ../) goes ABOVE the project root → TS2307
// "Cannot find module".
import {
  composeSignature,
  estimateSignatureEconomy,
  type VibrationalSignature,
  type SignatureEconomyEstimate,
} from "../../../src/lib/symphony/index.js";
// Issue #54: per-session classificationId (in-band marker state) for the
// symphony-dispatch event's join key.
import { getClassificationId } from "../lib/classification-context.js";

const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), "OLYMPUS-VAULT");
const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();

// --- Self-configuring demigod loader --------------------------------------
//
// The dispatch tool reads opencode.demigods.json (the registry of all 118
// demigods) and injects the target demigod into opencode.json on-demand.
// This makes the dispatch flow work in BOTH:
//   - GO-plan mode (all 128 agents pre-loaded — injection is a no-op)
//   - Free-tier mode (only 10 gods pre-loaded — injection adds the demigod)
//
// The injection is tracked in ~/.olympus/injected-demigods.json so the
// post-dispatch cleanup (in opencode-spawn.ts:cleanupAfterSpawn) can eject
// the demigod when the spawn completes.
//
// SELF-CONFIGURING: When the demigod-author tool creates a new demigod, it
// touches a sentinel file at ~/.olympus/demigods-registry.reload. The
// dispatch tool checks this sentinel on every call and reloads the registry
// cache if the sentinel is newer than the cache.
//
// IMPORTANT: This is a SYNC filesystem operation. The dispatch tool runs
// inside the OpenCode process, so we use fs.readFileSync / writeFileSync
// (not the async versions). The cost is <5ms per demigod — negligible.

const GOD_IDS = new Set([
  "apollo", "atlas", "artemis", "athena", "dionysus", "hephaestus",
  "hermes", "persephone", "prometheus", "callimachus",
]);

const DEMIGODS_JSON = path.join(OLYMPUS_ROOT, "opencode.demigods.json");
const OPENCODE_JSON = path.join(OLYMPUS_ROOT, "opencode.json");
const INJECTED_TRACKER = path.join(os.homedir(), ".olympus", "injected-demigods.json");
const REGISTRY_RELOAD_SENTINEL = path.join(os.homedir(), ".olympus", "demigods-registry.reload");

interface DemigodRegistryEntry {
  parent_god: string;
  mode: string;
  model: string;
  prompt: string;
}

interface DemigodRegistry {
  _meta?: {
    description?: string;
    version?: string;
    total?: number;
  };
  demigods: Record<string, DemigodRegistryEntry>;
}

let _demigodsCache: DemigodRegistry | null = null;
let _demigodsCacheMtimeMs: number = 0;

function loadDemigodsRegistry(): DemigodRegistry {
  // Check the reload sentinel — if it exists and is newer than our cache,
  // invalidate the cache so the registry is re-read from disk.
  try {
    if (_demigodsCache && fs.existsSync(REGISTRY_RELOAD_SENTINEL)) {
      const sentinelStat = fs.statSync(REGISTRY_RELOAD_SENTINEL);
      if (sentinelStat.mtimeMs > _demigodsCacheMtimeMs) {
        _demigodsCache = null;
      }
    }
  } catch {}

  if (_demigodsCache) return _demigodsCache;
  if (!fs.existsSync(DEMIGODS_JSON)) {
    throw new Error(
      `opencode.demigods.json not found at ${DEMIGODS_JSON}. ` +
      `Required for dynamic demigod loading. Run \`node scripts/apply-strategy.js --status\` to diagnose.`
    );
  }
  const stat = fs.statSync(DEMIGODS_JSON);
  const raw = JSON.parse(fs.readFileSync(DEMIGODS_JSON, "utf-8"));
  if (!raw.demigods || typeof raw.demigods !== "object") {
    throw new Error("opencode.demigods.json missing `demigods` object");
  }
  _demigodsCache = raw as DemigodRegistry;
  _demigodsCacheMtimeMs = stat.mtimeMs;
  return _demigodsCache;
}

/**
 * Reload the demigods registry from disk (clearing the cache).
 *
 * Called when a god creates a NEW demigod via the demigod-author tool —
 * the new demigod is written to opencode.demigods.json, then this function
 * is called so the next dispatch sees it.
 */
export function reloadDemigodsRegistry(): void {
  _demigodsCache = null;
  loadDemigodsRegistry();
}

function loadInjectedTracker(): { injected: string[]; lastInjectedAt?: string } {
  try {
    if (!fs.existsSync(INJECTED_TRACKER)) return { injected: [] };
    const raw = JSON.parse(fs.readFileSync(INJECTED_TRACKER, "utf-8"));
    if (!Array.isArray(raw.injected)) raw.injected = [];
    return raw;
  } catch {
    return { injected: [] };
  }
}

function saveInjectedTracker(tracker: { injected: string[]; lastInjectedAt?: string }): void {
  try {
    const dir = path.dirname(INJECTED_TRACKER);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INJECTED_TRACKER, JSON.stringify(tracker, null, 2), "utf-8");
  } catch {}
}

function recordInjected(name: string): void {
  const tracker = loadInjectedTracker();
  if (!tracker.injected.includes(name)) {
    tracker.injected.push(name);
    tracker.lastInjectedAt = new Date().toISOString();
    saveInjectedTracker(tracker);
  }
}

/**
 * Ensure the target demigod is present in opencode.json.
 *
 * - If the demigod is a god ID, refuse (gods are always present).
 * - If the demigod is already in opencode.json, no-op.
 * - If the demigod is in the registry but not in opencode.json, inject it
 *   (load its config from opencode.demigods.json, write it into opencode.json,
 *   record the injection in ~/.olympus/injected-demigods.json for cleanup).
 * - If the demigod is NOT in the registry, throw with a helpful message
 *   directing the god to use the demigod-author tool.
 *
 * Returns:
 *   - "already_present" — demigod was already in opencode.json (no-op)
 *   - "injected" — demigod was loaded from registry and injected
 *   - "rejected_unknown" — demigod not in registry (god should create it)
 *   - "rejected_god" — name is a god ID, not a demigod
 */
function ensureDemigodPresent(demigodName: string): {
  status: "already_present" | "injected" | "rejected_unknown" | "rejected_god";
  parent_god?: string;
  model?: string;
  reason?: string;
} {
  if (GOD_IDS.has(demigodName)) {
    return {
      status: "rejected_god",
      reason: `"${demigodName}" is a god, not a demigod. Gods are always present in opencode.json.`,
    };
  }

  // Check if already in opencode.json
  try {
    if (fs.existsSync(OPENCODE_JSON)) {
      const cfg = JSON.parse(fs.readFileSync(OPENCODE_JSON, "utf-8"));
      if (cfg.agent && cfg.agent[demigodName]) {
        return { status: "already_present" };
      }
    }
  } catch {}

  // Look up in registry
  let registry: DemigodRegistry;
  try {
    registry = loadDemigodsRegistry();
  } catch (e: any) {
    return {
      status: "rejected_unknown",
      reason: `Could not load demigods registry: ${e.message}`,
    };
  }

  const entry = registry.demigods[demigodName];
  if (!entry) {
    return {
      status: "rejected_unknown",
      reason:
        `Demigod "${demigodName}" is not in the registry. ` +
        `If this is a recurring task type with no existing demigod, use the ` +
        `demigod-author tool to create a new demigod for it.`,
    };
  }

  // Inject into opencode.json
  try {
    if (!fs.existsSync(OPENCODE_JSON)) {
      return {
        status: "rejected_unknown",
        reason: `opencode.json not found at ${OPENCODE_JSON}`,
      };
    }
    const cfg = JSON.parse(fs.readFileSync(OPENCODE_JSON, "utf-8"));
    if (!cfg.agent) cfg.agent = {};
    cfg.agent[demigodName] = {
      mode: entry.mode || "subagent",
      model: entry.model,
      prompt: entry.prompt,
    };
    fs.writeFileSync(OPENCODE_JSON, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
    recordInjected(demigodName);
    return {
      status: "injected",
      parent_god: entry.parent_god,
      model: entry.model,
    };
  } catch (e: any) {
    return {
      status: "rejected_unknown",
      reason: `Failed to inject demigod "${demigodName}" into opencode.json: ${e.message}`,
    };
  }
}

const dispatchTool: ToolDefinition = tool({
  description:
    "Dispatch to a demigod via the Symphony protocol. Composes a VibrationalSignature from the task, broadcasts it to the target demigod, and registers the dispatch with the VaultBrain capture pipeline. Symphony is the standard language between Gods and Demigods — there is no textual dispatch path. Demigods are unprefixed (e.g., 'build-resolver', 'verifier-code'). The target demigod is AUTO-INJECTED into opencode.json if not already present (loaded from opencode.demigods.json), so dispatch works in both GO-plan and free-tier modes.",
  args: {
    godId: tool.schema
      .string()
      .describe("Your god ID (e.g., 'hephaestus')."),
    demigod: tool.schema
      .string()
      .describe("The demigod to dispatch to (unprefixed, e.g., 'build-resolver', 'verifier-code', 'sast-scanner'). The parent god is determined by the dispatch context. If the demigod is not yet loaded, it will be auto-injected from opencode.demigods.json."),
    task: tool.schema
      .string()
      .describe("The task to delegate to the demigod. This is the task_signature used by the brain to match future dispatches to instincts."),
    skill: tool.schema
      .string()
      .optional()
      .describe("The skill to equip on the demigod (e.g., 'caveman', 'tdd-guide'). Defaults to 'caveman'."),
    mcp: tool.schema
      .string()
      .optional()
      .describe("The MCP to enable for this dispatch (e.g., 'serena', 'context7'). Optional."),
    shortCircuit: tool.schema
      .boolean()
      .optional()
      .describe("Whether this dispatch is a short-circuit (instinct-driven). Defaults to false. If true, the instinct's confidence will be updated based on the dispatch outcome (penalized on failure, rewarded on success)."),
    instinctId: tool.schema
      .string()
      .optional()
      .describe("If shortCircuit is true, the instinct ID that triggered the dispatch. Required for short-circuits."),
    stack: tool.schema
      .string()
      .optional()
      .describe("The active tech stack (e.g., 'rust'). If omitted, the brain reads it from the OLYMPUS_ACTIVE_STACK env var."),
    project: tool.schema
      .string()
      .optional()
      .describe("The active project slug. If omitted, the brain reads it from the OLYMPUS_ACTIVE_PROJECT env var."),
  },
  execute: async (args: {
    godId: string;
    demigod: string;
    task: string;
    skill?: string;
    mcp?: string;
    shortCircuit?: boolean;
    instinctId?: string;
    stack?: string;
    project?: string;
  }, context: { sessionID?: string }) => {
    const {
      godId,
      demigod,
      task,
      skill = "caveman",
      mcp,
      shortCircuit = false,
      instinctId,
      stack,
      project,
    } = args;

    // Validate the demigod name — must NOT be prefixed (no ecc-, olympus-, volt-)
    const FORBIDDEN_PREFIXES = ["ecc-", "olympus-", "volt-"];
    const hasForbiddenPrefix = FORBIDDEN_PREFIXES.some(p => demigod.startsWith(p));
    if (hasForbiddenPrefix) {
      return {
        output: JSON.stringify({
          ok: false,
          error: `Invalid demigod name "${demigod}". Demigods are unprefixed (e.g., 'build-resolver', 'verifier-code'). Remove the '${demigod.split("-")[0]}-' prefix.`,
        }, null, 2),
      };
    }

    // If short-circuit, validate instinctId
    if (shortCircuit && !instinctId) {
      return {
        output: JSON.stringify({
          ok: false,
          error: "shortCircuit is true but instinctId is missing. Call olympus-shortcircuit with the instinct ID.",
        }, null, 2),
      };
    }

    // --- AUTO-INJECT the demigod into opencode.json (self-configuring) ----
    // This is the v3.1 upgrade: the dispatch tool ensures the target demigod
    // is present in opencode.json before composing the Symphony signature.
    // In GO-plan mode, this is a no-op (all 118 demigods pre-loaded). In
    // free-tier mode, this injects the demigod on-demand so the dispatch
    // can proceed without restarting OpenCode.
    const injectResult = ensureDemigodPresent(demigod);
    if (injectResult.status === "rejected_god" || injectResult.status === "rejected_unknown") {
      return {
        output: JSON.stringify({
          ok: false,
          error: `Cannot dispatch to "${demigod}": ${injectResult.reason}`,
          hint: injectResult.status === "rejected_unknown"
            ? "Use the demigod-author tool to create a new demigod for this task type."
            : undefined,
        }, null, 2),
      };
    }

    // Resolve stack/project (args override env)
    const resolvedStack = stack || process.env.OLYMPUS_ACTIVE_STACK || null;
    const resolvedProject = project || process.env.OLYMPUS_ACTIVE_PROJECT || null;

    // Compose a REAL VibrationalSignature using the Symphony core library.
    let signature: VibrationalSignature;
    let economyEstimate: SignatureEconomyEstimate;
    try {
      signature = composeSignature({
        composer: godId,
        payload: task,
        targetOrchestra: [demigod],
        broadcastMode: "parallel",
        stackHints: resolvedStack ? [resolvedStack] : undefined,
      });
      economyEstimate = estimateSignatureEconomy(signature, task.length);
    } catch (err: any) {
      return {
        output: JSON.stringify({
          ok: false,
          error: `Failed to compose Symphony signature: ${err.message}`,
        }, null, 2),
      };
    }

    // Log the dispatch to the activity feed — rich event for the VaultBrain
    // capture pipeline. The tool.execute.after hook will ALSO see this call
    // and register an open dispatch with the tracker, but we write the
    // event here too as a redundancy in case the hook doesn't fire (e.g.,
    // if the plugin is disabled).
    try {
      const feedPath = path.join(VAULT_ROOT, "06_Activity_Feed", "live.jsonl");
      const dir = path.dirname(feedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const event = {
        ts: new Date().toISOString(),
        god: godId,
        action: "symphony-dispatch",
        task_signature: task,
        demigod: demigod,
        skill_equipped: skill,
        mcp_enabled: mcp || null,
        instinct_id: instinctId || null,
        short_circuited: shortCircuit,
        // Issue #54 join key: the classificationId of the run that opened
        // this dispatch (parsed from the in-band [OLYMPUS-CLASSIFICATION
        // id=...] marker by the chat.message hook). Null on unmarked
        // sessions (e.g. manual opencode runs) — the metric falls back to
        // ts-proximity for those.
        classification_id: getClassificationId(context.sessionID),
        stack: resolvedStack,
        project: resolvedProject,
        signature_id: signature.id,
        vault_anchor: signature.vaultAnchor.anchorId,
        coherence_baseline: signature.coherenceBaseline,
        intent_hash: signature.intentVector.intentHash,
        economy_reduction: economyEstimate.projectedReduction,
        demigod_injection: injectResult.status,
        msg: `Symphony dispatch to ${demigod} for "${task.slice(0, 100)}"`,
        meta: {
          skill,
          mcp: mcp || null,
          short_circuit: shortCircuit,
          instinct_id: instinctId || null,
          task,
          signatureId: signature.id,
          vaultAnchor: signature.vaultAnchor,
          protocol: signature.protocol,
          inject_status: injectResult.status,
          inject_parent_god: injectResult.parent_god || null,
        },
      };
      fs.appendFileSync(feedPath, JSON.stringify(event) + "\n", "utf-8");

      // Record the explicit MCP equip so the tier-aware permission.ask hook
      // in olympus-router/index.ts can allow subsequent tool calls against
      // this MCP.
      if (mcp) {
        try {
          const equipPath = path.join(os.homedir(), '.olympus', 'equipped-mcps.json');
          const equipDir = path.dirname(equipPath);
          if (!fs.existsSync(equipDir)) fs.mkdirSync(equipDir, { recursive: true });
          let existing: string[] = [];
          if (fs.existsSync(equipPath)) {
            try {
              const raw = JSON.parse(fs.readFileSync(equipPath, 'utf-8'));
              if (Array.isArray(raw)) existing = raw.map(String);
            } catch {}
          }
          if (!existing.includes(mcp)) {
            existing.push(mcp);
            fs.writeFileSync(equipPath, JSON.stringify(existing, null, 2), 'utf-8');
          }
        } catch {
          // Non-fatal — the dispatch still proceeds; the god may have to
          // re-equip the MCP on the next dispatch if permission.ask denies.
        }
      }
    } catch {
      // Non-fatal — the dispatch still proceeds
    }

    // The actual demigod invocation is handled by OpenCode's native
    // subtask mechanism. The auto-injection above ensures the demigod is
    // present in opencode.json so OpenCode can spawn it.
    //
    // After the dispatch completes, the opencode-spawn.ts:cleanupAfterSpawn()
    // function will eject any demigods that were injected (tracked in
    // ~/.olympus/injected-demigods.json). In GO-plan mode, the demigod
    // was already present, so no ejection occurs.

    const injectMessage =
      injectResult.status === "injected"
        ? ` Demigod was auto-injected from opencode.demigods.json (parent: ${injectResult.parent_god}, model: ${injectResult.model}).`
        : injectResult.status === "already_present"
          ? " Demigod was already present in opencode.json."
          : "";

    return {
      output: JSON.stringify({
        ok: true,
        godId,
        demigod,
        task,
        skill,
        mcp: mcp || null,
        shortCircuit,
        instinctId: instinctId || null,
        stack: resolvedStack,
        project: resolvedProject,
        signatureId: signature.id,
        protocol: signature.protocol,
        vaultBrainVersion: "3.1",
        vaultAnchor: signature.vaultAnchor.anchorId,
        coherenceBaseline: signature.coherenceBaseline,
        intentHash: signature.intentVector.intentHash,
        intentType: signature.intentVector.intentType,
        economyReduction: economyEstimate.projectedReduction,
        demigodInjection: injectResult.status,
        message: `Symphony signature composed + broadcast to ${demigod}. The full payload is preserved in the Vault at registry entry ${signature.vaultAnchor.anchorId} (zero-loss). The tool.execute.after hook will attribute subsequent tool calls to this dispatch and finalize it with outcome + duration + tokens when the agent changes.${injectMessage} Now invoke the demigod via the appropriate mechanism (slash command or task tool).`,
        nextStep: `The demigod "${demigod}" is now available. OpenCode's task system can spawn it.`,
      }, null, 2),
    };
  },
});

export default dispatchTool;
