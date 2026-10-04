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
 * Demigods are unprefixed (e.g., 'build-resolver', 'code-verifier', 'secrets-scanner').
 * The parent god is determined by the dispatch context, not by a name prefix.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash } from "crypto";
// L2 (MADRUGA-3 p1): the dispatch REGISTERS itself with the tracker — the
// single-writer doctrine. An unregistrable dispatch fails loudly and never
// reports success.
import { registerOpenDispatch } from "../lib/dispatch-tracker.js";
// ATLAS (MADRUGA-3 p2): the sync-map ingest — the dispatch prompt is
// recorded by Atlas BEFORE anything else happens for it (the Part 2
// funnel; works in every process that loads the tool, managed or not).
import {
  atlasIngestDispatch,
  atlasMarkDispatchRouted,
  atlasMarkDispatchFailed,
} from "../lib/atlas-sync.js";
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
import { getVaultRoot } from "../../../src/lib/vault-root.js";

const VAULT_ROOT = getVaultRoot(); // D21: the single canonical resolver
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

// Demigod names must never carry a harness prefix (R10 / the unprefixed rule).
const FORBIDDEN_PREFIXES = ["ecc-", "olympus-", "volt-"];

const DEMIGODS_JSON = path.join(OLYMPUS_ROOT, "opencode.demigods.json");
const OPENCODE_JSON = path.join(OLYMPUS_ROOT, "opencode.json");
// L2 (MADRUGA-3): the repo registry — reliable fallback for lane/bench
// contexts where OLYMPUS_ROOT points at a working dir that has the lane's
// opencode.json (real copy, receives demigod auto-injection writes) but no
// demigods registry of its own. The plugin lives inside the repo
// (source: <repo>/.opencode/olympus/tools/, compiled:
// <repo>/.opencode/olympus/dist/tools/ — one level deeper), so we walk up
// from this module until we find the directory that actually contains
// opencode.demigods.json. The 2b symlink bridge retires.
function resolveRepoDemigodsJson(): string {
  // __filename, not import.meta.url: the overlay compiles to CommonJS
  // (TS1470 otherwise) and __filename is correct in both the compiled
  // output and the tsx-compiled source the fixtures drive.
  let dir = path.dirname(__filename);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "opencode.demigods.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}
const REPO_DEMIGODS_JSON = resolveRepoDemigodsJson();
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
  // L2: lane-local registry first; repo registry as fallback.
  let registryPath = DEMIGODS_JSON;
  if (!fs.existsSync(registryPath)) {
    if (REPO_DEMIGODS_JSON && fs.existsSync(REPO_DEMIGODS_JSON)) {
      registryPath = REPO_DEMIGODS_JSON;
    } else {
      throw new Error(
        `opencode.demigods.json not found at ${DEMIGODS_JSON}` +
        (REPO_DEMIGODS_JSON ? ` or the repo fallback (${REPO_DEMIGODS_JSON})` : "") +
        `. Required for dynamic demigod loading. Run \`node scripts/apply-strategy.js --status\` to diagnose.`
      );
    }
  }
  const stat = fs.statSync(registryPath);
  const raw = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
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
 * L3 (MADRUGA-3 p1): the demigods registry is consulted FIRST — the parent
 * god is a REGISTRY FACT for every dispatch, including the already-present
 * path. The curated directive's invoke target always comes from the
 * registry; the generic `"apollo"` default is dead (a wrong subagent_type
 * is worse than a refusal).
 *
 * - If the demigod is a god ID, refuse (gods are always present).
 * - If the demigod is not in the registry, refuse — including when it is
 *   already present in opencode.json (a foreign agent gets no directive;
 *   the pantheon dispatches only to registered demigods).
 * - If the demigod's registry entry carries an invalid parent_god, refuse.
 * - If the demigod is already in opencode.json AND registered, no-op (with
 *   the registry-derived parent god returned).
 * - Otherwise inject it (config from the registry, recorded in
 *   ~/.olympus/injected-demigods.json for cleanup).
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

  // Registry FIRST (L3): the parent god is curated by the registry for
  // every dispatch — the already-present path included.
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

  const parentGod = entry.parent_god;
  if (!parentGod || !GOD_IDS.has(parentGod)) {
    // A corrupt registry entry must never produce a directive with an
    // uncurated invoke target — refuse, loudly.
    return {
      status: "rejected_unknown",
      reason:
        `Demigod "${demigodName}" carries an invalid parent_god "${parentGod}" in the registry — ` +
        `refusing to emit a directive with an uncurated invoke target. Fix opencode.demigods.json.`,
    };
  }

  // Check if already in opencode.json
  try {
    if (fs.existsSync(OPENCODE_JSON)) {
      const cfg = JSON.parse(fs.readFileSync(OPENCODE_JSON, "utf-8"));
      if (cfg.agent && cfg.agent[demigodName]) {
        return { status: "already_present", parent_god: parentGod, model: entry.model };
      }
    }
  } catch {
    // Unreadable config — fall through to the injection attempt, which
    // reports the failure loudly.
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
      parent_god: parentGod,
      model: entry.model,
    };
  } catch (e: any) {
    return {
      status: "rejected_unknown",
      reason: `Failed to inject demigod "${demigodName}" into opencode.json: ${e.message}`,
    };
  }
}

