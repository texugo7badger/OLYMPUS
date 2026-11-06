/**
 * walker.ts — #109 the hop runtime (FLUENCY-1, Batch C): THE SPINE.
 *
 * The doctrine: models are lanes; the cable carries context. SESSIONS ARE
 * LANES; THE DISK CARRIES THE CAMPAIGN. The spine is a script (zero LLM
 * tokens) that walks the dispatch-plan DAG in SMALL LLM HOPS:
 *
 *   1. prompt = the spec slice + FILE POINTERS (never full context)
 *   2. dispatch to the hop god's lane (one fresh session per hop — the
 *      session never carries the campaign; the artifacts on disk do)
 *   3. verify DETERMINISTIC-FIRST (file-exists / build / lint — 0 tokens)
 *   4. record hop-state; on exhaustion -> PARK (resume point preserved),
 *      never lose artifacts — the campaign never dies with a pool burst
 *   5. telemetry: every attempt logs a JSONL row in the lane
 *
 * Concurrency <= 3 (the #106 law). Per-hop budget <= 16,384 output (the
 * #76 bar — enforced at schema time; the config caps carry it in-flight).
 *
 * The dispatcher is INJECTABLE: the battery fixture proves the spine's
 * laws without live pools; the default dispatcher (spawnHopDispatcher)
 * rides the one-shot model-lane transport with the #107 crescendo inside.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { appendFileSync, existsSync, readFileSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, isAbsolute, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { syncLaneFile } from '@/lib/lane-config';
import { validateDispatchPlan, MAX_HOP_BUDGET_TOKENS, type DispatchPlan, type PlanHop } from './plan-schema';
import { balancePlan } from './plan-balance';
import { loadHopState, saveHopState, hopStatePath, pruneStaleInFlight, type HopPark } from './hop-state';
import { userIsActive } from '../user-activity';
import { composeArsenalDirective } from './arsenal';
import { createHopTransport, type HopTransport } from './transport';
import { hardCeilingMs } from './progress';
import { readHibernationPlan } from '@/lib/hibernation';
import { readSessionTotals } from './warm-server';
import { composeRagContext } from '../rag-inject';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { verifyHopDeterministic, type HopVerifyResult } from './verify';
import { findOlympusRoot } from '@/lib/opencode-spawn';
import { classifyRetry, resolveRetryPlan, applyRetryJitter } from '@/lib/opencode-session';
import { markLaneAlive, markLaneDead, laneChain, isLaneDeadClass } from '@/lib/lane-health';
import { FREE_HYBRID_ROSTER } from '@/lib/model-strategies';
import { backupBeforeDestructiveHop } from '@/lib/destructive-guard';
import { applyRunManifestFile, buildRunMcpManifest, getRunMcpManifest, setRunMcpManifest } from '@/lib/mcp-run-manifest';
import { checkCostCaps } from '@/lib/cost-caps';
import { appendDesktopNotify, notifyText, readLanguage } from '@/lib/desktop-notify';

/** The #106 law: never more than 3 gods riding pools at once. */
export const MAX_HOP_CONCURRENCY = 3;

/**
 * v0.0.24 (#241) — DYNAMIC CONCURRENCY (AIMD).
 *
 * Start at 2, +1 after each green hop, halve on a provider-overload/429,
 * -1 on a hang; never below 1, never above MAX_HOP_CONCURRENCY. Per-pool
 * caps still apply on top. Env override: OLYMPUS_HOP_CONCURRENCY.
 */
export function resolveHopConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.OLYMPUS_HOP_CONCURRENCY ?? '', 10);
  if (Number.isFinite(n) && n > 0) return Math.max(1, Math.min(n, MAX_HOP_CONCURRENCY));
  return 2;
}

/**
 * v0.0.38 — THE 60-MINUTE PROJECT BUDGET.
 *
 * A campaign is a project slice, not an overnight vigil. The walker launches
 * hops against a wall-clock deadline (default 60 min; env-tunable down to 5
 * min, never above 60) and every hop's own ceiling is clipped to the time
 * that remains. At the deadline the walk STOPS LAUNCHING and reports the
 * resume point named `campaign-budget` — it never parks forever and never
 * spends 90–120 minutes on one project.
 */
export const DEFAULT_CAMPAIGN_BUDGET_MS = 60 * 60_000;
export const MIN_CAMPAIGN_BUDGET_MS = 5 * 60_000;
/** v0.0.59 — the launch floor. A hop launched with seconds left on the
 *  campaign clock is a guaranteed ceiling-kill park (the 12:28 AIME specimen
 *  launched k2-hd-covers and ft2-featured-rail 11s before the deadline; both
 *  parked two minutes later). Below this slice the walk stops CLEANLY and
 *  names the resume point instead of spending tokens on a doomed turn. */
export const MIN_HOP_LAUNCH_MS = 150_000;
export function resolveCampaignBudgetMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.OLYMPUS_CAMPAIGN_BUDGET_MS ?? '', 10);
  if (Number.isFinite(n) && n > 0) return Math.max(MIN_CAMPAIGN_BUDGET_MS, Math.min(n, DEFAULT_CAMPAIGN_BUDGET_MS));
  return DEFAULT_CAMPAIGN_BUDGET_MS;
}

/** v0.0.53 — the exploration budget: a bounded number of distinct tool calls
 *  per hop. 14 is above a normal 5-10 file read/build loop and below the
 *  20-27-step listing loops that burned 25-45 minutes. */
export const DEFAULT_HOP_TOOL_BUDGET = 14;
export function resolveHopToolBudget(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.OLYMPUS_HOP_TOOL_BUDGET ?? '', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(40, n) : DEFAULT_HOP_TOOL_BUDGET;
}

export function nextConcurrency(current: number, outcome: 'ok' | 'overload' | 'hang'): number {
  const cur = Math.max(1, Math.min(current, MAX_HOP_CONCURRENCY));
  if (outcome === 'ok') return Math.min(cur + 1, MAX_HOP_CONCURRENCY);
  if (outcome === 'overload') return Math.max(1, Math.floor(cur / 2));
  return Math.max(1, cur - 1);
}
/**
 * #POOL-CONTENTION (the 06:15-06:40 specimens): three athena/hephaestus
 * hops launched CONCURRENTLY on the SAME nvidia-step pool — each crawled at
 * a third of the throughput (shell 801s, logo 677s, ui-primitives 25 min to
 * a ceiling-kill). The free pools are per-key rate-limited and per-pool
 * contention-bound: at most MAX_PER_POOL hops share one provider lane.
 */
export const MAX_HOP_PER_POOL = 2;

/**
 * #LANE-CAP (2026-10-24): the per-pool cap is LANE-AWARE, because the two
 * classes have opposite shapes:
 *
 *   - `nvidia-*` free pools — per-key rate-limited and contention-bound; the
 *     #POOL-CONTENTION specimens (three hops at a third of the throughput)
 *     say 2 is already generous.
 *   - paid lanes (`openrouter/`, `opencode/` Zen, `opencode-go/`) — the
 *     provider multiplexes concurrent requests by design; capping them at 2
 *     silently halves the parallelism the user is paying for. The 2026-10-24
 *     measurement (2 parallel turns = 2.4× vs serial) is exactly this.
 *
 * A single-lane strategy (e.g. `byok-deepseek`: every god on ONE OpenRouter
 * lane) would otherwise be pinned to 2 concurrent hops for its whole life.
 * Env override: OLYMPUS_HOP_PER_POOL.
 */
export function maxHopsPerPoolFor(lane: string | null | undefined, env: NodeJS.ProcessEnv = process.env): number {
  const override = Number.parseInt(env.OLYMPUS_HOP_PER_POOL ?? '', 10);
  if (Number.isFinite(override) && override > 0) return override;
  const l = String(lane ?? '');
  if (/^nvidia/.test(l)) return MAX_HOP_PER_POOL;
  if (l.startsWith('openrouter/') || l.startsWith('opencode/') || l.startsWith('opencode-go/')) {
    return MAX_HOP_CONCURRENCY; // a paid/plan lane may ride the full global cap
  }
  return MAX_HOP_PER_POOL;
}

export const HOP_TELEMETRY_FILENAME = '.olympus-hop-telemetry.jsonl';

// ─── Telemetry ────────────────────────────────────────────────────────────────

export interface HopTelemetryRow {
  ts: string;
  hop: string;
  god: string;
  lane: string;
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number;
  retriesAbsorbed: number;
  /** 'completed' | 'parked-retry-exhausted' | 'parked-verify-failed' | 'parked-dispatch-failed' */
  status: string;
  /** W1-4 (v0.0.4): the child session's OWN reasoning (captured from the
   *  --format json stream, capped) — the task sheet shows what THIS agent
   *  was thinking above its writes. Absent on rows written pre-v0.0.4. */
  reasoning?: string;
  /** The child's opencode session id — the drill-down join key. */
  sessionId?: string | null;
  /** v0.0.24 (#241): warm | spawn. */
  transport?: 'warm' | 'spawn';
  /** R31-08: the script's bounded stdout/stderr tail (deterministic steps). */
  outputTail?: string;
}

export function hopTelemetryPath(stateDir: string): string {
  return join(stateDir, HOP_TELEMETRY_FILENAME);
}

export function appendHopTelemetry(stateDir: string, row: HopTelemetryRow): void {
  appendFileSync(hopTelemetryPath(stateDir), JSON.stringify(row) + '\n');
}

export function readHopTelemetry(stateDir: string): HopTelemetryRow[] {
  const p = hopTelemetryPath(stateDir);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as HopTelemetryRow);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export interface HopDispatchResult {
  ok: boolean;
  exitCode: number | null;
  output: string;
  tokensIn: number | null;
  tokensOut: number | null;
  retriesAbsorbed: number;
  /** True when the dispatcher's own retry layer exhausted (the #107 card fired). */
  exhausted: boolean;
  /** W1-4: the child's reasoning parts (capped) + session id. */
  reasoning?: string | null;
  sessionId?: string | null;
  error?: string;
  /** #V2-ERRORS: the provider error class that ended the run
   *  (`provider.quota`, `provider.free-limit`, `provider.no-route`,
   *  `provider.rate-limit`, …) — the lane-health join key. */
  errorClass?: string | null;
  /** #V2-ERRORS: the provider's own back-off hint, when it sends one. */
  retryAfterMs?: number | null;
  /** #V2-FAILOVER: the lane the hop ACTUALLY ran on (differs from the
   *  applied lane when the failover moved it). */
  lane?: string;
  /** v0.0.24 (#241): which transport carried the hop. */
  transport?: 'warm' | 'spawn';
}

