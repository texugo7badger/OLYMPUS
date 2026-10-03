/**
 * Olympus Overlay Plugin Hooks — v3.0 VaultBrain
 *
 * This plugin is the Olympus overlay. It sits ON TOP of ECC's plugin and
 * superpowers, registering hooks that fire AFTER theirs. It provides:
 *
 *   - permission.ask: blocks Callimachus from writing outside ~/OLYMPUS-VAULT/
 *   - shell.env: injects OLYMPUS_* env vars into bash sessions
 *   - experimental.session.compacting: preserves overlay state across compaction
 *   - tool.execute.before: tracks the active agent (for god-scoped behavior)
 *   - tool.execute.after: CAPTURES every god → ECC dispatch in real time,
 *     attributes subsequent tool calls to the open dispatch, finalizes the
 *     dispatch with outcome + duration + tokens when the agent changes,
 *     and applies the immediate failure penalty to short-circuited instincts.
 *   - session.idle: fires Callimachus heartbeat (with lockfile) AND
 *     finalizes any lingering open dispatches.
 *
 * Custom tools registered:
 *   - olympus-instinct-query: god queries its instincts (+ patterns in v3.0)
 *   - olympus-shortcircuit: god reports a short-circuit hit
 *   - olympus-dispatch: god dispatches to a demigod with skill + MCP (Symphony-native)
 *
 *   - tool.execute.after captures RICH dispatch events with outcome,
 *     duration_ms, tokens_used, task_signature, instinct_id, etc.
 *   - The hook applies the failure penalty (confidence -= 0.3) in real time
 *     when a short-circuited dispatch produces an error.
 *   - The hook applies the success reward (successes++, samples++) in real
 *     time when a short-circuited dispatch succeeds.
 *   - Open dispatches are tracked in memory + persisted to
 *     ~/.olympus/dispatch-state.json for crash recovery.
 *
 * Design notes:
 *   - This plugin mirrors ECC's contract: async function returning a hook map.
 *   - It's registered as the THIRD plugin in opencode.json's plugin array
 *     (after ./plugins and superpowers), so its hooks run last.
 *   - For permission.ask: returns {approved: undefined} to defer to ECC + user
 *     EXCEPT when Callimachus tries to write outside the vault → {approved: false}.
 *   - For tool.execute.before: returns nothing (observational only — we cannot
 *     block here per the OpenCode plugin contract; use permission.ask for blocking).
 *   - The capture path is <2ms per call: one fs.appendFileSync of a single
 *     JSON line. All heavy processing happens in Callimachus's async heartbeat.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
  *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
*/

import type { PluginInput } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  initTracker,
  updateActiveAgent,
  getActiveAgent,
  clearActiveAgent,
  isInsideVault,
  type ActiveAgentState,
} from "./lib/active-agent-tracker.js";
import {
  initDispatchTracker,
  registerOpenDispatch,
  attributeToolCall,
  finalizeDispatchesForGod,
  clearAllDispatches,
  getOpenDispatches,
} from "./lib/dispatch-tracker.js";
import {
  penalizeInstinct,
  rewardInstinct,
} from "./lib/instinct-mutations.js";
// MCP API key gate.
import { isMcpApiKeyConfigured, mcpGateErrorMessage } from "./lib/mcp-gate.js";
import instinctQueryTool from "./tools/instinct-query.js";
import subAgentInstinctQueryTool from "./tools/sub-agent-instinct-query.js";
import shortcircuitTool from "./tools/shortcircuit.js";
import dispatchTool from "./tools/dispatch.js";
import patternsTool from "./tools/patterns.js";
// human-in-the-loop review tools.
// Imported and registered here — design-review (Athena), deploy-review
// (Prometheus), integration-review (Hermes). The interactive-terminal.tsx +
// /api/olympus/design-review route render the DesignReviewCard from the
// `design-review-requested` event these tools write to live.jsonl.
import designReviewTool from "./tools/design-review.js";
import deployReviewTool from "./tools/deploy-review.js";
import integrationReviewTool from "./tools/integration-review.js";
// Import the Symphony overlay tools so they are registered with OpenCode.
// SYMPHONY_TOOLS is exported from symphony-hooks.ts and imported here, so the
// three Symphony tools (symphony-resonate, symphony-harmonize, symphony-decode)
// are available to the gods. The opencode.json permissions for these tools
// resolve to the canonical tool names (the SYMPHONY_TOOLS array is ordered
// [resonate, harmonize, decode] — see symphony-hooks.ts:46-50 — and mapped by
// index in the registry block below). This wiring makes the Symphony's
// Composer/Orchestra/Choir endpoints reachable by the gods.
import { SYMPHONY_TOOLS } from "./symphony/symphony-hooks.js";

// ─── Paths ────────────────────────────────────────────────────────────────
const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), "OLYMPUS-VAULT");
const ACTIVITY_FEED = path.join(VAULT_ROOT, "06_Activity_Feed", "live.jsonl");
const CALLIMACHUS_LOCK = path.join(os.homedir(), ".olympus", "callimachus.lock");
// Per-god cost telemetry. Read by the cost dashboard
// (src/lib/olympus.ts readRealCosts) to render live spend per god.
// Without this feed, the dashboard shows $0.00 because no code path writes
// cost events. We approximate token counts from tool I/O (OpenCode's plugin
// contract doesn't expose per-call usage) and compute spend_usd from the
// active god's model pricing.
const METRICS_DIR = path.join(os.homedir(), ".olympus", "metrics");
const COST_FEED = path.join(METRICS_DIR, "cost.jsonl");

// Canonical 10-god set (Symphony-native: gods are identified by NAME, not
// by prefix). Used for cost attribution — a step-finish produced by a god
// message carries the god's name in the message agent field.
const GOD_NAMES = new Set([
  "apollo", "atlas", "artemis", "athena", "dionysus", "hephaestus",
  "hermes", "persephone", "prometheus", "callimachus",
]);

/**
 * Build a static demigod → parent-god map. Step-finish events carry the
 * demigod's hyphenated agent id (e.g. "build-resolver"); the dashboard
 * aggregates by god, so a demigod turn must roll up to its parent god.
 *
 * Authoritative source: opencode.demigods.json (hyphenated ids → parent_god).
 * Fallback: scan the prompt tree (underscore file names, normalized).
 */
function buildDemigodGodMap(worktree: string): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const regFile = path.join(worktree, "opencode.demigods.json");
    if (fs.existsSync(regFile)) {
      const reg = JSON.parse(fs.readFileSync(regFile, "utf-8"));
      const demigods = reg?.demigods;
      if (demigods && typeof demigods === "object") {
        for (const [id, entry] of Object.entries(demigods) as [string, any][]) {
          if (typeof entry?.parent_god === "string") map.set(id, entry.parent_god);
        }
        if (map.size > 0) return map;
      }
    }
  } catch {
    // Non-fatal — falls back to the prompt-tree scan
  }
  try {
    const base = path.join(worktree, ".opencode", "prompts", "agents", "demigods");
    if (!fs.existsSync(base)) return map;
    for (const godDir of fs.readdirSync(base, { withFileTypes: true })) {
      if (!godDir.isDirectory()) continue;
      const godDirPath = path.join(base, godDir.name);
      for (const f of fs.readdirSync(godDirPath)) {
        if (f.endsWith(".txt")) map.set(f.slice(0, -4).replace(/_/g, "-"), godDir.name);
      }
    }
  } catch {
    // Non-fatal — falls back to dispatch lookup / tracker state
  }
  return map;
}

/**
 * Resolve the god that produced a step-finish event.
 *
 * Priority:
 *   1. The message's own agent field — authoritative (a god's chat response
 *      with no tool calls never reaches tool.execute.before, so the tracker
 *      alone would misattribute it to "system").
 *   2. For demigod agents, the static demigod → parent-god map.
 *   3. The tracker's last-known god (e.g. the god that dispatched).
 *   4. "system" — truly system-level work (title generation, compaction).
 */