// ─── L4 (MADRUGA-3 p1): the emission record + its schema validator ─────────

/**
 * The dispatch emission record — the contract every successful dispatch
 * must satisfy BEFORE the directive is emitted. Every field is a REAL,
 * verifiable value (registry-derived parent god, composer-issued signature
 * id + vault anchor, sha256 directive hash); anything less is refused.
 */
export interface DispatchEmissionRecord {
  /** The dispatch registry id (the signature id — one id end-to-end). */
  dispatchId: string;
  /** The origin god (the god that dispatched). */
  god: string;
  /** The target demigod (unprefixed). */
  demigod: string;
  /** The demigod's parent god from the registry — the task-tool invoke target. */
  parentGod: string;
  /** The Symphony signature id (composer-issued). */
  signatureId: string;
  /** The Vault anchor id (zero-loss reconstruction path, Axiom A1). */
  vaultAnchor: string;
  /** The signature intent hash (composer-issued hex digest). */
  intentHash: string;
  /** sha256 of the directive text, first 16 hex chars (verifiable). */
  directiveHash: string;
  /** ISO timestamp of the emission. */
  ts: string;
  /** Lifecycle status at emission: "dispatched". */
  status: string;
  /** The curated directive text (must carry subagent_type="<parentGod>"). */
  message: string;
}

/**
 * Validate an emission record BEFORE the directive is emitted (L4). Pure —
 * no I/O. Returns {ok: true} or {ok: false, violations: [...]} with the
 * exact violation list. The tool refuses to emit an invalid directive.
 */
export function validateDispatchDirective(
  record: Partial<DispatchEmissionRecord>,
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  const r = record ?? ({} as Partial<DispatchEmissionRecord>);
  if (!r.god || !GOD_IDS.has(r.god)) {
    violations.push(`unknown origin god "${r.god}"`);
  }
  if (!r.parentGod || !GOD_IDS.has(r.parentGod)) {
    violations.push(`unknown parent god "${r.parentGod}" — the invoke target must be a real god`);
  }
  if (!r.demigod || typeof r.demigod !== "string") {
    violations.push("missing demigod");
  } else {
    if (GOD_IDS.has(r.demigod)) violations.push(`"${r.demigod}" is a god, not a demigod`);
    if (FORBIDDEN_PREFIXES.some(p => r.demigod!.startsWith(p))) {
      violations.push(`demigod "${r.demigod}" carries a forbidden prefix (unprefixed names only)`);
    }
  }
  if (!r.signatureId || typeof r.signatureId !== "string") {
    violations.push("missing signature id");
  }
  if (!r.vaultAnchor || typeof r.vaultAnchor !== "string") {
    violations.push("missing vault anchor (Axiom A1 — zero-loss reconstruction path)");
  }
  if (!/^[a-f0-9]{16,}$/i.test(r.intentHash || "")) {
    violations.push(`intent hash "${r.intentHash}" is not a hex digest`);
  }
  if (!/^[a-f0-9]{16}$/.test(r.directiveHash || "")) {
    violations.push(`directive hash "${r.directiveHash}" is not a 16-hex digest`);
  }
  if (!r.ts || isNaN(Date.parse(r.ts))) {
    violations.push(`timestamp "${r.ts}" is not ISO`);
  }
  if (r.status !== "dispatched") {
    violations.push(`unknown status "${r.status}" (expected "dispatched")`);
  }
  if (typeof r.message !== "string" || !r.message) {
    violations.push("missing directive message");
  } else {
    if (!r.message.includes(`subagent_type="${r.parentGod}"`)) {
      violations.push(`directive does not carry the curated subagent_type="${r.parentGod}"`);
    }
    if (r.parentGod !== "apollo" && r.message.includes('subagent_type="apollo"')) {
      violations.push('directive carries the generic subagent_type="apollo" default');
    }
  }
  return { ok: violations.length === 0, violations };
}