export type HopDispatcher = (hop: PlanHop, ctx: {
  laneRoot: string;
  /** The composed prompt: the slice + the file pointers — never full context. */
  prompt: string;
  /** v0.0.38 — the campaign's wall-clock deadline (ms since epoch). Each
   *  hop's ceiling is clipped to the time that remains. */
  deadlineAt?: number;
}) => Promise<HopDispatchResult>;

/** The repo root for the arsenal loader — the hop-runtime module's own
 *  tree (.opencode/prompts/agents/demigods lives there), NOT the lane. */
function resolveHopRepoRoot(): string {
  try {
    return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  } catch {
    return process.cwd();
  }
}

/**
 * Compose the hop prompt: the spec SLICE + FILE POINTERS. The hop never
 * receives the campaign's full context — the artifacts on disk carry it.
 */
export function composeHopPrompt(hop: PlanHop, laneRoot: string): string {
  // v0.0.53 — stable prefix first: the contract/arsenal blocks are identical
  // for every hop of a god, so the provider cache can reuse them. The
  // variable task is the LAST block, marked for the instinct gate.
  const taskBlock = ['[OLYMPUS-TASK]', hop.prompt, '[/OLYMPUS-TASK]'];
  const lines = [
    '[HOP CONTRACT]',
    `Project lane root: ${laneRoot}`,
  ];
  if (hop.artifacts.length > 0) {
    lines.push(`Write these artifacts (paths relative to the lane root): ${hop.artifacts.join(', ')}`);
  }
  lines.push(`Budget: at most ${hop.budgetTokens ?? MAX_HOP_BUDGET_TOKENS} output tokens — a small hop, one god, artifacts on disk.`);
  lines.push('The spine verifies the artifacts deterministically (file-exists / build / lint). Sessions are lanes; the disk carries the campaign.');
  // v0.0.32 (Epic P) — THE BUILD: up to 3 skills, 3 MCPs and 5 parallel
  // demigods for this mini-task. The god orchestrates them by fit.
  const buildSkills = hop.skills ?? (hop.skill ? [hop.skill] : []);
  const buildMcps = hop.mcps ?? (hop.mcp ? [hop.mcp] : []);
  const buildDemigods = hop.demigods ?? (hop.demigod ? [hop.demigod] : []);
  if (buildSkills.length || buildMcps.length || buildDemigods.length) {
    lines.push('', '[HOP BUILD]', `god: ${hop.god}`);
    if (buildDemigods.length) {
      lines.push(`demigods (parallel, max 5): ${buildDemigods.join(', ')} — dispatch each by fit via olympus-dispatch, in ONE wave; verify their artifacts before you finish.`);
    }
    if (buildSkills.length) {
      lines.push(`skills (max 3): ${buildSkills.join(', ')} — apply them; name which one drove each decision.`);
    }
    if (buildMcps.length) {
      lines.push(`mcps: ${buildMcps.join(', ')} — use only these servers for this hop; say so if one is unavailable.`);
    }
  }
  // #SACRED-RUNTIME (the 10:16 specimen): the build-green god read the
  // residue-cleanup doctrine and DELETED the walk's own machinery mid-hop
  // (rm opencode.json dispatch-plan.json .olympus-* .opencode…) — the next
  // hop died with "Model not found" and the campaign parked. The cleanup is
  // the RUNTIME's post-campaign job (post-run.ts), NEVER a god's. Every hop
  // prompt carries the guard; the planner template forbids it too.
  lines.push('RUNTIME FILES ARE SACRED: NEVER delete, move, or rewrite .opencode, opencode.json, opencode.demigods.json, dispatch-plan.json, .olympus-context.json, .olympus-hop-state.json, .olympus-hop-telemetry.jsonl, project.md, _handoff.md, or _delegations — they are the walk\'s own machinery. Cleaning the deliverable is the RUNTIME\'s job after the campaign completes, never a god\'s mid-hop.');
  // THE ARSENAL DIRECTIVE (the parallelism-of-parallelism night): the god
  // KNOWS its demigod roster and dispatches sub-tasks BY FIT via
  // olympus-dispatch — the native task system spawns each demigod as the
  // god's in-process subagent. The god verifies their artifacts; the hop
  // owns the outcome. Apollo plans; the walker walks; GODS ORCHESTRATE
  // their demigods — the nested command structure the doctrine claimed,
  // now in the hop contract itself.
  const arsenal = composeArsenalDirective(hop.god, resolveHopRepoRoot());
  if (arsenal) {
    lines.push('', arsenal);
  }
  lines.push('', ...taskBlock);
  return lines.join('\n');
}

/**
 * #164 RAG-AGENTIC + W-A RAG-CERT A4: the async hop prompt — the same
 * contract PLUS the retrieval that actually matches THIS hop:
 *   - the vault hits ("style of my previous assets") queried by the hop's
 *     OWN slice (RAG-CERT A4: the old form joined every hop prompt into one
 *     400-char campaign mush shared by all hops — noise for every hop that
 *     wasn't the first; the campaign-level style flavor now rides the
 *     planner marker via composePlannerRag on the action route);
 *   - the #84 instinct fusion at HOP level (the composer god's proven
 *     instincts matching the slice — the same block the demigod dispatches
 *     carry, so the CHANGELOG #164 "fused" claim is true in code).
 * The dispatcher uses this; the sync composeHopPrompt stays for the
 * fixtures (the RAG block is additive, never contract-breaking). No hits +
 * no instincts = the plain sync form (lean, never padded).
 */
export async function composeHopPromptWithRag(
  hop: PlanHop,
  laneRoot: string,
  campaignQuery?: string,
): Promise<string> {
  const base = composeHopPrompt(hop, laneRoot);
  // The hop's own slice is the query; campaignQuery is only the fallback
  // for the degenerate empty-slice shape (never the shared-mush primary).
  const query = String(hop.prompt ?? '').slice(0, 400) || campaignQuery || '';
  if (!query) return base;
  try {
    const rag = await composeRagContext(query);
    let instinct: string | null = null;
    try {
      const { instinctPriorContext } = await import('../instinct-rag');
      instinct = instinctPriorContext(hop.god, query);
    } catch { /* the instinct lane never breaks the hop */ }
    if (!rag && !instinct) return base;
    const blocks = [rag, instinct].filter(Boolean).join('\n\n');
    return `${base}\n\n${blocks}`;
  } catch {
    return base; // the RAG never breaks the hop
  }
}

/** Resolve a god's live model lane from the repo's opencode.json. */
export function resolveGodModelLane(god: string, configPath?: string): string | null {
  const p = configPath ?? join(findOlympusRoot(), 'opencode.json');
  try {
    const cfg = JSON.parse(readFileSync(p, 'utf-8'));
    const model = cfg?.agent?.[god]?.model;
    return typeof model === 'string' && model ? model : null;
  } catch {
    return null;
  }
}

interface JsonEventParse {
  textOut: string;
  tokensIn: number;
  tokensOut: number;
  /** W1-4 (v0.0.4): the child's reasoning parts — captured from the same
   *  --format json stream, capped, stored in the hop telemetry. */
  reasoningOut: string;
  /** The child's opencode session id — the drill-down's join key. */
  sessionId: string | null;
  /** #V2-ERRORS: the provider error event(s) emitted on stdout, verbatim. */
  errorText: string;
  /** #V2-ERRORS: the provider error class (`provider.quota`, `provider.no-route`, …). */
  errorClass: string | null;
  /** #V2-ERRORS: the provider's own back-off hint, when it sends one. */
  retryAfterMs: number | null;
}

/** Parse `opencode run --format json` events: text parts + step-finish tokens.
 *  The CLI emits two shapes (probe-verified 2026-10-09): the wrapped
 *  `{type, part}` events and bare `{type:'step-finish', tokens}` lines —
 *  both are honored.
 *
 *  #V2-ERRORS (the AIME specimen, 2026-10-24): on OpenCode v2 every provider
 *  failure is an EVENT on STDOUT — `{"type":"error","error":{"type":
 *  "provider.quota","message":"Go usage limit exceeded",...,"retryAfterMs":
 *  392658000}}` — while stderr stays EMPTY and the process exits 1. The old
 *  dispatcher read stderr only, so every real cause collapsed into
 *  `error: "exit 1"` (five parked hops, zero diagnosis). The error events are
 *  now captured here, verbatim, so the classifier and the park message name
 *  the CAUSE and the provider's own words. A `type:'error'` event also marks
 *  the run FAILED even when the process exits 0 (the
 *  `provider.no-route` + exit 0 specimen). */