function resolveGodForStepFinish(
  msgAgent: string | undefined,
  state: ActiveAgentState,
  demigodMap: Map<string, string>,
): string {
  if (typeof msgAgent === "string" && msgAgent.trim()) {
    if (GOD_NAMES.has(msgAgent)) return msgAgent;
    const parent = demigodMap.get(msgAgent);
    if (parent) return parent;
    const dispatchGod = getOpenDispatches().find(d => d.demigod === msgAgent)?.god;
    if (dispatchGod) return dispatchGod;
  }
  return state.godId || "system";
}

/**
 * Issue #25: pick the agent a cost line belongs to, from the event itself.
 * Ladder: this event's agent → tracker's last-seen god → "global" (no model,
 * so no priced spend). Never "ecc": that phantom god resolved a model, so
 * unattributed spend was costed as though a real god had made it.
 */
type CostAttribution = { god: string; subagent: string | null; priced: boolean };

function resolveCostGod(
  eventAgent: string | undefined,
  state: ActiveAgentState,
  demigodMap: Map<string, string>,
): CostAttribution {
  if (typeof eventAgent === "string" && eventAgent.trim()) {
    const agent = eventAgent.trim();
    if (GOD_NAMES.has(agent)) return { god: agent, subagent: null, priced: true };
    const parent = demigodMap.get(agent);
    if (parent) return { god: parent, subagent: agent, priced: true };
    const dispatchGod = getOpenDispatches().find(d => d.demigod === agent)?.god;
    if (dispatchGod) return { god: dispatchGod, subagent: agent, priced: true };
  }
  if (state.godId) {
    const demigod = state.agentId && state.agentId !== state.godId ? state.agentId : null;
    return { god: state.godId, subagent: demigod, priced: true };
  }
  return { god: "global", subagent: null, priced: false };
}

// ─── Types ────────────────────────────────────────────────────────────────
interface ToolArgs {
  filePath?: string;
  file_path?: string;
  path?: string;
  command?: string;
  content?: string;
  [key: string]: unknown;
}

interface ToolInput {
  tool: string;
  callID?: string;
  args?: ToolArgs;
  agent?: string;
  /** Issue #25: the SDK types sessionID as required on both tool.execute
   *  hooks (verified in the shipped binary). `agent` is NOT on that payload. */
  sessionID?: string;
}

interface ToolOutput {
  ok?: boolean;
  error?: string | { message?: string };
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  [key: string]: unknown;
}

interface PermissionEvent {
  tool: string;
  args: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getFilePath(args: ToolArgs | undefined): string | null {
  if (!args) return null;
  const p = (args.filePath ?? args.file_path ?? args.path) as string | undefined;
  return typeof p === "string" && p.trim() ? p : null;
}

/**
 * Append a single JSON line to live.jsonl. <2ms per call.
 * Best-effort: never throws (the hook must not break the tool call it is observing).
 */
function appendActivityFeed(event: Record<string, unknown>): void {
  try {
    const dir = path.dirname(ACTIVITY_FEED);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const line = JSON.stringify(event) + "\n";
    fs.appendFileSync(ACTIVITY_FEED, line, "utf-8");
  } catch {
    // Non-fatal — the activity feed is best-effort
  }
}

/**
 * Per-god cost feed writer.
 *
 * Appends a single line of {ts, god, model, input_tokens, output_tokens,
 * cached_tokens, spend_usd, latency_ms, success, tool} to
 * ~/.olympus/metrics/cost.jsonl. Read by:
 *   - src/lib/olympus.ts readRealCosts()  → cost dashboard rows
 *   - src/app/api/olympus/god/dispatch-graph/route.ts getLiveGodCost()
 *     → live "Sub-agent routes" column in the cost dashboard
 *
 * Pricing is a flat approximation per the OpenCode GO plan; we don't try
 * to be exact because (a) OpenCode's plugin contract doesn't expose the
 * real per-call token usage, and (b) the GO plan is a flat subscription
 * ($10/mo) with caps — the dashboard is informational, not billing.
 *
 * Pricing table (USD per 1M tokens, summed input+output for spend):
 *   glm-5.2:            $0.42  (Apollo's reserved model)
 *   kimi-k3:            $0.55
 *   kimi-k2.7-code:     $0.30
 *   deepseek-v4-pro:    $0.27
 *   deepseek-v4-flash:  $0.07
 *   qwen3.7-plus:       $0.22
 *   grok-4.5:           $0.60
 *   minimax-m3:         $0.40
 *   mimo-v2.5:          $0.10
 *
 * These numbers match the published OpenCode rates and are conservative
 * (tiered models use the higher/peak tier) so the dashboard never
 * under-reports.
 *
 * Prices verified against https://opencode.ai/docs/go/ and
 * https://opencode.ai/docs/zen/ on 2026-09-28.
 */
const MODEL_PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  // OpenCode GO (https://opencode.ai/docs/go/, verified 2026-09-28).
  "opencode-go/glm-5.3":            { input: 1.40, output: 4.40 },
  "opencode-go/glm-5.3-flash":      { input: 0.15, output: 0.50 },
  "opencode-go/glm-5.2":            { input: 1.40, output: 4.40 },
  "opencode-go/kimi-k3":            { input: 3.00, output: 15.00 },
  "opencode-go/kimi-k2.7-code":     { input: 0.95, output: 4.00 },
  "opencode-go/minimax-m3":         { input: 0.30, output: 1.20 },
  "opencode-go/qwen3.7-plus":       { input: 0.40, output: 1.60 },
  "opencode-go/hy3":                { input: 0.14, output: 0.58 },
  "opencode-go/deepseek-v4-flash":  { input: 0.30, output: 1.20 },
  "opencode-go/deepseek-v4-pro":    { input: 1.32, output: 3.96 },
  "opencode-go/deepseek-v4.1-flash":{ input: 0.30, output: 1.20 },
  "opencode-go/grok-4.7":           { input: 4.00, output: 12.00 },
  "opencode-go/grok-4.6":           { input: 4.00, output: 12.00 },
  "opencode-go/grok-4.5":           { input: 4.00, output: 12.00 },
  "opencode-go/mimo-v2.5":          { input: 0.14, output: 0.28 },
  // OpenCode Zen (pay-as-you-go) — published per-1M rates
  // (https://opencode.ai/docs/zen/, verified 2026-09-28).
  "opencode/glm-5.3":               { input: 1.40, output: 4.40 },
  "opencode/glm-5.3-flash":         { input: 0.15, output: 0.50 },
  "opencode/glm-5.2":               { input: 1.40, output: 4.40 },
  "opencode/kimi-k3":               { input: 3.00, output: 15.00 },
  "opencode/kimi-k2.7-code":        { input: 0.95, output: 4.00 },
  "opencode/deepseek-v4-pro":       { input: 1.74, output: 3.48 },
  "opencode/deepseek-v4-flash":     { input: 0.14, output: 0.28 },
  "opencode/deepseek-v4.1-flash":   { input: 0.30, output: 1.20 },
  "opencode/qwen3.7-plus":          { input: 0.40, output: 1.60 },
  "opencode/qwen3.7-max":           { input: 2.50, output: 7.50 },
  "opencode/qwen3.8-max":           { input: 2.00, output: 6.00 },
  "opencode/qwen3.8-flash":         { input: 0.15, output: 0.47 },
  "opencode/grok-4.7":              { input: 4.00, output: 12.00 },
  "opencode/grok-4.6":              { input: 4.00, output: 12.00 },
  "opencode/grok-4.5":              { input: 2.00, output: 6.00 },
  "opencode/grok-build-0.1":        { input: 1.00, output: 2.00 },
  "opencode/minimax-m3":            { input: 0.30, output: 1.20 },
  "opencode/minimax-m2.7":          { input: 0.30, output: 1.20 },
  "opencode/gemini-3.1-pro":        { input: 4.00, output: 18.00 },
  "opencode/gemini-3.5-flash":      { input: 1.50, output: 9.00 },
  "opencode/claude-sonnet-5":       { input: 2.00, output: 10.00 },
  "opencode/claude-haiku-4-5":      { input: 1.00, output: 5.00 },
  "opencode/gpt-6-sol":             { input: 4.00, output: 15.00 },
  "opencode/gpt-6-luna":            { input: 0.20, output: 0.75 },
  "opencode/gpt-5.6-terra":         { input: 4.00, output: 18.00 },
  "opencode/gpt-5.6-luna":          { input: 0.40, output: 1.80 },
  "opencode/gpt-5.4-mini":          { input: 0.75, output: 4.50 },
};