const dispatchTool: ToolDefinition = tool({
  description:
    "Dispatch to a demigod via the Symphony protocol. Composes a VibrationalSignature from the task, broadcasts it to the target demigod, and registers the dispatch with the VaultBrain capture pipeline. Symphony is the standard language between Gods and Demigods — there is no textual dispatch path. Demigods are unprefixed (e.g., 'build-resolver', 'code-verifier'). The target demigod is AUTO-INJECTED into opencode.json if not already present (loaded from opencode.demigods.json), so dispatch works in both GO-plan and free-tier modes.",
  args: {
    godId: tool.schema
      .string()
      .describe("Your god ID (e.g., 'hephaestus')."),
    demigod: tool.schema
      .string()
      .describe("The demigod to dispatch to (unprefixed, e.g., 'build-resolver', 'code-verifier', 'secrets-scanner'). The parent god is determined by the dispatch context. If the demigod is not yet loaded, it will be auto-injected from opencode.demigods.json."),
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
    budgetTokens: tool.schema
      .number()
      .optional()
      .describe("RLM P1 (budgeted recursion): the token budget for the demigod's work — relayed to the subtask as an explicit instruction and recorded on the dispatch so dispatch_outcome can report budget adherence (budget_tokens / budget_adherence). Optional; absent = unbounded, exactly as before."),
    outputShape: tool.schema
      .string()
      .optional()
      .describe("RLM P1 (handoff contract): one line describing the required output shape (e.g., 'verdict + max 3 findings lines'). Relayed to the subtask and recorded on the dispatch. Optional; absent = no explicit output contract."),
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
    budgetTokens?: number;
    outputShape?: string;
  }, context: { sessionID?: string }) => {
    // ─── ATLAS (MADRUGA-3 p2, Phase 1): the funnel comes FIRST ──────────
    // Every dispatch prompt is recorded by Atlas before anything else
    // happens for it — then the inner execute runs unchanged, and the
    // sync-map entry follows the outcome (routed on ok, failed otherwise).
    // An Atlas recording failure is LOUD but never blocks the dispatch:
    // the Part 1 spine's own registration gate (the L2 refusal) remains
    // the dispatch's authority — same doctrine as the chat.message ingest.
    let syncEntry = { id: "" };
    try {
      syncEntry = atlasIngestDispatch({
        godId: String(args.godId || "unknown"),
        demigod: String(args.demigod || "unknown"),
        task: String(args.task || ""),
        sessionID: context.sessionID,
      });
    } catch (e: any) {
      console.error(`[olympus] ATLAS dispatch-prompt ingest failed: ${e?.message || e}`);
    }
    let inner: { output: string };
    try {
      inner = await dispatchExecuteInner(args, context);
    } catch (e: any) {
      try {
        atlasMarkDispatchFailed(syncEntry.id, `tool threw: ${e?.message || e}`);
      } catch { /* never let the record path break the error */ }
      throw e;
    }
    try {
      const parsed = JSON.parse(inner.output) as Record<string, unknown>;
      if (parsed.ok === true && typeof parsed.dispatchId === "string" && typeof parsed.parentGod === "string") {
        if (syncEntry.id) atlasMarkDispatchRouted(syncEntry.id, {
          dispatchId: parsed.dispatchId,
          parentGod: parsed.parentGod,
          demigod: String(args.demigod || "unknown"),
        });
      } else if (parsed.ok !== true) {
        if (syncEntry.id) atlasMarkDispatchFailed(syncEntry.id, String(parsed.error || "dispatch refused"));
      }
    } catch { /* recording a failed transition never breaks the tool result */ }
    return inner;
  },
});