function parseJsonEvents(raw: string): JsonEventParse {
  const acc: JsonEventParse = {
    textOut: '', tokensIn: 0, tokensOut: 0, reasoningOut: '', sessionId: null,
    errorText: '', errorClass: null, retryAfterMs: null,
  };
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const ev = JSON.parse(t);
      const part = ev?.data?.part ?? ev?.part ?? ev;
      if (part?.type === 'text' && typeof part.text === 'string') acc.textOut += part.text;
      // W1-4 (v0.0.4): the child's OWN thinking — the reasoning parts ride
      // the same --format json stream we already hold; capture them so the
      // task sheet can show WHAT THIS AGENT WAS THINKING above its writes.
      if (part?.type === 'reasoning' && typeof part.text === 'string') {
        acc.reasoningOut += (acc.reasoningOut ? '\n' : '') + part.text;
      }
      const sid = ev?.info?.sessionID ?? ev?.sessionID ?? ev?.data?.info?.sessionID;
      if (typeof sid === 'string' && sid && !acc.sessionId) acc.sessionId = sid;
      if (part?.type === 'step-finish' || ev?.type === 'step-finish' || ev?.type === 'step_finish') {
        const tokens = part?.tokens ?? ev?.tokens;
        if (tokens) {
          acc.tokensIn += n(tokens.input);
          acc.tokensOut += n(tokens.output);
        }
      }
      // #V2-ERRORS: the provider failure rides STDOUT as an event.
      if (ev?.type === 'error' && ev?.error) {
        const err = ev.error;
        const cls = typeof err.type === 'string' ? err.type : null;
        const msg = typeof err.message === 'string' ? err.message : '';
        const body = err?.response?.body;
        const bodyText = typeof body === 'string' ? body : body ? JSON.stringify(body) : '';
        const line = [cls ? `[${cls}]` : '', msg, bodyText].filter(Boolean).join(' ');
        acc.errorText += (acc.errorText ? '\n' : '') + (line || JSON.stringify(err).slice(0, 500));
        if (!acc.errorClass && cls) acc.errorClass = cls;
        const retry = n(err.retryAfterMs);
        if (retry > 0) acc.retryAfterMs = retry;
      }
    } catch { /* not a JSON line — ignore */ }
  }
  // Cap the stored thinking: the task sheet needs the gist, not the novel.
  if (acc.reasoningOut.length > 16_000) acc.reasoningOut = acc.reasoningOut.slice(0, 16_000) + '\n… (truncated)';
  return acc;
}

/**
 * #FIRST-BYTE (the 2026-10-16 22:27 specimen): a hop whose turn hangs with
 * ZERO output — the empty-reasoning stall class (step-5 froze at hop-1 with
 * step-start + an empty reasoning part; the 16:31 planning turn showed the
 * same signature on glm) — used to ride the full 25-minute ceiling in
 * SILENCE. The first-byte deadline kills a mute hop fast and names the
 * class so classifyCeilingKill buckets it as provider-overload (transient
 * pool contention — the crescendo retries it; the honest park only fires
 * on exhaustion). Env-tunable: OLYMPUS_HOP_FIRST_BYTE_MS (default 240s —
 * above the slowest measured legitimate TTFT: gemma-4-31b at 111s).
 */
export const DEFAULT_HOP_FIRST_BYTE_MS = 240_000;
// v0.0.30 — 10 minutes of silence was a blind wait (the d3-media specimen).
// Detect a stalled step in 5 minutes; the auto transport then retries on
// spawn before the hop parks. Env-tunable as before.
export const DEFAULT_HOP_SILENCE_MS = 300_000;
export function resolveHopSilenceMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.OLYMPUS_HOP_SILENCE_MS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HOP_SILENCE_MS;
}
export const HOP_FIRST_BYTE_MARKER = 'hop-first-byte-timeout';
export function resolveHopFirstByteMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.OLYMPUS_HOP_FIRST_BYTE_MS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HOP_FIRST_BYTE_MS;
}

/**
 * SMOKE-1 rider R3: the per-hop ceiling, env-tunable. FLUENCY-1's resume
 * was killed at the hard-coded 15-min ceiling SECONDS after the artifacts
 * landed — the knob now exists (OLYMPUS_HOP_TIMEOUT_MS), the default
 * unchanged (15 min: the hop is SMALL by doctrine, <= 16k out, so the
 * ceiling stays generous wall-clock, never the monolith's minutes).
 */
export const DEFAULT_HOP_TIMEOUT_MS = 25 * 60_000;
export function resolveHopTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.OLYMPUS_HOP_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HOP_TIMEOUT_MS;
}

// ─── UAT-5 (the peak-hour evolution): the VARIANT wiring ─────────────────────

/**
 * UAT-5 (the peak-hour evolution): the VARIANT knob — the B5 OBS's measured
 * finding wired as an env-tunable per-hop flag. `--variant low` cuts the
 * model's thinking tokens ~83% (161→28 tok on the same prompt, the B5 wire
 * probe) — the single biggest speed lever for peak-hour survival. The
 * walker's dispatcher threads it when OLYMPUS_HOP_VARIANT is set.
 */
export const KNOWN_HOP_VARIANTS = new Set(['low', 'high', 'max', 'minimal']);
export function resolveHopVariant(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = (env.OLYMPUS_HOP_VARIANT ?? '').trim().toLowerCase();
  return KNOWN_HOP_VARIANTS.has(v) ? v : null;
}

// ─── #111 (HIGIENIA-1 H1a): the ceiling-kill classification ───────────────────

export interface CeilingKillClassification {
  kind: 'provider-overload' | 'hang';
  error: string;
}

/**
 * A config-selection failure (`Agent not found`, `Model not found`) means the
 * turn NEVER RAN. It must never be artifact-rescued: pre-existing files are
 * not evidence of work (AIME r1 was marked complete with zero turns). Pure so
 * the suite can pin it.
 */
export function isConfigSelectionError(result: { error?: string | null; output?: string | null }): boolean {
  const text = `${result.error ?? ''}\n${result.output ?? ''}`;
  return /agent not found|model not found|no such agent|unknown agent/i.test(text);
}

/**
 * #111: the ceiling-kill classifier — the SMOKE-1 forensics finding
 * (reports/smoke-1/s2/429-forensics.md): the per-hop ceiling's SIGKILL
 * surfaced as a classless `exit null` park, and FLUENCY-1's 900s specimen
 * parked `dispatch-failed` with `retriesAbsorbed: 0` while an inner retry
 * loop held the process. The layered design composes only if the
 * ceiling-kill CLASSIFIES: a hang whose stderr carries a provider-error
 * class counts as provider-overload WITHIN the crescendo budget (absorbed,
 * retried); a pure hang parks NAMED (the knob + the ceiling), never
 * classless.
 */
export function classifyCeilingKill(stderrText: string): CeilingKillClassification {
  const errHead = (stderrText || '').slice(-2000);
  // #FIRST-BYTE: the zero-output stall class — provider pool contention,
  // transient: the crescendo retries it, the park only fires on exhaustion.
  if (errHead.includes(HOP_FIRST_BYTE_MARKER)) {
    return { kind: 'provider-overload', error: errHead };
  }
  // v0.0.58 — the spawn path's tool-budget kill is NAMED, not a generic hang.
  if (errHead.includes('hop-tool-budget-exceeded')) {
    return { kind: 'hang', error: errHead.slice(-600) };
  }
  const kind: CeilingKillClassification['kind'] =
    classifyRetry({ code: -1, error: errHead, statusCode: undefined } as never) === 'provider-overload'
      ? 'provider-overload'
      : 'hang';
  if (kind === 'provider-overload') return { kind, error: errHead };
  return {
    kind,
    error: `ceiling-kill (OLYMPUS_HOP_TIMEOUT_MS ${resolveHopTimeoutMs()}ms): the stream hung with no provider error${errHead ? ` — ${errHead.slice(-400)}` : ''}`,
  };
}

/**
 * #V2-ERRORS: the lane-death classifier now lives in lane-health.ts (both the
 * hop dispatcher AND the chat session need it, and importing the walker from
 * the session would create a cycle). Re-exported here so every existing
 * caller keeps its import.
 */
export { isLaneDeadClass } from '@/lib/lane-health';

/**
 * The default hop dispatcher: one fresh one-shot session per hop on the
 * god's live model lane (the FREE-1 §6.2 transport — sessions are lanes),
 * with the #107 crescendo INSIDE the dispatcher: an overload burst is
 * absorbed per resolveRetryPlan(), exhaustion reported for the PARK.
 */
/**
 * R31-08 — DETERMINISTIC SCRIPT STEP.
 *
 * A script hop runs a bounded shell command in the lane with ZERO LLM tokens;
 * the exit code is the gate. Ingestion, seed, build, lint and test work stop
 * burning a 25-minute god turn. The output tail is persisted in telemetry.
 */
function runScriptHop(hop: PlanHop, laneRoot: string): Promise<HopDispatchResult> {
  const command = hop.command ?? '';
  const timeoutMs = hop.timeoutMs ?? 10 * 60_000;
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const cap = (s: string, v: string) => (s + v).slice(-8_000);
    let settled = false;
    const done = (r: HopDispatchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const child = spawn('bash', ['-lc', command], {
      cwd: laneRoot,
      env: { ...process.env, OLYMPUS_HOP_ID: hop.id, OLYMPUS_HOP_KIND: 'script' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* gone */ }
      done({
        ok: false, exitCode: null, output: out, tokensIn: 0, tokensOut: 0,
        retriesAbsorbed: 0, exhausted: false,
        error: `script-timeout (${timeoutMs}ms): ${(err || out).slice(-800)}`,
        errorClass: 'script-timeout',
      });
    }, timeoutMs);
    child.stdout?.on('data', (d) => { out = cap(out, String(d)); });
    child.stderr?.on('data', (d) => { err = cap(err, String(d)); });
    child.on('error', (e) => done({
      ok: false, exitCode: null, output: out, tokensIn: 0, tokensOut: 0,
      retriesAbsorbed: 0, exhausted: false, error: `script spawn failed: ${e.message}`,
    }));
    child.on('close', (code) => {
      const output = err ? `${out}\n[stderr]\n${err}` : out;
      if (code === 0) {
        done({ ok: true, exitCode: 0, output, tokensIn: 0, tokensOut: 0, retriesAbsorbed: 0, exhausted: false });
      } else {
        done({
          ok: false, exitCode: code, output, tokensIn: 0, tokensOut: 0,
          retriesAbsorbed: 0, exhausted: false,
          error: `script exit ${code}: ${(err || out).slice(-800)}`,
          errorClass: 'script-failed',
        });
      }
    });
  });
}

/** One lane's attempt loop — the #107 crescendo, unchanged in behaviour. */
type LaneOutcome =
  | { kind: 'ok'; result: HopDispatchResult }
  | { kind: 'lane-dead'; errorClass: string | null; retryAfterMs: number | null; error: string }
  | { kind: 'failed'; result: HopDispatchResult };