/**
 * Read the active LLM strategy id from ~/.olympus/llm-providers.json
 * (the file apply-strategy.js writes). Falls back to go-balanced.
 */
function readActiveStrategy(): string {
  try {
    const providersFile = path.join(os.homedir(), ".olympus", "llm-providers.json");
    if (fs.existsSync(providersFile)) {
      const cfg = JSON.parse(fs.readFileSync(providersFile, "utf-8"));
      return typeof cfg.strategy === "string" ? cfg.strategy : "go-balanced";
    }
  } catch {
    // Non-fatal — fall through to the default.
  }
  return "go-balanced";
}

/**
 * Resolve the model for a given god from the active LLM strategy.
 * Reads ~/.olympus/llm-providers.json (same file the apply-strategy.js
 * script uses). Falls back to go-balanced defaults.
 */
function getGodModel(godId: string): string {
  try {
    const providersFile = path.join(os.homedir(), ".olympus", "llm-providers.json");
    if (fs.existsSync(providersFile)) {
      const cfg = JSON.parse(fs.readFileSync(providersFile, "utf-8"));
      const strategy: string = cfg.strategy || "go-balanced";
      // MIRROR of src/lib/model-strategies.ts.
      // Do NOT edit by hand — update the canonical file and run `npm run check-strategy-sync`.
      // Enforced by scripts/check-strategy-sync.js in CI.
      // Inline the strategy map (mirror of scripts/apply-strategy.js
      // BUILTIN_STRATEGIES — kept short to avoid bloating the plugin).
      const STRATEGY_GODS: Record<string, Record<string, string>> = {
        "go-max-quality": {
          apollo:       "opencode-go/glm-5.3",
          atlas:        "opencode-go/hy3",
          artemis:      "opencode-go/glm-5.3",
          athena:       "opencode-go/glm-5.3-flash",
          dionysus:     "opencode-go/glm-5.3-flash",
          hephaestus:   "opencode-go/kimi-k2.7-code",
          hermes:       "opencode-go/kimi-k2.7-code",
          persephone:   "opencode-go/glm-5.3-flash",
          prometheus:   "opencode-go/minimax-m3",
          callimachus:  "opencode-go/glm-5.3-flash",
        },
        "go-balanced": {
          apollo:       "opencode-go/glm-5.3-flash",
          atlas:        "opencode-go/hy3",
          artemis:      "opencode-go/glm-5.3-flash",
          athena:       "opencode-go/qwen3.7-plus",
          dionysus:     "opencode-go/glm-5.3-flash",
          hephaestus:   "opencode-go/kimi-k2.7-code",
          hermes:       "opencode-go/kimi-k2.7-code",
          persephone:   "opencode-go/qwen3.7-plus",
          prometheus:   "opencode-go/minimax-m3",
          callimachus:  "opencode-go/glm-5.3-flash",
        },
        "go-budget": {
          apollo:       "opencode-go/glm-5.3-flash",
          atlas:        "opencode-go/hy3",
          artemis:      "opencode-go/glm-5.3-flash",
          athena:       "opencode-go/glm-5.3-flash",
          dionysus:     "opencode-go/glm-5.3-flash",
          hephaestus:   "opencode-go/glm-5.3-flash",
          hermes:       "opencode-go/glm-5.3-flash",
          persephone:   "opencode-go/glm-5.3-flash",
          prometheus:   "opencode-go/glm-5.3-flash",
          callimachus:  "opencode-go/glm-5.3-flash",
        },
        "zen-max-quality": {
          apollo:       "opencode/glm-5.3",
          atlas:        "opencode/gpt-6-sol",
          artemis:      "opencode/claude-sonnet-5",
          athena:       "opencode/gpt-5.6-terra",
          dionysus:     "opencode/gpt-5.6-luna",
          hephaestus:   "opencode/claude-sonnet-5",
          hermes:       "opencode/claude-sonnet-5",
          persephone:   "opencode/gemini-3.1-pro",
          prometheus:   "opencode/grok-build-0.1",
          callimachus:  "opencode/claude-haiku-4-5",
        },
        "zen-balanced": {
          apollo:       "opencode/glm-5.3",
          atlas:        "opencode/gpt-6-sol",
          artemis:      "opencode/claude-sonnet-5",
          athena:       "opencode/gpt-5.6-terra",
          dionysus:     "opencode/gpt-5.6-luna",
          hephaestus:   "opencode/claude-sonnet-5",
          hermes:       "opencode/gpt-5.4-mini",
          persephone:   "opencode/gemini-3.1-pro",
          prometheus:   "opencode/grok-build-0.1",
          callimachus:  "opencode/claude-haiku-4-5",
        },
        "zen-budget": {
          apollo:       "opencode/glm-5.3",
          atlas:        "opencode/gpt-6-luna",
          artemis:      "opencode/glm-5.3-flash",
          athena:       "opencode/glm-5.3-flash",
          dionysus:     "opencode/glm-5.3-flash",
          hephaestus:   "opencode/glm-5.3-flash",
          hermes:       "opencode/glm-5.3-flash",
          persephone:   "opencode/glm-5.3-flash",
          prometheus:   "opencode/glm-5.3-flash",
          callimachus:  "opencode/claude-haiku-4-5",
        },
        "free-big-pickle": {
          apollo:       "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          atlas:        "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          artemis:      "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          athena:       "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          dionysus:     "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          hephaestus:   "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          hermes:       "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          persephone:   "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          prometheus:   "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          callimachus:  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
        },
        "free-openrouter": {
          apollo:       "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          atlas:        "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          artemis:      "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
          athena:       "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
          dionysus:     "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
          hephaestus:   "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
          hermes:       "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
          persephone:   "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
          prometheus:   "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
          callimachus:  "openrouter/nvidia/nemotron-3-nano-30b-a3b:free",
        },
        "free-nvidia-build": {
          apollo:       "nvidia/nvidia/nemotron-3-ultra-550b-a55b",
          atlas:        "nvidia/nvidia/nemotron-3-ultra-550b-a55b",
          hephaestus:   "nvidia/z-ai/glm-5.2",
          athena:       "nvidia/z-ai/glm-5.2",
          dionysus:     "nvidia/z-ai/glm-5.2",
          artemis:      "nvidia/z-ai/glm-5.2",
          hermes:       "nvidia/z-ai/glm-5.2",
          persephone:   "nvidia/z-ai/glm-5.2",
          prometheus:   "nvidia/z-ai/glm-5.2",
          callimachus:  "nvidia/nvidia/nemotron-3-nano-30b-a3b",
        },
      };
      const models = STRATEGY_GODS[strategy] || STRATEGY_GODS["go-balanced"];
      // Per-god overrides (from the Settings dialog) take precedence.
      const override = cfg.per_god_overrides?.[godId]?.class;
      return override || models[godId] || "opencode-go/deepseek-v4-flash";
    }
  } catch {
    // fall through
  }
  return "opencode-go/deepseek-v4-flash";
}

/**
 * Estimate spend_usd for a single tool call given the god's model and
 * the input/output token estimate. Used by the cost.jsonl writer below.
 */
function estimateSpendUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING_USD_PER_1M[model];
  if (!pricing) return 0;
  const inCost = (inputTokens / 1_000_000) * pricing.input;
  const outCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inCost + outCost) * 1_000_000) / 1_000_000; // 6dp
}