/**
 * The pre-Part-2 execute body, unchanged (R8: the Part 1 spine is
 * certified; the Atlas funnel wraps it without touching its logic).
 */
async function dispatchExecuteInner(args: {
  godId: string;
  demigod: string;
  task: string;
  skill?: string;
  mcp?: string;
  shortCircuit?: boolean;
  instinctId?: string;
  stack?: string;
  project?: string;
  budgetTokens?: number;
  outputShape?: string;
}, context: { sessionID?: string }): Promise<{ output: string }> {
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
      budgetTokens,
      outputShape,
    } = args;

    // Validate the demigod name — must NOT be prefixed (no ecc-, olympus-, volt-)
    const hasForbiddenPrefix = FORBIDDEN_PREFIXES.some(p => demigod.startsWith(p));
    if (hasForbiddenPrefix) {
      return {
        output: JSON.stringify({
          ok: false,
          error: `Invalid demigod name "${demigod}". Demigods are unprefixed (e.g., 'build-resolver', 'code-verifier'). Remove the '${demigod.split("-")[0]}-' prefix.`,
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

    // L3 (MADRUGA-3 p1): the invoke target is the registry-derived parent
    // god — ALWAYS real (ensureDemigodPresent validated it against GOD_IDS).
    // The generic "apollo" default is dead; a missing parent is a refusal.
    const parentGod = injectResult.parent_god;
    if (!parentGod || !GOD_IDS.has(parentGod)) {
      return {
        output: JSON.stringify({
          ok: false,
          error:
            `Cannot dispatch to "${demigod}": no curated parent god for the invoke directive ` +
            `(registry-derived parent missing or invalid: "${parentGod}"). The directive is ` +
            `never emitted with an uncurated invoke target.`,
        }, null, 2),
      };
    }

    // L2 (MADRUGA-3 p1): the dispatch REGISTERS ITSELF — single writer, full
    // rich context (signature id end-to-end, directive hash, status). An
    // unregistrable dispatch fails loudly and NEVER reports success.
    const directiveHash = createHash("sha256").update(task).digest("hex").slice(0, 16);
    try {
      registerOpenDispatch({
        dispatchId: signature.id,
        god: godId,
        demigod,
        instinctId: instinctId || null,
        shortCircuited: shortCircuit,
        skill: skill || null,
        mcp: mcp || null,
        taskSignature: task,
        classificationId: getClassificationId(context.sessionID),
        budgetTokens: typeof budgetTokens === "number" && Number.isFinite(budgetTokens) ? budgetTokens : null,
        outputShape: typeof outputShape === "string" && outputShape ? outputShape : null,
        stack: resolvedStack,
        project: resolvedProject,
        directiveHash,
      });
    } catch (err: any) {
      return {
        output: JSON.stringify({
          ok: false,
          error: `Dispatch not registered: ${err.message}`,
          godId,
          demigod,
          signatureId: signature.id,
        }, null, 2),
      };
    }

    // Log the dispatch to the activity feed — rich event for the VaultBrain
    // capture pipeline. L2 (MADRUGA-3 p1): this is the tool-side writer that
    // works even in one-shot spawns (the MADRUGA-2b D18 evidence) — an
    // unrecordable dispatch is REFUSED, never silently proceeded.
    const emissionTs = new Date().toISOString();
    try {
      const feedPath = path.join(VAULT_ROOT, "06_Activity_Feed", "live.jsonl");
      const dir = path.dirname(feedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const event = {
        ts: emissionTs,
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
        // RLM P1 (budgeted recursion): the handoff's budget + output
        // contract, stamped for the dispatch_outcome adherence report.
        budget_tokens: typeof budgetTokens === "number" && Number.isFinite(budgetTokens) ? budgetTokens : null,
        output_shape: typeof outputShape === "string" && outputShape ? outputShape : null,
        stack: resolvedStack,
        project: resolvedProject,
        signature_id: signature.id,
        vault_anchor: signature.vaultAnchor.anchorId,
        coherence_baseline: signature.coherenceBaseline,
        intent_hash: signature.intentVector.intentHash,
        economy_reduction: economyEstimate.projectedReduction,
        demigod_injection: injectResult.status,
        // L2 (MADRUGA-3 p1): the registry contract fields ride the event —
        // id, origin god, target, timestamp, directive hash, status.
        dispatch_id: signature.id,
        parent_god: parentGod,
        directive_hash: directiveHash,
        status: "dispatched",
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
          // Non-fatal — the MCP equip is an auxiliary convenience, not a
          // dispatch record; the god may have to re-equip the MCP on the
          // next dispatch if permission.ask denies.
        }
      }
    } catch (err: any) {
      // L2 (MADRUGA-3 p1): an unrecorded dispatch never reports success.
      return {
        output: JSON.stringify({
          ok: false,
          error: `Dispatch not recorded in the live feed: ${err.message}`,
          godId,
          demigod,
          dispatchId: signature.id,
        }, null, 2),
      };
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

    // RLM P1: relay the budget + output contract to the god IN-BAND, so the
    // instruction reaches the demigod's subtask even when only the message
    // text is passed on. Absent args produce no line (behavior identical).
    const budgetMessage =
      (typeof budgetTokens === "number" && Number.isFinite(budgetTokens)) || (typeof outputShape === "string" && outputShape)
        ? ` Budget: ${typeof budgetTokens === "number" && Number.isFinite(budgetTokens) ? `≤${budgetTokens} tokens` : "unspecified"}. Output shape: ${typeof outputShape === "string" && outputShape ? outputShape : "unspecified"}. Relay both to the subtask.`
        : "";

    // L3 (MADRUGA-3, D16): the SHORT directive. The long prose form
    // dropped the invoke instruction 3/3 on long prompts (the dilution
    // curve: minimal 2/2, medium 2/2, long 0/3) — the fully compliant
    // form is a compact, single-action directive. The invoke target is
    // the registry-curated parent god (delta-1's proven shape: the
    // madruga-2b probe-1 model composed subagent_type=<parent god>).
    const directiveMessage =
      `Dispatched: ${demigod} (parent: ${parentGod}).${injectMessage}${budgetMessage}` +
      ` NEXT ACTION (the only one): invoke the task tool with subagent_type="${parentGod}" and the task prompt. Do not build anything yourself first.`;

    // L4 (MADRUGA-3 p1): schema-validate the emission record BEFORE the
    // directive is emitted. An invalid record is refused, never emitted.
    const emission: DispatchEmissionRecord = {
      dispatchId: signature.id,
      god: godId,
      demigod,
      parentGod,
      signatureId: signature.id,
      vaultAnchor: signature.vaultAnchor.anchorId,
      intentHash: signature.intentVector.intentHash,
      directiveHash,
      ts: emissionTs,
      status: "dispatched",
      message: directiveMessage,
    };
    const validation = validateDispatchDirective(emission);
    if (!validation.ok) {
      return {
        output: JSON.stringify({
          ok: false,
          error:
            `Dispatch directive failed schema validation (never emitted): ` +
            validation.violations.join("; "),
          godId,
          demigod,
          signatureId: signature.id,
        }, null, 2),
      };
    }

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
        // L2/L3/L4 (MADRUGA-3 p1): the emission record — one id end-to-end,
        // registry-curated parent, verifiable directive hash, status.
        dispatchId: signature.id,
        parentGod,
        directiveHash,
        ts: emissionTs,
        status: "dispatched",
        message: directiveMessage,
        nextStep: `The demigod "${demigod}" is now available. OpenCode's task system can spawn it.`,
      }, null, 2),
    };
}

export default dispatchTool;