async function attemptLane(
  lane: string,
  hop: PlanHop,
  ctx: { laneRoot: string; prompt: string; transport: HopTransport; deadlineAt?: number },
  retriesAbsorbedStart: number,
): Promise<LaneOutcome> {
  const plan = resolveRetryPlan();
  let retriesAbsorbed = retriesAbsorbedStart;
  let last: { code: number | null; stdout: string; stderr: string; transport?: 'warm' | 'spawn' } = { code: null, stdout: '', stderr: '' };
  const startedAt = Date.now();
  // R31-09 — the hop runs as its lean variant (no olympus/symphony tools).
  const hopAgent = resolveHopAgentId(hop.god, ctx.laneRoot);
  for (let attempt = 0; ; attempt++) {
    // v0.0.52 — never start a retry after the campaign deadline. The in-flight
    // attempt is already clipped by hardTimeoutMs; this closes the retry gap.
    if (ctx.deadlineAt && Date.now() >= ctx.deadlineAt) {
      return {
        kind: 'failed',
        result: {
          ok: false, exitCode: null, output: '', tokensIn: null, tokensOut: null,
          retriesAbsorbed, exhausted: false,
          error: 'campaign-deadline: the project budget ended before this retry',
          errorClass: 'campaign-deadline',
        },
      };
    }
    // The per-hop runtime budget (#R3: env-tunable — OLYMPUS_HOP_TIMEOUT_MS;
    // the default stays 15 min).
    last = await ctx.transport.run({
      // v0.0.28 — THE HOP RUNS AS ITS GOD, NOT AS APOLLO. The spawn lane
      // used to pass only `--model`, so every hop ran the default agent
      // (apollo, the planner) with the hop god's MODEL — a frontend hop got
      // Apollo's plan-and-delegate system prompt instead of Athena's frontend
      // rules. `--agent` is the CLI's own selector (probed on 2.2.2:
      // `opencode run --agent athena` resolves; an unknown name errors
      // "Agent not found"). The warm lane already selects the agent via
      // `/api/session/:id/agent`; this makes both transports agree.
      args: ['run', '--model', lane, '--agent', hopAgent, '--format', 'json', ...(resolveHopVariant() ? ['--variant', resolveHopVariant()!] : []), ctx.prompt],
      prompt: ctx.prompt,
      agent: hopAgent,
      model: lane,
      cwd: ctx.laneRoot,
      // The campaign budget clips the hop ceiling: a hop started at minute
      // 59 gets the minute it has left, not another 15. The hard cap is
      // clipped too — v0.0.52: k1-source-audit ran 68 min because the
      // transport could extend to 2× the base past the campaign deadline.
      timeoutMs: ctx.deadlineAt
        ? Math.min(resolveHopTimeoutMs(), Math.max(60_000, ctx.deadlineAt - Date.now()))
        : resolveHopTimeoutMs(),
      hardTimeoutMs: ctx.deadlineAt
        ? Math.max(60_000, Math.min(hardCeilingMs(resolveHopTimeoutMs()), ctx.deadlineAt - Date.now()))
        : hardCeilingMs(resolveHopTimeoutMs()),
      toolBudget: resolveHopToolBudget(),
      firstByteMs: resolveHopFirstByteMs(),
      silenceMs: resolveHopSilenceMs(),
      onNotice: (msg) => console.log(`[hop-transport] ${msg}`),
    });
    // #V2-ERRORS: the stdout stream carries the provider's truth. Parse it
    // BEFORE deciding success — an error event with exit 0 is a FAILED run
    // (the `provider.no-route` + exit 0 specimen), and an exit-1 run with an
    // empty stderr still has its cause in here (the GO-quota specimen).
    const parsed = parseJsonEvents(last.stdout);
    const ok = last.code === 0 && !parsed.errorText;
    const errText =
      parsed.errorText
      || (last.stderr || '').slice(-2000)
      || (ok ? '' : `exit ${last.code}`);
    if (ok) {
      return {
        kind: 'ok',
        result: {
          ok: true, exitCode: last.code, output: parsed.textOut || last.stdout.slice(0, 4000),
          tokensIn: parsed.tokensIn || null, tokensOut: parsed.tokensOut || null,
          reasoning: parsed.reasoningOut || null,
          sessionId: parsed.sessionId,
          transport: last.transport,
          retriesAbsorbed, exhausted: false,
        },
      };
    }
    // #V2-ERRORS: a LANE-DEAD class never retries — retrying a monthly quota
    // (retryAfterMs measured in days) or an unroutable model burns the whole
    // crescendo budget for nothing. Hand the class up so the caller can move
    // the hop to the next live lane.
    // 402 / payment errors may surface in the message text rather than the
    // error class (e.g. "APIError" with a 402 body), so check both.
    const deadClass = isLaneDeadClass(parsed.errorClass)
      ? parsed.errorClass
      : (isLaneDeadClass(parsed.errorText) ? (parsed.errorText.match(/muse-wonder|payment|402/i)?.[0] ?? parsed.errorClass) : null);
    if (deadClass) {
      return { kind: 'lane-dead', errorClass: deadClass, retryAfterMs: parsed.retryAfterMs, error: errText };
    }
    // #111 (HIGIENIA-1 H1a): the ceiling-kill — classified, never
    // classless. A provider-erroring hang counts as provider-overload
    // WITHIN the crescendo budget (absorbed, retried within maxAttempts);
    // a pure hang parks NAMED with the knob + the ceiling.
    if (last.code === null) {
      const ck = classifyCeilingKill(last.stderr);
      if (ck.kind === 'hang') {
        return { kind: 'failed', result: { ok: false, exitCode: last.code, output: last.stdout.slice(0, 4000), tokensIn: null, tokensOut: null, retriesAbsorbed, exhausted: false, error: ck.error } };
      }
      if (attempt >= plan.maxAttempts - 1) {
        return { kind: 'failed', result: { ok: false, exitCode: last.code, output: last.stdout.slice(0, 4000), tokensIn: null, tokensOut: null, retriesAbsorbed, exhausted: true, error: ck.error } };
      }
      retriesAbsorbed++;
      const delay = applyRetryJitter(plan.backoffMs[attempt] ?? plan.backoffMs[plan.backoffMs.length - 1], Math.random(), plan.jitterFraction);
      await new Promise((r) => setTimeout(r, Math.min(delay, 10_000)));
      continue;
    }
    if (attempt >= plan.maxAttempts - 1) {
      return {
        kind: 'failed',
        result: {
          ok: false, exitCode: last.code, output: last.stdout.slice(0, 4000),
          tokensIn: null, tokensOut: null, retriesAbsorbed, exhausted: true,
          error: errText, errorClass: parsed.errorClass, retryAfterMs: parsed.retryAfterMs,
        },
      };
    }
    const kind = classifyRetry({ code: last.code ?? -1, error: errText, statusCode: undefined } as never);
    if (!kind) {
      // A non-retryable provider error that is NOT a lane-death (a 400, a
      // refused prompt) — report it honestly, do not fail over (the next lane
      // would refuse the same prompt).
      return {
        kind: 'failed',
        result: {
          ok: false, exitCode: last.code, output: last.stdout.slice(0, 4000),
          tokensIn: null, tokensOut: null, retriesAbsorbed, exhausted: false,
          error: errText, errorClass: parsed.errorClass, retryAfterMs: parsed.retryAfterMs,
        },
      };
    }
    retriesAbsorbed++;
    const base = kind === 'provider-rate-limit' ? plan.rateLimitBackoffMs : plan.backoffMs[attempt];
    const delay = kind === 'provider-overload' ? applyRetryJitter(base, Math.random(), plan.jitterFraction) : base;
    await new Promise((r) => setTimeout(r, Math.min(delay, 10_000)));
  }
}

/**
 * The dispatcher: one hop, over a CHAIN of lanes.
 *
 * #V2-FAILOVER (the AIME specimen, 2026-10-24): the applied lane is tried
 * first — that is the user's strategy and it must win whenever it is alive.
 * A LANE-DEAD provider class (quota / free-limit / no-route / auth) does not
 * park the hop: the lane is recorded dead in lane-health and the SAME hop
 * re-posts on the next healthy lane for that god. Only when every lane in the
 * chain is dead does the hop park — and then it parks NAMING each lane and
 * its cause, never `exit 1`.
 */
export const spawnHopDispatcher: HopDispatcher = async (hop, ctx) => {
  // v0.0.28 — THE LANE'S OWN CONFIG WINS. resolveGodModelLane() defaulted to
  // the OLYMPUS repo's opencode.json, so a project lane that applied a
  // different strategy still ran the repo's model for every hop. Prefer the
  // lane config, fall back to the repo when the lane has none.
  const laneConfig = join(ctx.laneRoot, 'opencode.json');
  const applied = (existsSync(laneConfig) ? resolveGodModelLane(hop.god, laneConfig) : null)
    ?? resolveGodModelLane(hop.god);
  if (!applied) {
    return {
      ok: false, exitCode: null, output: '', tokensIn: null, tokensOut: null,
      retriesAbsorbed: 0, exhausted: false,
      error: `no live model lane for god '${hop.god}' in opencode.json — cannot dispatch (reassignment is a table edit, the #106 doctrine)`,
    };
  }
  const roster = (FREE_HYBRID_ROSTER as Record<string, Array<{ id: string }>>)[hop.god]?.map((l) => l.id) ?? [];
  const chain = laneChain(applied, roster);
  const deadNotes: string[] = [];
  let retriesAbsorbed = 0;
  // v0.0.24 (#241): one transport per hop chain — auto = warm first, spawn
  // on any warm failure. The spawn path is unchanged.
  const transport = createHopTransport();
  const ctxWithTransport = { ...ctx, transport };

  for (const lane of chain) {
    const outcome = await attemptLane(lane, hop, ctxWithTransport, retriesAbsorbed);
    if (outcome.kind === 'ok') {
      markLaneAlive(lane, undefined);
      // The failover is NEVER silent: the result names the lane the hop
      // actually ran on, so the walk can log the switch honestly.
      return { ...outcome.result, lane };
    }
    if (outcome.kind === 'lane-dead') {
      const entry = markLaneDead(lane, outcome.errorClass, outcome.retryAfterMs, outcome.error);
      const until = entry?.retryUntil ? new Date(entry.retryUntil).toISOString() : 'indefinido';
      deadNotes.push(`${lane} [${outcome.errorClass ?? 'erro'}] morto até ${until} — ${outcome.error.slice(0, 200)}`);
      continue; // #V2-FAILOVER: next lane
    }
    // A genuine failure (hang / non-retryable provider error): report it —
    // another lane would fail the same way for the same prompt.
    return outcome.result;
  }

  return {
    ok: false, exitCode: null, output: '', tokensIn: null, tokensOut: null,
    retriesAbsorbed, exhausted: false,
    error:
      `todas as lanes de '${hop.god}' estão mortas — nenhuma pode servir este hop:\n  - ` +
      deadNotes.join('\n  - ') +
      `\nTroque a estratégia em Settings → LLM Strategy, ou resolva a cota/chave da lane principal.`,
    errorClass: 'all-lanes-dead',
  };
};