/**
 * Append a cost event to ~/.olympus/metrics/cost.jsonl. Called from
 * tool.execute.after for every tool call. Best-effort — never throws.
 *
 * Schema (matches what src/lib/olympus.ts readRealCosts reads):
 *   {
 *     "ts": ISO timestamp,
 *     "god": godId,
 *     "model": "opencode-go/<model-id>",
 *     "tool": "write" | "edit" | "bash" | "read" | ...,
 *     "input_tokens": int,
 *     "output_tokens": int,
 *     "cached_tokens": 0,  // we can't detect cache hits from the plugin layer
 *     "spend_usd": float,
 *     "latency_ms": null,  // not measured at this layer; tool.execute.after
 *                          // fires after completion, so we don't have a start ts
 *     "success": true | false,
 *     "subagent": string | null  // the active sub-agent (if any)
 *   }
 *
 * The `subagent` field carries the active demigod ID so the cost-dashboard's
 * per-demigod cost breakdown can attribute spend to specific demigods. The
 * schema also logs `god` for the god-level breakdown; `subagent` is null for
 * god-level calls and set for demigod calls.
 */
function appendCostFeed(input: {
  god: string;
  model: string;
  tool: string;
  tokens: { input: number; output: number };
  success: boolean;
  subagent?: string | null;
  sessionId?: string | null;
}): void {
  try {
    if (!fs.existsSync(METRICS_DIR)) {
      fs.mkdirSync(METRICS_DIR, { recursive: true });
    }
    const spend = estimateSpendUsd(input.model, input.tokens.input, input.tokens.output);
    const event = {
      ts: new Date().toISOString(),
      god: input.god,
      model: input.model,
      tool: input.tool,
      input_tokens: input.tokens.input,
      output_tokens: input.tokens.output,
      cached_tokens: 0, // plugin layer can't detect cache hits
      spend_usd: spend,
      latency_ms: null, // not measured here; tool.execute.after is post-completion
      success: input.success,
      // Demigod attribution. Null when the tool was called directly by the
      // god (not via a dispatch). When non-null, this is the demigod that
      // was active when the tool fired.
      subagent: input.subagent ?? null,
      // Issue #25: makes a cost line sliceable to its run. Appended LAST so
      // pre-existing lines keep their shape; old lines have no such field.
      session_id: input.sessionId ?? null,
    };
    fs.appendFileSync(COST_FEED, JSON.stringify(event) + "\n", "utf-8");
  } catch {
    // Non-fatal — cost feed is best-effort
  }
}

/**
 * Detect whether a tool output represents an error. Heuristics:
 *   - { ok: false, error: ... }
 *   - bash: exitCode != 0
 *   - write/edit: error field present
 *   - String output containing "Error:" or "error:" at the start
 */
function isToolOutputError(tool: string, output: unknown): boolean {
  if (!output) return false;
  if (typeof output === "string") {
    return /^\s*(Error|error|ERROR):/.test(output) || /command not found/.test(output);
  }
  const o = output as ToolOutput;
  if (o.ok === false) return true;
  if (o.error) return true;
  if (tool === "bash") {
    if (typeof o.exitCode === "number" && o.exitCode !== 0) return true;
    if (typeof o.stderr === "string" && /error|failed|not found/i.test(o.stderr)) return true;
  }
  return false;
}

/**
 * Estimate tokens used by a tool call. This is a rough heuristic since
 * OpenCode does not expose per-call token usage in the hook context.
 * Returns {input, output} estimates.
 *
 * Heuristics:
 *   - write/edit: input = content length / 4, output = 0
 *   - bash: input = command length / 4, output = stdout length / 4
 *   - read: input = 0, output = file size / 4 (capped at 32K)
 *   - default: input = 100, output = 100 (placeholder)
 *
 * The 4-chars-per-token ratio is the standard approximation for English text.
 */
function estimateTokens(tool: string, input: ToolInput, output: unknown): { input: number; output: number } {
  try {
    if (tool === "write" || tool === "edit") {
      const content = String(input.args?.content ?? "");
      return { input: Math.ceil(content.length / 4), output: 0 };
    }
    if (tool === "bash") {
      const cmd = String(input.args?.command ?? "");
      const stdout = typeof output === "object" && output !== null
        ? String((output as ToolOutput).stdout ?? "")
        : String(output ?? "");
      return {
        input: Math.ceil(cmd.length / 4),
        output: Math.ceil(Math.min(stdout.length, 32000) / 4),
      };
    }
    if (tool === "read") {
      const fp = getFilePath(input.args);
      if (fp && fs.existsSync(fp)) {
        const size = fs.statSync(fp).size;
        return { input: 0, output: Math.ceil(Math.min(size, 32000) / 4) };
      }
      return { input: 0, output: 0 };
    }
  } catch {
    // fall through to default
  }
  return { input: 100, output: 100 };
}

/**
 * Try to acquire Callimachus lock. Returns true if acquired, false if already held.
 */