/**
 * R31-09 — THE LEAN HOP AGENT.
 *
 * A hop used to run as the full god: 22 orchestration tools
 * (olympus-…, symphony-…, task) plus the lane's plugins. The 2026-11-01
 * measurement: 125k input tokens for a 10–15 KB prompt, 27 steps for one
 * component, and three "Code Mode tool catalog changed" system messages per
 * hop. A hop is a single-artifact executor; it needs file/shell tools, not
 * the Symphony arsenal.
 *
 * The variant keeps the god's prompt + model, and exposes only the tools a
 * hop actually uses. The base god is untouched (the app's chat still uses
 * the full arsenal).
 */
export const HOP_TOOL_ALLOWLIST = [
  'read', 'write', 'edit', 'bash', 'list', 'glob', 'grep',
  'todowrite', 'webfetch', 'websearch',
] as const;

export function buildHopAgent(god: string, base: Record<string, any> | undefined): Record<string, any> | null {
  if (!base) return null;
  const tools: Record<string, boolean> = {};
  // Turn every inherited tool OFF, then enable the hop allowlist.
  for (const name of Object.keys(base.tools ?? {})) tools[name] = false;
  for (const name of HOP_TOOL_ALLOWLIST) tools[name] = true;
  // `task` is orchestration (it spawns sub-agents and doubles the cost).
  tools.task = false;
  return {
    ...base,
    description: `Hop executor for ${god} (lean toolset: file/shell only; no orchestration tools)`,
    mode: 'subagent',
    tools,
  };
}

/** Apply the `${god}-hop` variants to a lane config file. Write only on change. */
const HOP_GODS = new Set(['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus']);

export function applyHopAgentVariants(configPath: string): { created: number; changed: boolean } {
  try {
    const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (!cfg || typeof cfg !== 'object' || !cfg.agent || typeof cfg.agent !== 'object') {
      return { created: 0, changed: false };
    }
    let created = 0;
    for (const god of Object.keys(cfg.agent)) {
      // Only the 10 gods get a hop variant — never a demigod, never a variant.
      if (!HOP_GODS.has(god) || god.endsWith('-hop')) continue;
      const base = cfg.agent[god];
      const variant = buildHopAgent(god, base);
      if (!variant) continue;
      const id = `${god}-hop`;
      const next = JSON.stringify(variant);
      if (JSON.stringify(cfg.agent[id]) !== next) {
        cfg.agent[id] = variant;
        created++;
      }
    }
    if (created === 0) return { created: 0, changed: false };
    writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
    return { created, changed: true };
  } catch {
    return { created: 0, changed: false };
  }
}

/** The agent id a hop runs as: the lean variant when the lane has it. */
export function resolveHopAgentId(god: string, laneRoot: string): string {
  try {
    const cfg = JSON.parse(readFileSync(join(laneRoot, 'opencode.json'), 'utf-8'));
    return cfg?.agent?.[`${god}-hop`] ? `${god}-hop` : god;
  } catch {
    return god;
  }
}

/**
 * #121 (PLANO-MASTER-1 B7) + UAT-4-FIX (E1): the lane config bootstrap —
 * the #99 lane doctrine EXTENDED to the intake home. opencode resolves its
 * config from the CWD; a hop spawned in an intake-created 02_Projects home
 * dies `ProviderModelNotFound` (the live acceptance-test specimen) — and
 * even WITH the config copy, the CLI dies on the `{file:.opencode/...}`
 * references unless the `.opencode` symlink exists (the UAT-4 specimen:
 * `Configuration is invalid ... bad file reference`). The #99 workspace
 * lanes ALWAYS get the symlink; the intake homes now do too.
 */
/**
 * v0.0.84 edit — ROOT-HASH LANE CONFIG. The old sync compared the lane file
 * with the root and refreshed on ANY difference; the lane always differs by
 * its `-hop` agents + MCP manifest, so every hop rewrote opencode.json and
 * the warm server saw a new mtime and respawned mid-hop (AIME p1, 1350s).
 * The root content hash is the truth: copy the root only when it changed.
 */
function syncLaneConfigFile(rootCfg: string, dst: string, laneRoot: string): 'ok' | 'refreshed' | 'missing' {
  try {
    const rootContent = readFileSync(rootCfg, 'utf-8');
    const rootHash = createHash('sha256').update(rootContent).digest('hex');
    const markerDir = join(homedir(), '.olympus', 'lane-config');
    const marker = join(markerDir, `${createHash('sha1').update(laneRoot).digest('hex')}.json`);
    let last = '';
    try { last = String(JSON.parse(readFileSync(marker, 'utf-8'))?.rootHash || ''); } catch { /* first run */ }
    if (existsSync(dst) && last === rootHash) return 'ok';
    writeFileSync(dst, rootContent, 'utf-8');
    mkdirSync(markerDir, { recursive: true });
    writeFileSync(marker, JSON.stringify({ rootHash, at: new Date().toISOString() }) + '\n', 'utf-8');
    return 'refreshed';
  } catch { return 'missing'; }
}

export function ensureLaneConfig(laneRoot: string): void {
  const dst = join(laneRoot, 'opencode.json');
  const dstDemigods = join(laneRoot, 'opencode.demigods.json');
  const dstDotOpenCode = join(laneRoot, '.opencode');
  try {
    const root = findOlympusRoot();
    // (a)+(b) the config + demigods copies — #LANE-DRIFT: REFRESH-ON-DRIFT,
    // never created-if-missing. A lane created in an earlier era would
    // otherwise ride its fossil model map forever (the 2026-10-16
    // specimen: the workspace lane survived two rotations on the banned
    // nemotron pool). The lane mirrors the root — operator edits belong
    // in the root config.
    const verdictCfg = syncLaneConfigFile(join(root, 'opencode.json'), dst, laneRoot);
    const verdictDemigods = syncLaneFile(join(root, 'opencode.demigods.json'), dstDemigods);
    if (verdictCfg === 'refreshed' || verdictDemigods === 'refreshed') {
      console.log(`[lane-config] lane ${laneRoot} drifted from the root config — REFRESHED (cfg=${verdictCfg}, demigods=${verdictDemigods})`);
    }
    // (c) THE .opencode SYMLINK — the piece the #99 lanes always had and
    // the UAT-4 specimen proved is load-bearing: the config's `{file:...}`
    // references resolve through this symlink to the repo's prompts,
    // skills, and agents. Without it every `{file:.opencode/...}` dies.
    if (!existsSync(dstDotOpenCode)) {
      const srcDotOpenCode = join(root, '.opencode');
      if (existsSync(srcDotOpenCode)) {
        symlinkSync(srcDotOpenCode, dstDotOpenCode, 'dir');
      }
    }
    // (e) W-R THE GLOBAL CRAFT MCP — the discovery truth (the 21:5X
    // specimens): the repo-root run loads the repo .mcp.json, but hop
    // spawns with cwd = the LANE see NONE of it (the lane .mcp.json above
    // was still invisible to the run — the opencode config discovery does
    // not resolve it from a non-repo cwd). The ONE config surface every
    // opencode process reads — the app's serve, every `opencode run`,
    // every hop, any cwd — is the GLOBAL config (~/.config/opencode/
    // opencode.json). The craft MCP rides it, machine-local by nature
    // (it talks to the app server on OLYMPUS_APP_PORT), the path anchored
    // to THIS app root at runtime. Idempotent: only the olympus-craft
    // entry is asserted; the user's own config stays untouched.
    try {
      const globalCfgPath = join(homedir(), '.config', 'opencode', 'opencode.json');
      let globalCfg: any = {};
      try { globalCfg = JSON.parse(readFileSync(globalCfgPath, 'utf-8')); } catch { /* absent = create fresh */ }
      if (!globalCfg || typeof globalCfg !== 'object') globalCfg = {};
      if (!globalCfg.mcp || typeof globalCfg.mcp !== 'object') globalCfg.mcp = {};
      const desired = {
        type: 'local',
        command: ['node', join(root, 'scripts', 'mcp-craft-server.mjs')],
        enabled: true,
      };
      const current = globalCfg.mcp['olympus-craft'];
      const same = Array.isArray(current?.command)
        && current.command[0] === desired.command[0]
        && current.command[1] === desired.command[1]
        && current.enabled === true;
      if (!same) {
        globalCfg.mcp['olympus-craft'] = desired;
        mkdirSync(dirname(globalCfgPath), { recursive: true });
        writeFileSync(globalCfgPath, JSON.stringify(globalCfg, null, 2), 'utf-8');
        console.log(`[lane-config] global craft MCP asserted (the one surface every opencode process reads — path anchored to ${root})`);
      }
    } catch { /* the global MCP assert is best-effort — the dispatch names the failure */ }
    // the hop spawns run with cwd = the LANE, and opencode resolves
    // .mcp.json relative to it — the repo's MCP file never reaches the
    // hops, so `olympus-craft` (command: `node scripts/mcp-craft-server.mjs`,
    // a RELATIVE path) died "module not found" in every hop while working
    // at the repo root. The lane gets its own .mcp.json: the repo registry
    // copied, with every `node <relative-script>` entry rewritten to the
    // ABSOLUTE repo path (npx/uvx entries are cwd-independent already).
    // REFRESH-ON-DRIFT like the config copies — the root is the truth.
    try {
      const srcMcp = join(root, '.mcp.json');
      const dstMcp = join(laneRoot, '.mcp.json');
      if (existsSync(srcMcp)) {
        const reg = JSON.parse(readFileSync(srcMcp, 'utf-8'));
        for (const entry of Object.values<any>(reg.mcpServers || {})) {
          if (typeof entry?.command === 'string' && entry.command === 'node'
            && Array.isArray(entry.args) && typeof entry.args[0] === 'string'
            && !isAbsolute(entry.args[0]) && !entry.args[0].startsWith('.')) {
            // a bare relative script (scripts/...) — anchor it to the repo.
            const resolved = join(root, entry.args[0]);
            if (existsSync(resolved)) entry.args[0] = resolved;
          }
        }
        const laneMcp = JSON.stringify(reg, null, 2);
        let drifted = true;
        try {
          drifted = readFileSync(dstMcp, 'utf-8') !== laneMcp;
        } catch { /* absent = drifted */ }
        if (drifted) {
          writeFileSync(dstMcp, laneMcp, 'utf-8');
          console.log(`[lane-config] lane .mcp.json refreshed (the MCP registry, craft paths anchored to ${root})`);
        }
      }
    } catch { /* the MCP lane is best-effort — the dispatch names the failure */ }
    // v0.0.30 (#B3) — re-apply the campaign manifest AFTER the root config
    // refresh. The refresh copies the root over the lane; without this the
    // 16-server fleet would be back before the next hop.
    const manifest = getRunMcpManifest(laneRoot);
    if (manifest) {
      const applied = applyRunManifestFile(laneRoot, manifest);
      if (!applied.ok) console.log(`[lane-config] MCP manifest not applied: ${applied.error}`);
    }
    // v0.0.31 (R31-09) — lean hop agents + no overlay plugins in the lane.
    // Runs AFTER the manifest so the config is already the hop shape.
    const variants = applyHopAgentVariants(dst);
    if (variants.changed) {
      console.log(`[lane-config] hop agent variants refreshed (${variants.created} change(s)) — lean toolset, overlay plugins intact`);
    }
  } catch { /* the dispatch itself will name the failure */ }
}

// ─── The spine ────────────────────────────────────────────────────────────────

export interface WalkResult {
  completed: string[];
  parked: (HopPark & { verify?: HopVerifyResult }) | null;
  /** Every telemetry row written this walk. */
  rows: HopTelemetryRow[];
}

/** #117 (PLANO-MASTER-1 B3): the live narration events — the product flow
 * bridges these to the terminal stream (WHO the god is, WHERE the lane is,
 * what happened) so the walk is visible while it runs. */
export type HopWalkEvent = (
  | { type: 'hop_start'; hop: string; god: string; artifacts?: string[]; arsenal?: string[]; skill?: string; mcp?: string; demigod?: string }
  /** W-T HOP-HEARTBEAT: the long-hop visibility — every 45s the in-flight
   *  hops narrate their elapsed time (the 'demora mt' cure: a silent
   *  2-minute spawn reads as a hang; a heartbeat reads as work). */
  | { type: 'hop_heartbeat'; hop: string; god: string; elapsedMs: number }
  | { type: 'hop_done'; hop: string; god: string; durationMs: number; tokensIn: number | null; tokensOut: number | null; retriesAbsorbed: number; transport?: 'warm' | 'spawn' }
  | { type: 'hop_parked'; hop: string; god: string; reason: string; error?: string }
) & { campaignId?: string };

export interface WalkOptions {
  plan: DispatchPlan | unknown;
  /** Injected dispatcher (fixtures). Defaults to the live spawn dispatcher. */
  dispatcher?: HopDispatcher;
  /** Resume from the state file (skip completed, re-run the parked hop). */
  resume?: boolean;
  /** Where the state + telemetry live. Defaults to the plan's laneRoot. */
  stateDir?: string;
  /** v0.0.24 (#226): the campaign identity from the walk lock. */
  campaignId?: string;
  /**
   * v0.0.85 — a MACHINE resume (overnight auto-resume, boot orphan pickup)
   * must not re-run the hops that already parked in this campaign: they
   * stalled for a reason (AIME 06:51: three dispatch-failed hops of 34–40
   * min were retried from scratch). The HUMAN's explicit resume clears the
   * quarantine and retries — the docs' contract.
   */
  keepQuarantine?: boolean;
  /**
   * v0.0.84 edit — the OVERNIGHT auto-resume gives the MOST RECENT parked hop
   * one bounded retry (the old S4c contract) while keeping the older parked
   * hops quarantined. Boot/orphan pickup does not set it.
   */
  retryParkedHop?: boolean;
  /** #117: the live narration bridge (optional — the battery fixtures omit it). */
  onEvent?: (ev: HopWalkEvent) => void;
}

interface WalkTask {
  hop: PlanHop;
  startedAt: number;
  /** Set when the hop's body fully finished (result recorded). */
  done: boolean;
  promise: Promise<void>;
}

/**
 * Walk the dispatch-plan DAG. Small hops, deterministic verify, park on
 * failure, resume from the state file. A dispatch that fails after both
 * transports is QUARANTINED (v0.0.31): independent hops keep running, the
 * quarantined hop is never retried automatically, and a systemic park rate
 * stops the campaign named. A manual resume clears the quarantine and
 * retries — the human's explicit decision.
 */