function acquireCallimachusLock(): boolean {
  try {
    if (!fs.existsSync(path.dirname(CALLIMACHUS_LOCK))) {
      fs.mkdirSync(path.dirname(CALLIMACHUS_LOCK), { recursive: true });
    }
    // Check if lock exists and is stale (> 10 minutes old)
    if (fs.existsSync(CALLIMACHUS_LOCK)) {
      const stat = fs.statSync(CALLIMACHUS_LOCK);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs < 10 * 60 * 1000) {
        return false; // Lock held by another process
      }
      // Stale lock — remove it
      fs.unlinkSync(CALLIMACHUS_LOCK);
    }
    // Create the lock
    fs.writeFileSync(CALLIMACHUS_LOCK, JSON.stringify({
      pid: process.pid,
      ts: new Date().toISOString(),
    }), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Release Callimachus lock.
 */
function releaseCallimachusLock(): void {
  try {
    if (fs.existsSync(CALLIMACHUS_LOCK)) {
      fs.unlinkSync(CALLIMACHUS_LOCK);
    }
  } catch {
    // Non-fatal
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────

type OlympusHooksPluginFn = (input: PluginInput) => Promise<Record<string, unknown>>;

/**
 * Custom tools registered by the Olympus overlay.
 *
 * Hoisted to module scope (session 3g) so the managed-process gate below can
 * hand out the tools without re-declaring them — one source of truth, no
 * duplicated tool map.
 *
 * Adds olympus-patterns for cross-god dispatch chain queries.
 *
 * Register the Symphony overlay tools (symphony-resonate,
 * symphony-harmonize, symphony-decode) so they are available to the gods.
 * SYMPHONY_TOOLS is exported from symphony-hooks.ts and imported here; the
 * array is ordered [resonate, harmonize, decode] (see
 * symphony-hooks.ts:46-50) and we map by index to the canonical tool names.
 * The opencode.json permissions for these tools resolve to the canonical
 * names.
 */
const OLYMPUS_TOOLS = {
  "olympus-instinct-query": instinctQueryTool,
  "olympus-shortcircuit": shortcircuitTool,
  "olympus-dispatch": dispatchTool,
  "olympus-patterns": patternsTool,
  "sub-agent-instinct-query": subAgentInstinctQueryTool,
  // human-in-the-loop review tools.
  // olympus-design-review (Athena), olympus-deploy-review (Prometheus),
  // olympus-integration-review (Hermes). The interactive-terminal.tsx +
  // /api/olympus/design-review route render the DesignReviewCard from the
  // `design-review-requested` event these tools write to live.jsonl.
  "olympus-design-review": designReviewTool,
  "olympus-deploy-review": deployReviewTool,
  "olympus-integration-review": integrationReviewTool,
  // Symphony overlay tools.
  "symphony-resonate": SYMPHONY_TOOLS[0],
  "symphony-harmonize": SYMPHONY_TOOLS[1],
  "symphony-decode": SYMPHONY_TOOLS[2],
};

export const OlympusHooksPlugin: OlympusHooksPluginFn = async ({
  client,
  $,
  directory,
  worktree,
}: PluginInput) => {
  const worktreePath = worktree || directory;

  // ─── Managed-process gate (session 3g, issue #25) ────────────────────────
  // This plugin is registered at PROJECT level (.opencode/olympus/), so
  // opencode loads it in EVERY process started inside this repo — including
  // Zed's external agent (pid 38014, its own ACP process on its own port) and
  // manual CLI runs. Metrics capture is MACHINE-GLOBAL
  // (~/.olympus/metrics/cost.jsonl), and the god for each cost entry comes
  // from the global active-agent tracker, so a foreign run's spend was
  // attributed to whatever god OLYMPUS happened to be running. That is issue
  // #25.
  //
  // OLYMPUS marks only the processes it spawns, via OLYMPUS_MANAGED=1 in
  // buildOpencodeEnv (src/lib/opencode-spawn.ts) — the single injection point
  // for every OLYMPUS-spawned opencode. Anything else leaves the flag unset.
  //
  // The gate returns BEFORE any tracker is initialized and before any hook is
  // registered, which silences every side effect at once:
  //   • cost.jsonl appends            (appendCostFeed, :541 / :909)
  //   • active-agent.json reads       (getActiveAgent, god attribution)
  //   • ctx% / session-state writes   (session.created / session.deleted)
  //   • VaultBrain instinct mutations (penalize/reward, session.idle)
  //   • the session.idle heartbeat    (Callimachus)
  //   • dispatch-tracker registration (registerOpenDispatch)
  // None of these can run without the returned hooks, and initTracker() only
  // loads persisted state into memory — it never writes — so returning here
  // leaves ~/.olympus completely untouched.
  //
  // The tool map is still returned: those tools are MCP-backed and useful in
  // any client, and withholding them would silently strip Zed's capabilities
  // — a change well beyond cost attribution.
  if (process.env.OLYMPUS_MANAGED !== '1') {
    return { tool: OLYMPUS_TOOLS };
  }

  // Initialize the active-agent tracker + dispatch tracker
  initTracker();
  initDispatchTracker();

  // Static demigod → parent-god map for cost attribution (step-finish
  // events carry the demigod name; the dashboard aggregates by god).
  const demigodGodMap = buildDemigodGodMap(worktreePath);

  // Issue #25: the tool payload has no `agent`, but the bus does — every
  // message.part.updated carries the owning Message (info.agent) plus the same
  // callID the tool hook reports. Bounded, or a long session would grow it.
  const callAgentByCallId = new Map<string, string>();
  const rememberCallAgent = (callID: unknown, agent: unknown): void => {
    if (typeof callID !== "string" || !callID) return;
    if (typeof agent !== "string" || !agent) return;
    callAgentByCallId.delete(callID);
    callAgentByCallId.set(callID, agent);
    if (callAgentByCallId.size > 512) {
      const oldest = callAgentByCallId.keys().next();
      if (!oldest.done) callAgentByCallId.delete(oldest.value);
    }
  };

  // Track the last-seen agent so we can detect agent transitions
  let lastAgentId: string | null = null;

  // Issue #51: sessions running in unattended mode (detected via the
  // [OLYMPUS UNATTENDED MODE] in-band marker — see the chat.message hook
  // below for why in-band and not env). Dedupes the telemetry event per
  // session and lets future code-side gates key off it.
  const unattendedSessions = new Set<string>();

  const log = (level: "debug" | "info" | "warn" | "error", message: string) =>
    client.app.log({ body: { service: "olympus", level, message } });

  log("info", "[Olympus] Overlay plugin loaded — VaultBrain v3.0 capture pipeline active");

  return {
    /**
     * Permission Hook — scope Callimachus to ~/OLYMPUS-VAULT/** + MCP API key gate.
     */
    "permission.ask": async (event: PermissionEvent) => {
      const state = getActiveAgent();
      // MCP API key gate.
      // If the tool is an MCP tool (prefix "mcp_"), check whether the MCP
      // server's required API key(s) are configured. If not, BLOCK the call
      // with a user-facing message pointing to Settings → API Keys.
      //
      // This runs BEFORE the Callimachus scope check below — MCP gating
      // applies to all gods (including Callimachus, though Callimachus has
      // an empty MCP allowlist so this is a no-op for it).
      if (typeof event.tool === "string" && event.tool.startsWith("mcp_")) {
        // Extract the MCP server name from the tool name. MCP tool names
        // follow the convention `mcp_<server>_<tool>` (e.g. mcp_github_create_issue).
        // The server name is everything between "mcp_" and the last "_".
        const withoutPrefix = event.tool.slice(4);
        const lastUnderscore = withoutPrefix.lastIndexOf("_");
        const serverName = lastUnderscore > 0
          ? withoutPrefix.slice(0, lastUnderscore)
          : withoutPrefix;
        const gate = isMcpApiKeyConfigured(serverName);
        if (!gate.configured) {
          const msg = mcpGateErrorMessage(serverName, gate.missing);
          log("warn", `[Olympus] BLOCKED MCP call — ${msg}`);
          return { approved: false, reason: msg };
        }
      }

      if (!state.isCallimachus) {
        return { approved: undefined };
      }
      if (event.tool === "write" || event.tool === "edit") {
        const filePath = getFilePath(event.args as ToolArgs | undefined);
        if (filePath && !isInsideVault(filePath)) {
          log("warn", `[Olympus] BLOCKED Callimachus write outside vault: ${filePath}`);
          return {
            approved: false,
            reason: `Callimachus is scoped to ~/OLYMPUS-VAULT/**. Refused write to: ${filePath}`,
          };
        }
      }
      return { approved: undefined };
    },

    /**
     * Shell Environment Hook — inject OLYMPUS_* env vars
     */
    "shell.env": async () => {
      const state = getActiveAgent();
      const env: Record<string, string> = {
        OLYMPUS_PLUGIN: "true",
        OLYMPUS_VAULT_ROOT: VAULT_ROOT,
        OLYMPUS_WORKTREE: worktreePath,
        OLYMPUS_ACTIVE_AGENT: state.agentId || "",
        OLYMPUS_ACTIVE_GOD: state.godId || "",
        OLYMPUS_IS_CALLIMACHUS: state.isCallimachus ? "true" : "false",
        OLYMPUS_VAULTBRAIN_VERSION: "3.0",
      };
      try {
        env.OLYMPUS_STRATEGY = readActiveStrategy();
      } catch {
        // Non-fatal
      }
      return env;
    },

    /**
     * Session Compacting Hook — preserve overlay state across compaction.
     * Includes open dispatch state so the post-compaction context knows what
     * the god was doing.
     */
    "experimental.session.compacting": async () => {
      const state = getActiveAgent();
      const openDispatches = getOpenDispatches();
      const activeStrategy = readActiveStrategy();
      const modelDiscipline =
        activeStrategy.startsWith("go-")
          ? "GO plan models only — no ZEN, no free-tier, no BYO-key."
          : activeStrategy.startsWith("zen-")
            ? "OpenCode Zen pay-as-you-go models."
            : activeStrategy.startsWith("free-")
              ? "Free-tier models on the active free provider (OpenRouter / Groq / NVIDIA Build)."
              : `Active strategy: ${activeStrategy}.`;
      const contextBlock = [
        "# Olympus Overlay Context (preserve across compaction)",
        "",
        "## Active Agent",
        `- Agent ID: ${state.agentId || "(none)"}`,
        `- God: ${state.godId || "(none)"}`,
        `- Is Callimachus: ${state.isCallimachus}`,
        "",
        "## Olympus Operating Principles",
        `- Active strategy: ${activeStrategy} — ${modelDiscipline}`,
        "- Apollo is primary. All other agents are subagents.",
        "- GLM-5.3 is reserved for Apollo and Artemis (GO strategies).",
        "- Caveman is per-god: never (Apollo, Athena), lite (Artemis), full (others + Callimachus).",
        "- Demigods preserve their own strategic-compact skill.",
        "",
        "## VaultBrain v3.0",
        "- Capture: tool.execute.after hook writes rich dispatch events to live.jsonl.",
        "- Confidence: Bayesian-ish from success_rate * sqrt(samples)/(1+sqrt(samples)).",
        "- Failure penalty: confidence -= 0.3 immediately on short-circuit failure.",
        "- Short-circuit threshold: confidence >= 0.85.",
        "- Verification sampling: 1-in-10 short-circuits forced to re-deliberate.",
        "- Cross-god patterns: LINK stage writes to 05_Auto_Learning/patterns/.",
        "",
        "## Open Dispatches (in-flight)",
        ...openDispatches.map(d =>
          `- ${d.god} → ${d.demigod} (instinct: ${d.instinctId || "none"}, short_circuit: ${d.shortCircuited}, started: ${d.startTs})`,
        ),
        "",
        "## Vault Location",
        `- Root: ${VAULT_ROOT}`,
        `- Activity feed: ${ACTIVITY_FEED}`,
        "",
      ];

      return {
        context: contextBlock.join("\n"),
        compaction_prompt: "Preserve: 1) Active agent + god identity, 2) Current task + progress, 3) Instinct short-circuits fired this session, 4) Open dispatches + their outcomes so far, 5) Files touched. Discard: verbose tool outputs, intermediate exploration.",
      };
    },

    /**
     * Pre-Tool Hook — track the active agent + detect agent transitions.
     *
     * On transition (agent changed since last call), finalize any open
     * dispatches for the previous god. This is how we know a dispatch is
     * "done" — the god stopped calling tools and Apollo (or another god)
     * took over.
     */
    "tool.execute.before": async (input: ToolInput) => {
      updateActiveAgent({
        agentId: input.agent,
        tool: input.tool,
        args: input.args,
      });

      // Detect agent transition → finalize previous god's open dispatches
      const state = getActiveAgent();
      const currentAgent = state.agentId;
      if (lastAgentId && lastAgentId !== currentAgent) {
        // Agent changed. If the previous agent was a demigod (not a god),
        // finalize the dispatches for the god that owns it.
        // Symphony-native: gods are identified by the GOD_NAMES set, not by
        // prefix. Demigods are unprefixed (e.g., 'build-resolver').
        const wasDemigod = lastAgentId && !GOD_NAMES.has(lastAgentId);
        if (wasDemigod) {
          // Resolve the parent god of the departing demigod before finalizing.
          // Calling finalizeDispatchesForGod(null, ...) finalizes ALL gods'
          // open dispatches (the null godId means "no filter") — a silent
          // double-close bug that misattributes still-running dispatches as
          // "unknown" (e.g. a demigod under Hephaestus finishing while Athena
          // and Artemis still have open dispatches). We search the open
          // dispatches for a match on the demigod name, then pass THAT god ID
          // (not null) so only the relevant god's dispatches are finalized.
          const openDispatches = getOpenDispatches();
          const parentGod = openDispatches.find(d => d.demigod === lastAgentId)?.god || null;
          finalizeDispatchesForGod(parentGod, (d, outcome) => {
            // Apply real-time rewards/penalties for short-circuited dispatches
            if (!d.shortCircuited || !d.instinctId) return;
            if (outcome === "failure") {
              penalizeInstinct(d.instinctId, d.god);
              log("info", `[Olympus] VaultBrain: penalized instinct ${d.instinctId} (god=${d.god}) by 0.3 for short-circuit failure`);
            } else if (outcome === "success") {
              rewardInstinct(d.instinctId, d.god);
              log("debug", `[Olympus] VaultBrain: rewarded instinct ${d.instinctId} (god=${d.god}) for short-circuit success`);
            }
          });
        }
      }
      lastAgentId = currentAgent;
    },

    /**
     * Post-Tool Hook — the VaultBrain v3.0 capture pipeline.
     *
     * For EVERY tool call, this hook:
     *   1. Attributes the call to any open dispatch for the active god
     *      (updates token counts, error flag).
     *   2. For `olympus-dispatch` tool calls: registers a new open
     *      dispatch with the full rich context (god, demigod, instinct_id,
     *      short_circuited, skill, mcp, task_signature, stack, project).
     *   3. For `olympus-shortcircuit` tool calls: the shortcircuit tool
     *      itself updates the instinct's stats; this hook just logs it.
     *   4. For `write`/`edit`/`bash`/`read` calls: logs to live.jsonl with
     *      the active dispatch context (so the brain knows which dispatch
     *      produced which tool calls).
     *   5. For error outputs on `bash`/`write`/`edit`: marks the active
     *      dispatch as having an error (which will flip the outcome to
     *      "failure" when the dispatch is finalized).
     */
    "tool.execute.after": async (input: ToolInput, output: unknown) => {
      const state = getActiveAgent();
      const isError = isToolOutputError(input.tool, output);
      const tokens = estimateTokens(input.tool, input, output);

      // Issue #25: attribute to the agent that made THIS call. input.agent is
      // honoured when present; else the bus-recorded agent for this callID.
      const eventAgent = input.agent
        || (input.callID ? callAgentByCallId.get(input.callID) : undefined);
      const { god: godId, subagent: subagentId, priced } = resolveCostGod(
        eventAgent, state, demigodGodMap,
      );

      // Write a per-god cost event to cost.jsonl so the Cost Dashboard can
      // render live spend. This is best-effort: if the file isn't writable
      // (read-only fs, permission denied), we silently skip — the activity
      // feed above is the source of truth for dispatch attribution;
      // cost.jsonl is purely a UI aggregation.
      //
      // Skip pure-meta tools (olympus-dispatch / olympus-shortcircuit /
      // olympus-instinct-query) — they carry no real token usage and would
      // double-count if we also wrote them here.
      if (input.tool !== "olympus-dispatch"
          && input.tool !== "olympus-shortcircuit"
          && input.tool !== "olympus-instinct-query"
          && input.tool !== "sub-agent-instinct-query"
          && input.tool !== "olympus-patterns") {
        // No model to price against: estimating one would invent spend.
        const model = priced ? getGodModel(godId) : "unknown";
        appendCostFeed({
          god: godId,
          model,
          tool: input.tool,
          tokens,
          success: !isError,
          subagent: subagentId,
          sessionId: input.sessionID ?? null,
        });
      }

      // Everything below attributes to the ACTIVE dispatch and still needs one;
      // the cost line above does not — an unattributed call is worth recording
      // under "global" rather than dropping on the floor.
      if (!state.agentId) return;

      // ─── Handle olympus-dispatch: register an open dispatch ─────────
      if (input.tool === "olympus-dispatch" && input.args) {
        const args = input.args as any;
        const taskSignature = String(args.task ?? "").slice(0, 500);
        // Symphony-native: the arg is `demigod` (unprefixed), not `eccAgent`.
        const demigod = String(args.demigod ?? args.eccAgent ?? "");
        const skill = args.skill ? String(args.skill) : null;
        const mcp = args.mcp ? String(args.mcp) : null;
        const shortCircuited = args.shortCircuit === true;
        const instinctId = args.instinctId ? String(args.instinctId) : null;
        const dispatchGod = args.godId ? String(args.godId) : godId;

        // Extract stack/project from env (set by shell.env) or args
        const stack = (process.env.OLYMPUS_ACTIVE_STACK || null);
        const project = (process.env.OLYMPUS_ACTIVE_PROJECT || null);

        registerOpenDispatch({
          dispatchId: input.callID || `${dispatchGod}-${demigod}-${Date.now()}`,
          god: dispatchGod,
          demigod,
          instinctId,
          shortCircuited,
          skill,
          mcp,
          taskSignature,
          stack,
          project,
        });

        appendActivityFeed({
          ts: new Date().toISOString(),
          god: dispatchGod,
          action: "dispatch",
          task_signature: taskSignature,
          demigod: demigod,
          skill_equipped: skill,
          mcp_enabled: mcp,
          instinct_id: instinctId,
          short_circuited: shortCircuited,
          stack,
          project,
          msg: `Dispatched to ${demigod} for "${taskSignature.slice(0, 100)}"`,
          meta: {
            tool: input.tool,
            dispatch_id: input.callID,
          },
        });
        return;
      }

      // ─── Attribute this tool call to any open dispatch ──────────────
      const openDispatch = attributeToolCall({
        god: godId,
        agentId: state.agentId,
        tool: input.tool,
        hadError: isError,
        tokens,
      });

      // ─── Log write/edit/bash/read to the activity feed ──────────────
      if (input.tool === "write" || input.tool === "edit") {
        const filePath = getFilePath(input.args);
        appendActivityFeed({
          ts: new Date().toISOString(),
          god: godId,
          action: "tool_call",
          msg: `${input.tool} ${filePath ? path.basename(filePath) : "(no path)"}`,
          project: openDispatch?.project ?? null,
          meta: {
            tool: input.tool,
            file: filePath,
            agent: state.agentId,
            dispatch_id: openDispatch?.dispatchId ?? null,
            demigod: openDispatch?.demigod ?? null,
            error: isError,
            tokens,
          },
        });
        return;
      }

      if (input.tool === "bash") {
        const cmd = String(input.args?.command ?? input.args ?? "");
        // Only log meaningful commands
        if (cmd && !/^(grep|echo|cat|ls|wc|true|false)\b/.test(cmd)) {
          appendActivityFeed({
            ts: new Date().toISOString(),
            god: godId,
            action: "tool_call",
            msg: `bash: ${cmd.slice(0, 120)}${cmd.length > 120 ? "..." : ""}`,
            project: openDispatch?.project ?? null,
            meta: {
              tool: "bash",
              command: cmd.slice(0, 500),
              agent: state.agentId,
              dispatch_id: openDispatch?.dispatchId ?? null,
              demigod: openDispatch?.demigod ?? null,
              error: isError,
              exit_code: typeof output === "object" && output !== null
                ? (output as ToolOutput).exitCode ?? null
                : null,
              tokens,
            },
          });
        }
        return;
      }

      // ─── For olympus-shortcircuit: log it (the tool already updates stats) ───
      if (input.tool === "olympus-shortcircuit") {
        appendActivityFeed({
          ts: new Date().toISOString(),
          god: godId,
          action: "shortcircuit",
          msg: `Short-circuit recorded`,
          meta: {
            tool: input.tool,
            args: input.args,
          },
        });
        return;
      }
    },

    /**
     * Chat Message Hook — parse OLYMPUS in-band markers from incoming user
     * messages (issues #51 / #54).
     *
     * WHY IN-BAND: the warm opencode server (`opencode serve`) is a single
     * shared, already-running process. Per-request env vars passed by the
     * action API (OLYMPUS_UNATTENDED, OLYMPUS_TASK_CLASSIFICATION) only
     * reach ONE-SHOT spawns (`opencode run`, where extraEnv is applied at
     * spawn time) — env cannot be delivered per-message to the warm
     * server. The action API therefore prepends explicit markers to the
     * message text; this hook parses them and records per-session state +
     * telemetry, which works identically on warm and one-shot paths.
     */
    "chat.message": async (
      input: { sessionID: string },
      output: { parts?: Array<{ type?: string; text?: string }> | null },
    ) => {
      try {
        const text = (output?.parts ?? [])
          .filter((p) => p?.type === "text" && typeof p.text === "string")
          .map((p) => p.text as string)
          .join("\n");
        if (!text) return;

        // Issue #51: unattended-mode marker → telemetry event, deduped
        // per session. Residual risk (disclosed): a god quoting the marker
        // into a dispatched subtask would mark the sub-session too —
        // cosmetic only (an extra telemetry line, no behavior gate reads
        // this yet).
        if (text.includes("[OLYMPUS UNATTENDED MODE]")) {
          if (!unattendedSessions.has(input.sessionID)) {
            unattendedSessions.add(input.sessionID);
            appendActivityFeed({
              ts: new Date().toISOString(),
              god: "apollo",
              action: "unattended_mode",
              msg: `Unattended mode active for session ${input.sessionID}: no human will answer questions; Q&A/approval gates must be self-satisfied`,
              meta: { session_id: input.sessionID, source: "in-band marker" },
            });
          }
        }
      } catch {
        // Never let marker parsing break message delivery.
      }
    },

    /**
     * Session Idle Hook — fire Callimachus heartbeat + finalize open dispatches.
     *
     * Finalizes any open dispatches before the heartbeat runs, so
     * Callimachus's RECALIBRATE stage has the latest outcomes to aggregate.
     */
    "session.idle": async () => {
      // Finalize any open dispatches (with reward/penalty)
      finalizeDispatchesForGod(null, (d, outcome) => {
        // Reward/penalize only short-circuited dispatches (with an instinctId).
        // Deliberate (non-short-circuited) dispatches have no instinct to
        // reward, so we DON'T call rewardInstinct/penalizeInstinct for them —
        // but we DO log their outcome to the activity feed so Callimachus's
        // RECALIBRATE stage can detect recurring (demigod, skill, MCP, task)
        // combinations and bootstrap new empirical instincts from them.
        //
        // Without this logging, the brain's learning loop has a chicken-and-egg
        // problem: a god that deliberates and picks the same combination 50
        // times successfully generates zero instinct reinforcement.
        if (d.shortCircuited && d.instinctId) {
          if (outcome === "failure") {
            penalizeInstinct(d.instinctId, d.god);
            log("info", `[Olympus] VaultBrain: penalized instinct ${d.instinctId} (god=${d.god}) by 0.3 for short-circuit failure (session.idle)`);
          } else if (outcome === "success") {
            rewardInstinct(d.instinctId, d.god);
            log("debug", `[Olympus] VaultBrain: rewarded instinct ${d.instinctId} (god=${d.god}) for short-circuit success (session.idle)`);
          }
        } else if (outcome === "success" || outcome === "failure") {
          // Log deliberate dispatch outcomes so Callimachus's RECALIBRATE
          // stage can detect recurring patterns and bootstrap new empirical
          // instincts from them.
          appendActivityFeed({
            ts: new Date().toISOString(),
            god: d.god,
            action: "deliberate-dispatch-outcome",
            demigod: d.demigod,
            outcome,
            skill: d.skill || null,
            mcp: d.mcp || null,
            taskSignature: d.taskSignature,
            msg: `Deliberate dispatch to ${d.demigod} ${outcome} (god=${d.god}) — candidate for instinct bootstrapping`,
          });
        }
      });

      // Don't fire if a god is still active (defensive)
      const state = getActiveAgent();
      if (state.agentId && !state.isCallimachus) {
        log("debug", `[Olympus] session.idle: agent "${state.agentId}" still active, skipping Callimachus`);
        return;
      }

      if (fs.existsSync(CALLIMACHUS_LOCK)) {
        const stat = fs.statSync(CALLIMACHUS_LOCK);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs < 5 * 60 * 1000) {
          log("debug", "[Olympus] session.idle: Callimachus already running (lock held < 5min), skipping");
          return;
        }
      }

      log("info", "[Olympus] session.idle: firing Callimachus heartbeat via API endpoint");

      const apiBase = process.env.OLYMPUS_API_BASE || "http://127.0.0.1:3000";
      fetch(`${apiBase}/api/olympus/callimachus/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deep: false }),
      }).catch((err) => {
        log("warn", `[Olympus] session.idle: heartbeat API call failed: ${err.message}`);
      });
    },

    /**
     * Session Created Hook — initialize trackers + emit session_start event.
     *
     * Apollo may emit a strategy recommendation here based on the current
     * brain stats (handled by the brain-stats API).
     */
    "session.created": async () => {
      initTracker();
      initDispatchTracker();
      lastAgentId = null;
      log("info", "[Olympus] Session created — active agent tracker + dispatch tracker initialized");
      appendActivityFeed({
        ts: new Date().toISOString(),
        god: "apollo",
        action: "session_start",
        msg: "Olympus session started (VaultBrain v3.0)",
      });

      // Issue #51: unattended mode declared via env — this only fires for
      // ONE-SHOT spawns (opencode run), where the action API's extraEnv
      // reached this process at spawn time. The WARM server is shared and
      // already running, so warm runs declare unattended mode in-band
      // instead — parsed by the chat.message hook below.
      if (process.env.OLYMPUS_UNATTENDED === '1') {
        appendActivityFeed({
          ts: new Date().toISOString(),
          god: "apollo",
          action: "unattended_mode",
          msg: "Unattended mode active (env OLYMPUS_UNATTENDED=1): no human will answer questions; Q&A/approval gates must be self-satisfied",
          meta: { source: "env" },
        });
      }

      // Fire-and-forget: ask the brain-stats API for a strategy recommendation.
      // The API returns a recommendation; if it differs from the current
      // strategy, Apollo's prompt instructs him to mention it. The hook
      // itself does NOT change the strategy — that's Apollo's job (with
      // user approval).
      const apiBase = process.env.OLYMPUS_API_BASE || "http://127.0.0.1:3000";
      interface BriefBrainStats {
        recommendedStrategy?: string;
        currentStrategy?: string;
        shortCircuitHitRate?: number;
        avgConfidence?: number;
      }
      fetch(`${apiBase}/api/olympus/brain-stats?brief=true`)
        .then(r => r.json())
        .then((raw: unknown) => {
          const stats = raw as BriefBrainStats;
          if (stats && stats.recommendedStrategy && stats.currentStrategy &&
              stats.recommendedStrategy !== stats.currentStrategy) {
            const scRate = typeof stats.shortCircuitHitRate === "number"
              ? (stats.shortCircuitHitRate * 100).toFixed(1) + "%"
              : "n/a";
            const avgConf = typeof stats.avgConfidence === "number"
              ? stats.avgConfidence.toFixed(2)
              : "n/a";
            appendActivityFeed({
              ts: new Date().toISOString(),
              god: "apollo",
              action: "strategy_recommendation",
              msg: `Brain recommends switching from ${stats.currentStrategy} to ${stats.recommendedStrategy} (short-circuit hit rate: ${scRate}, avg confidence: ${avgConf})`,
              meta: {
                current: stats.currentStrategy,
                recommended: stats.recommendedStrategy,
                short_circuit_hit_rate: stats.shortCircuitHitRate,
                avg_confidence: stats.avgConfidence,
              },
            });
          }
        })
        .catch(() => {
          // Non-fatal — Apollo will check brain-stats himself if needed.
        });
    },

    /**
     * Session Deleted Hook — clean up
     */
    "session.deleted": async () => {
      clearActiveAgent();
      clearAllDispatches();
      log("info", "[Olympus] Session deleted — active agent + dispatches cleared");
    },

    /**
     * Custom tools registered by the Olympus overlay.
     * Adds olympus-patterns for cross-god dispatch chain queries.
     *
     * Register the Symphony overlay tools (symphony-resonate,
     * symphony-harmonize, symphony-decode) so they are available to the gods.
     * SYMPHONY_TOOLS is exported from symphony-hooks.ts and imported here; the
     * array is ordered [resonate, harmonize, decode] (see
     * symphony-hooks.ts:46-50) and we map by index to the canonical tool names.
     * The opencode.json permissions for these tools resolve to the canonical
     * names.
     */
    tool: OLYMPUS_TOOLS,

    /**
     * REAL cost capture via the OpenCode SDK event stream.
     *
     * The `event` hook receives every Event from the OpenCode server,
     * including `message.part.updated` events that carry `step-finish`
     * parts with REAL token usage + cost reported by the LLM provider
     * (not our heuristic estimate).
     *
     * Schema (from @opencode-ai/sdk types.gen.d.ts):
     *   StepFinishPart = {
     *     type: "step-finish",
     *     cost: number,             ← provider-reported cost in USD
     *     tokens: {
     *       input: number,          ← real input tokens
     *       output: number,         ← real output tokens
     *       reasoning: number,      ← reasoning tokens (o1-style)
     *       cache: { read: number, write: number },  ← cache hits
     *     },
     *     ...
     *   }
     *
     * We match each step-finish event to the active god (via the
     * active-agent tracker) and append it to ~/.olympus/metrics/cost.jsonl.
     * This is the AUTHORITATIVE cost record — the per-tool estimates
     * from tool.execute.after (also written to cost.jsonl) are kept as
     * a fallback for tools that fire without a matching step-finish.
     *
     * Why this is better than the per-tool estimate:
     *   1. Real provider-reported cost (not our heuristic $/1M-token table).
     *   2. Includes cache hit/miss breakdown (the heuristic can't see this).
     *   3. Includes reasoning tokens (o1/claude-thinking-style chains).
     *   4. Covers ALL costs, not just tool calls (greetings, questions,
     *      plan.md writes — all get a step-finish event).
     */
    "event": async (input: { event: any }) => {
      try {
        const evt = input.event;
        if (!evt || typeof evt !== "object") return;

        // Event shape: { type: "message.part.updated", info: Message, part: Part }
        // We only care about step-finish parts.
        const evtType = evt.type || (evt as any).properties?.type;
        if (evtType !== "message.part.updated") return;

        const part = evt.part || (evt as any).properties?.part;
        // Issue #25: record the calling agent before the step-finish filter.
        const evtInfo0 = (evt as any).properties?.info ?? evt.info ?? null;
        if (part?.type === "tool") rememberCallAgent(part.callID, evtInfo0?.agent);

        if (!part || part.type !== "step-finish") return;

        const tokens = part.tokens;
        const cost = typeof part.cost === "number" ? part.cost : 0;
        if (!tokens || typeof cost !== "number") return;

        // Authoritative attribution: the step-finish belongs to the message
        // whose agent produced it. The event payload carries the Message in
        // `properties.info` (the tracker alone is NOT enough — a god's chat
        // response with no tool calls never fires tool.execute.before, so
        // `state.godId` stays null and the event would be misattributed to
        // "system", leaving the Cost dashboard at zeros).
        const state = getActiveAgent();
        const evtInfo = evt.properties?.info ?? evt.info ?? null;
        let godId = resolveGodForStepFinish(evtInfo?.agent, state, demigodGodMap);

        // Fallback: the event didn't carry message info — ask the server for
        // the message that owns this step-finish part (same data as
        // `properties.info`, via the SDK client). Only queried when the
        // cheap paths already failed.
        if (godId === "system" && part.sessionID && part.messageID) {
          try {
            const res = await client.session.messages({ path: { id: part.sessionID } });
            // Cast — the SDK types Message as a union; only AssistantMessage
            // carries `.agent`, which is exactly what we need here.
            const messages: any[] = (res?.data as any) ?? [];
            const msg = messages.find((m: any) => m?.info?.id === part.messageID);
            if (msg?.info?.agent) {
              godId = resolveGodForStepFinish(msg.info.agent, state, demigodGodMap);
            }
          } catch {
            // Non-fatal — keep "system" so the cost still gets recorded
          }
        }
        const model = getGodModel(godId);

        // Write to cost.jsonl. Schema matches tool-execute.after writes
        // + the new fields (reasoning, cache_read, cache_write, provider_cost).
        if (!fs.existsSync(METRICS_DIR)) {
          fs.mkdirSync(METRICS_DIR, { recursive: true });
        }
        const event = {
          ts: new Date().toISOString(),
          god: godId,
          model,
          tool: "_step-finish_",  // sentinel — distinguishes from per-tool writes
          input_tokens: tokens.input || 0,
          output_tokens: tokens.output || 0,
          reasoning_tokens: tokens.reasoning || 0,
          cached_tokens: tokens.cache?.read || 0,  // cache hits = "cached_tokens" for compat with readRealCosts
          cache_write_tokens: tokens.cache?.write || 0,
          spend_usd: cost,                        // ← REAL provider cost, not estimated
          latency_ms: null,
          success: true,
          source: "sdk-event",                    // ← tag so cost-dashboard can show "live"
          session_id: part.sessionID || null,
          message_id: part.messageID || null,
        };
        fs.appendFileSync(COST_FEED, JSON.stringify(event) + "\n", "utf-8");
      } catch {
        // Non-fatal — the event hook must not throw or it breaks OpenCode.
      }
    },
  };
};

export default OlympusHooksPlugin;