export async function walkPlan(opts: WalkOptions): Promise<WalkResult> {
  const v = validateDispatchPlan(opts.plan);
  if (v.ok && v.warnings?.length) {
    for (const w of v.warnings.slice(0, 12)) {
      console.log(`[hop-runtime] plan warning: ${w}`);
      opts.onEvent?.({ type: 'log', msg: `plan warning: ${w}` } as any);
    }
  }
  if (!v.ok) {
    throw new Error(`[hop-runtime] garbage plan — refusing to walk:\n${v.errors.map((e) => `  - ${e}`).join('\n')}`);
  }
  // v0.0.55 — the DAG balance pass: only unambiguous artifacts move, never
  // script hops. A single god owning >40% of a plan serializes the critical
  // path on that pool (the AIME Athena-16 specimen).
  const balanced = balancePlan(v.plan);
  const plan = balanced.plan;
  if (balanced.changes.length > 0) {
    console.log(`[hop-runtime] DAG balance: ${balanced.changes.map((c) => `${c.hop} ${c.from}->${c.to}`).join(', ')}`);
  }
  const laneRoot = plan.laneRoot;
  const stateDir = opts.stateDir ?? laneRoot;
  const dispatch = opts.dispatcher ?? spawnHopDispatcher;
  // v0.0.24 (#226): every narration event carries the campaign id, so the
  // activity feed can group the hop chain without guessing.
  const emit = (ev: HopWalkEvent) => opts.onEvent?.({ ...ev, campaignId: opts.campaignId });

  // #121: the lane config bootstrap BEFORE any dispatch — the intake home
  // must carry the config copy the #99 lanes always had, or every hop dies
  // ProviderModelNotFound (the B7 live specimen).
  ensureLaneConfig(laneRoot);
  // v0.0.30 (#B3) — the campaign's MCP manifest, derived from the plan's
  // own `hop.mcp` fields + the curated baseline. Applied to the lane before
  // the first dispatch; ensureLaneConfig re-applies it after every refresh.
  const runManifest = buildRunMcpManifest(plan, laneRoot);
  setRunMcpManifest(laneRoot, runManifest);
  try {
    const applied = applyRunManifestFile(laneRoot, runManifest);
    if (applied.ok) {
      console.log(`[hop-runtime] MCP manifest for ${laneRoot}: ${applied.enabled.join(', ') || '(none)'} (${applied.changed} flag(s) changed)`);
    } else {
      console.log(`[hop-runtime] MCP manifest not applied: ${applied.error}`);
    }
  } catch (e: any) {
    console.log(`[hop-runtime] MCP manifest failed: ${e?.message || String(e)}`);
  }

  // State: resume honors the disk; a fresh walk resets it. The parked hop
  // (if any) is NOT in `completed`, so the DAG naturally re-runs it.
  const loaded = opts.resume ? loadHopState(stateDir) : null;
  // #244 (v0.0.23): a resumed walk drops inFlight entries left by a dead
  // campaign (the lock we hold is the proof no other walk owns them).
  const pruned = loaded ? pruneStaleInFlight(loaded) : null;
  const state = pruned ? pruned.state : null;
  if (pruned && pruned.dropped.length) {
    console.log(`[walker] dropped ${pruned.dropped.length} stale in-flight hop(s): ${pruned.dropped.join(', ')} — they re-enter the DAG`);
  }
  const completed = new Set<string>(state?.completed ?? []);
  // v0.0.85 — A PARK IS TRUTH ON DISK. The initial save below used to write
  // `parked: null`, so a walk killed between its first write and its first
  // completion erased the reason the user needed (AIME 06:51: 55/78, no
  // in-flight, `parked: null`, and no process — a silent stop). The prior
  // park survives until the parked hop is re-run and PASSES, or a new park
  // replaces it.
  const priorPark = state?.parked && !completed.has(state.parked.hopId) ? state.parked : null;
  let parkedHop: (HopPark & { verify?: HopVerifyResult }) | null = priorPark;
  // v0.0.85 — QUARANTINE SURVIVES A MACHINE RESUME. The AIME 06:51 specimen:
  // three hops parked on dispatch-failed (34–40 min each) and the overnight
  // auto-resume re-ran the same three from scratch because the set was always
  // rebuilt empty. The human's explicit resume still clears it.
  const quarantined = new Set<string>(opts.keepQuarantine ? (state?.quarantined ?? []) : []);
  // v0.0.84 edit — one bounded retry for the hop that parked last, not the
  // whole quarantine. The overnight auto-resume sets this; a boot/orphan
  // pickup keeps the quarantine intact; a human resume clears it entirely.
  if (opts.retryParkedHop && state?.parked?.hopId) quarantined.delete(state.parked.hopId);
  const rows: HopTelemetryRow[] = [];

  // #RESTART-SPECIMEN (2026-10-16, 22:27): the walk died mid-hop-1 (the app
  // restart killed the dev server) with NO state on disk — the campaign was
  // stranded (plan present, zero hop-state, no resume surface). Persist the
  // INITIAL state BEFORE the first dispatch: any kill — app restart, server
  // crash, machine power — leaves a resumable campaign on disk. The disk
  // carries the campaign, from second zero.
  saveHopState(stateDir, {
    version: 1,
    completed: [...completed],
    parked: parkedHop,
    campaignId: opts.campaignId,
    quarantined: [...quarantined],
    inFlight: [],
    updatedAt: new Date().toISOString(),
  });

  const pending = plan.hops.filter((h) => !completed.has(h.id));
  const byId = new Map(plan.hops.map((h) => [h.id, h]));
  const ready = (h: PlanHop) => (h.after ?? []).every((dep) => completed.has(dep));

  let stopped = false;
  // v0.0.83 — the user lane. While a chat/mark/voice lease is live, NEW hops
  // wait; the in-flight hop finishes, nothing is lost. The check is bounded by
  // the lease TTL (max 5 min) and the campaign deadline.
  let userPauseTimer: ReturnType<typeof setTimeout> | null = null;
  let userPauseAnnounced = false;
  /**
   * v0.0.31 (R31-02) — THE PARK CIRCUIT BREAKER.
   *
   * Before this, the FIRST park stopped the whole campaign, and a resume
   * re-ran the same hop into the same stall (AIME: v8-back-nav parked twice,
   * 20m43s + 10m28s). A dispatch that fails after both transports is now
   * quarantined: independent hops keep running, the quarantined hop is never
   * retried automatically, and a systemic park rate stops the walk named.
   */
  let attempts = 0;
  let parks = 0;
  const parkHop = (hop: PlanHop, reason: string, error?: string, verify?: HopVerifyResult): void => {
    parks += 1;
    quarantined.add(hop.id);
    parkedHop = {
      hopId: hop.id,
      reason,
      ts: new Date().toISOString(),
      error,
      ...(verify ? { verify } : {}),
    };
    emit({ type: 'hop_parked', hop: hop.id, god: hop.god, reason, error });
    // ≥50% of attempts parked after at least 4 attempts = the lane/system is
    // sick, not the hop. Stop named instead of burning the remaining hops.
    if (attempts >= 4 && parks / Math.max(1, attempts) >= 0.5) {
      stopped = true;
      parkedHop = { ...parkedHop, reason: 'systemic-failure' };
      emit({
        type: 'hop_parked', hop: hop.id, god: hop.god, reason: 'systemic-failure',
        error: `${parks}/${attempts} attempts parked — stopping the campaign instead of retrying every hop`,
      });
    }
  };
  const telemetryRow = (hop: PlanHop, r: HopDispatchResult | null, status: string, startedAt: number): HopTelemetryRow => {
    // `lane` is the MODEL lane (the pool the hop actually ran on), not the
    // project directory. The dir is already in every other row/event and the
    // hop state; writing it here made the telemetry's lane column useless for
    // the one question it exists to answer ("which pool served this hop?").
    // When the failover moved the hop, the dispatch result names the real lane.
    const row: HopTelemetryRow = {
      ts: new Date().toISOString(),
      hop: hop.id,
      god: hop.god,
      lane: r?.lane ?? resolveGodModelLane(hop.god) ?? laneRoot,
      tokensIn: r?.tokensIn ?? null,
      tokensOut: r?.tokensOut ?? null,
      durationMs: Date.now() - startedAt,
      retriesAbsorbed: r?.retriesAbsorbed ?? 0,
      status,
      reasoning: r?.reasoning ?? undefined,
      sessionId: r?.sessionId ?? undefined,
      transport: r?.transport,
      ...(r?.output ? { outputTail: String(r.output).slice(-2_000) } : {}),
    };
    appendHopTelemetry(stateDir, row);
    // v0.0.85 — THE SAME EVENT REACHES THE PC AND THE PHONE. The desktop
    // notification file is the one feed both surfaces read; appending here
    // means a hop settle is no longer visible only in the terminal. The
    // phone localizes its own derived text and shows the provenance.
    try {
      const ok = status === 'completed';
      const lang = readLanguage();
      const slug = basename(stateDir);
      const secs = Math.max(0, Math.round(row.durationMs / 1000));
      const duration = secs >= 3600
        ? `${Math.floor(secs / 3600)}h${Math.round((secs % 3600) / 60)}m`
        : secs >= 60 ? `${Math.floor(secs / 60)}m${secs % 60}s` : `${secs}s`;
      appendDesktopNotify({
        type: ok ? 'ready' : 'error',
        title: notifyText(lang, ok ? 'hop.title' : 'hopPark.title'),
        body: notifyText(lang, ok ? 'hop.body' : 'hopPark.body', {
          slug,
          god: row.god,
          hop: row.hop,
          duration,
          reason: String(status).replace(/^parked-/, ''),
        }),
        hop: row.hop,
        god: row.god,
        slug,
        status,
      });
    } catch { /* a notification never blocks a hop */ }
    rows.push(row);
    return row;
  };

  // v0.0.38 — the campaign deadline. The clock starts with the walk, not with
  // the first hop. v0.0.55: an explicit hibernation plan (hours) authorizes a
  // longer autonomous window; it is still capped at 24h and every hop remains
  // clipped to it.
  const hibPlan = readHibernationPlan();
  const hibLeft = hibPlan ? Date.parse(hibPlan.until) - Date.now() : 0;
  const budgetMs = hibPlan && hibLeft > 0
    ? Math.max(60 * 60_000, Math.min(24 * 3600_000, hibLeft))
    : resolveCampaignBudgetMs();
  const deadlineAt = Date.now() + budgetMs;
  let budgetTimer: ReturnType<typeof setTimeout> | null = null;

  await new Promise<void>((resolveWalk) => {
    const inFlight = new Map<string, WalkTask>();
    let concurrency = resolveHopConcurrency();
    // W-D2 (v0.0.6 MISSION-CONTROL-TRUE): the persisted RUNNING set — written
    // on every launch + settle, so the tasks sheet has GROUND TRUTH about
    // which hops are running right now (telemetry rows land only at settle;
    // before this, a running hop was indistinguishable from a pending one).
    const persistState = () => {
      try {
        saveHopState(stateDir, {
          version: 1,
          completed: [...completed],
          parked: parkedHop,
          campaignId: opts.campaignId,
          quarantined: [...quarantined],
          inFlight: [...inFlight.values()].map((t) => ({
            hopId: t.hop.id,
            startedAt: new Date(t.startedAt).toISOString(),
            god: t.hop.god,
            artifacts: t.hop.artifacts,
            skill: t.hop.skill,
            mcp: t.hop.mcp,
            demigod: t.hop.demigod,
            status: 'running' as const,
            lastHeartbeatAt: new Date().toISOString(),
          })),
          updatedAt: new Date().toISOString(),
        });
      } catch { /* a state-write failure must never kill the walk */ }
    };
    const launch = () => {
      if (stopped) return;
      // Hard budget: never launch a new hop after the deadline, and never
      // launch one with less than the useful slice left — that only buys a
      // ceiling-kill park. In-flight hops finish (their ceiling was clipped);
      // pending hops stay resumable.
      const budgetLeft = deadlineAt - Date.now();
      if (budgetLeft < MIN_HOP_LAUNCH_MS) {
        stopped = true;
        const nextPending = pending.find((h) => !completed.has(h.id) && !quarantined.has(h.id) && !inFlight.has(h.id));
        if (!parkedHop && nextPending) {
          parkedHop = {
            hopId: nextPending.id,
            reason: 'campaign-budget',
            ts: new Date().toISOString(),
            error: budgetLeft > 0
              ? `campaign budget has ${Math.round(budgetLeft / 1000)}s left — below the ${Math.round(MIN_HOP_LAUNCH_MS / 1000)}s launch floor; resume from this hop (nothing was lost)`
              : `campaign budget of ${Math.round(budgetMs / 60_000)} min reached — resume from this hop (nothing was lost)`,
          };
          emit({ type: 'hop_parked', hop: nextPending.id, god: nextPending.god, reason: 'campaign-budget', error: parkedHop.error });
        }
        persistState();
        return;
      }
      if (userIsActive()) {
        if (!userPauseAnnounced) {
          userPauseAnnounced = true;
          emit({ type: 'log', msg: 'user is active — holding NEW hops so the human turn gets the lane' } as any);
        }
        if (!userPauseTimer) {
          userPauseTimer = setTimeout(() => { userPauseTimer = null; launch(); }, 1500);
          userPauseTimer.unref?.();
        }
        return;
      }
      if (userPauseAnnounced) {
        userPauseAnnounced = false;
        emit({ type: 'log', msg: 'user lane idle — resuming the campaign' } as any);
      }
      while (inFlight.size < concurrency) {
        // #POOL-CONTENTION: count the in-flight hops per provider lane; a
        // saturated lane's hops wait (other-pool hops can still launch).
        const perPool = new Map<string, number>();
        for (const t of inFlight.values()) {
          const lane = resolveGodModelLane(t.hop.god) ?? 'unknown';
          perPool.set(lane, (perPool.get(lane) ?? 0) + 1);
        }
        const next = pending.find((h) => {
          if (!ready(h) || inFlight.has(h.id) || completed.has(h.id) || quarantined.has(h.id)) return false;
          const lane = resolveGodModelLane(h.god) ?? 'unknown';
          // #LANE-CAP: the cap depends on the LANE CLASS (a free NVIDIA pool
          // tolerates 2; a paid/plan lane rides the full global cap).
          return (perPool.get(lane) ?? 0) < maxHopsPerPoolFor(lane);
        });
        if (!next) return;
        // v0.0.72 — THE SPEND BRAKE. The campaign deadline bounded TIME;
        // nothing bounded MONEY. Caps are opt-in (no caps file/env = the walk
        // is unlimited). When a cap fires the hop is parked by NAME and the
        // walk stops: a budget is a human decision, not a transient error to
        // retry. The list value is the measured unit (a subscription reports a
        // $0 invoice while still burning quota).
        const capVerdict = checkCostCaps();
        if (!capVerdict.ok) {
          stopped = true;
          const reason = capVerdict.window === '5h' ? 'cost-cap-5h' : capVerdict.window === 'weekly' ? 'cost-cap-weekly' : 'cost-cap-monthly';
          parkedHop = { hopId: next.id, reason, ts: new Date().toISOString(), error: capVerdict.reason };
          emit({ type: 'hop_parked', hop: next.id, god: next.god, reason, error: capVerdict.reason });
          persistState();
          return;
        }
        // #SACRED-RUNTIME: self-healing lane — a god (or anything) may have
        // deleted the runtime config mid-walk (the 10:16 specimen killed the
        // NEXT hop with "Model not found"). Re-assert the lane config before
        // every dispatch: config, demigods, symlink — idempotent, cheap.
        try { ensureLaneConfig(laneRoot); } catch { /* the dispatch names the failure */ }
        // v0.0.30 (#C6/#H9) — THE DATA GATE. The AIME `g2-profile` hop wiped
        // a 226-work live database at 23:01:10Z because nothing copied it
        // before the destructive prompt ran. A destructive hop with a lane
        // database MUST back it up first; a failed backup parks the hop
        // before a single token is spent.
        const dataGuard = backupBeforeDestructiveHop(laneRoot, next);
        if (dataGuard.error) {
          stopped = true;
          parkedHop = {
            hopId: next.id, reason: 'destructive-backup-failed',
            ts: new Date().toISOString(), error: dataGuard.error,
          };
          emit({ type: 'hop_parked', hop: next.id, god: next.god, reason: 'destructive-backup-failed', error: dataGuard.error });
          persistState();
          return;
        }
        if (dataGuard.needed && dataGuard.backup?.dir) {
          console.log(`[hop-guard] destructive hop '${next.id}' — database backed up to ${dataGuard.backup.dir} (${dataGuard.backup.files.join(', ')})`);
        }
        const startedAt = Date.now();
        attempts += 1;
        const task: WalkTask = { hop: next, startedAt, done: false, promise: Promise.resolve() };
        inFlight.set(next.id, task);
        // #PANTHEON-RAIL: the hop's ARTIFACTS ride the start event — the
        // rail shows WHAT each god is creating (the file list from the
        // plan), not just that it started.
        emit({ type: 'hop_start', hop: next.id, god: next.god, artifacts: next.artifacts, skill: next.skill, mcp: next.mcp, demigod: next.demigod });
        persistState();
        task.promise = (async () => {
          // #CRASH-ARMOR (the 05:42 specimen): the DEV SERVER DIED on an
          // unhandled rejection — a task-promise rejection propagates
          // through settle's Promise.race, settle is void'd, and Node kills
          // the process: the whole campaign dies mid-walk with zero
          // narration. The armor: the task body can NEVER throw — every
          // failure becomes a parked result.
          try {
          let result: HopDispatchResult;
          try {
            result = next.kind === 'script'
              ? await runScriptHop(next, laneRoot)
              : await dispatch(next, { laneRoot, prompt: await composeHopPromptWithRag(next, laneRoot), deadlineAt });
          } catch (e) {
            result = {
              ok: false, exitCode: null, output: '', tokensIn: null, tokensOut: null,
              retriesAbsorbed: 0, exhausted: false,
              error: e instanceof Error ? e.message : String(e),
            };
          }
          // v0.0.59 — token truth after the turn: a spawn hop can finish with
          // a null token pair when the JSON stream did not carry step totals.
          // The session row in the hop DB is the same source the warm path
          // trusts; fill the gap instead of reporting “—”.
          if (!result.ok || result.tokensIn == null || result.tokensOut == null) {
            try {
              const totals = await readSessionTotals(result.sessionId ?? null);
              if (totals && (totals.input > 0 || totals.output > 0)) {
                result = { ...result, tokensIn: result.tokensIn ?? totals.input, tokensOut: result.tokensOut ?? totals.output };
              }
            } catch { /* a missing row is not a hop failure */ }
          }
          // #241 — the scheduler learns from the hop that just settled.
          concurrency = nextConcurrency(concurrency, result.ok
            ? 'ok'
            : (/overload|429|rate.?limit/i.test(result.error ?? '') ? 'overload' : 'hang'));
          // v0.0.27 — ARTIFACT RESCUE. The 21:47 specimen: the hop wrote
          // dashboard/page.tsx, then the stream hung to the ceiling and the
          // walker parked a FINISHED hop for 10 minutes. Verify BEFORE
          // parking: an artifact that passes is a completed hop.
          //
          // v0.0.31 — BUT NEVER FOR A CONFIG ERROR. `Agent not found` means
          // the turn never ran; rescuing on pre-existing artifacts marked a
          // hop complete with zero work (AIME r1, 2026-11-01). The transport
          // now respawns and retries on spawn; if it still fails, park named.
          if (!result.ok && next.kind !== 'script' && !isConfigSelectionError(result)) {
            const rescue = verifyHopDeterministic(next, laneRoot);
            if (rescue.ok) {
              result = { ...result, ok: true, error: `artifact rescue: ${result.error ?? 'dispatch failed after writing the artifacts'}` };
            }
          }
          if (result.ok) {
            const verify = verifyHopDeterministic(next, laneRoot);
            if (verify.ok) {
              completed.add(next.id);
              // v0.0.85 — the hop that was parked re-ran and PASSED: the park
              // is no longer the campaign's state.
              if (parkedHop?.hopId === next.id) parkedHop = null;
              telemetryRow(next, result, 'completed', startedAt);
              emit({
                type: 'hop_done', hop: next.id, god: next.god,
                durationMs: Date.now() - startedAt, tokensIn: result.tokensIn,
                tokensOut: result.tokensOut, retriesAbsorbed: result.retriesAbsorbed,
                transport: result.transport,
              });
            } else {
              parkHop(next, 'verify-failed', verify.checks.find((c) => !c.ok)?.detail, verify);
              telemetryRow(next, result, 'parked-verify-failed', startedAt);
            }
          } else if (next.kind === 'script') {
            parkHop(next, 'script-failed', result.error);
            telemetryRow(next, result, 'parked-script-failed', startedAt);
          } else if (result.exhausted) {
            parkHop(next, 'retry-exhausted', result.error);
            telemetryRow(next, result, 'parked-retry-exhausted', startedAt);
          } else {
            parkHop(next, 'dispatch-failed', result.error);
            telemetryRow(next, result, 'parked-dispatch-failed', startedAt);
          }
          task.done = true;
          } catch (e) {
            // The armor: post-dispatch failures (verify, telemetry, the
            // event bridge) park NAMED instead of rejecting the promise.
            parkHop(next, 'walker-internal-error', e instanceof Error ? e.message : String(e));
            try {
              telemetryRow(next, null, 'parked-walker-internal-error', startedAt);
            } catch { /* never again */ }
            task.done = true;
          }
        })();
      }
    };
    const settle = async () => {
      // #CRASH-ARMOR: settle is void'd — a rejection here is UNHANDLED and
      // kills the server process (the 05:42 death). The loop body never
      // throws; the walk always resolves with the truth on disk.
      try {
      while (inFlight.size > 0) {
        await Promise.race([...inFlight.values()].map((t) => t.promise));
        for (const [id, t] of [...inFlight.entries()]) {
          if (t.done) inFlight.delete(id);
        }
        // Persist durable progress after each settle — the disk carries the campaign.
        persistState();
        launch();
      }
      } catch { /* the armor: settle NEVER rejects */ }
      // In-flight drained: either every hop completed, or a park stopped
      // the campaign. The result tells the truth.
      const stopWalkHeartbeat = (inFlight as any).__stopHeartbeat as (() => void) | undefined;
      if (stopWalkHeartbeat) stopWalkHeartbeat();
      if (budgetTimer) clearTimeout(budgetTimer);
      budgetTimer = null;
      resolveWalk();
    };
    const stopHeartbeat = (inFlight as any).__stopHeartbeat as (() => void) | undefined;
    if (stopHeartbeat) stopHeartbeat();
    // W-T HOP-HEARTBEAT: the long-hop narration loop.
    const heartbeat = setInterval(() => {
      const now = Date.now();
      for (const t of inFlight.values()) {
        const elapsed = now - t.startedAt;
        if (elapsed >= 45_000) {
          emit({ type: 'hop_heartbeat', hop: t.hop.id, god: t.hop.god, elapsedMs: elapsed });
        }
      }
      if (inFlight.size > 0) persistState();
    }, 45_000);
    (inFlight as any).__stopHeartbeat = () => clearInterval(heartbeat);
    // The timer is the hard wall: it flips `stopped` and names the resume
    // point even if every hop is silent.
    const budgetLeft = Math.max(1_000, deadlineAt - Date.now());
    budgetTimer = setTimeout(() => {
      if (stopped) return;
      stopped = true;
      const nextPending = pending.find((h) => !completed.has(h.id) && !quarantined.has(h.id) && !inFlight.has(h.id));
      if (!parkedHop && nextPending) {
        parkedHop = {
          hopId: nextPending.id,
          reason: 'campaign-budget',
          ts: new Date().toISOString(),
          error: `campaign budget of ${Math.round(budgetMs / 60_000)} min reached — resume from this hop (nothing was lost)`,
        };
        emit({ type: 'hop_parked', hop: nextPending.id, god: nextPending.god, reason: 'campaign-budget', error: parkedHop.error });
      }
      persistState();
    }, budgetLeft);
    launch();
    void settle();
  });

  // The walk is over: the final state clears the RUNNING set (nothing is
  // in flight anymore — the file never lies about liveness).
  saveHopState(stateDir, {
    version: 1,
    completed: [...completed],
    parked: parkedHop,
    campaignId: opts.campaignId,
    quarantined: [...quarantined],
    inFlight: [],
    updatedAt: new Date().toISOString(),
  });
  return { completed: [...completed], parked: parkedHop, rows };
}
