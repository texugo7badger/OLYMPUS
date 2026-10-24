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
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { syncLaneFile } from '@/lib/lane-config';
import { validateDispatchPlan, MAX_HOP_BUDGET_TOKENS, type DispatchPlan, type PlanHop } from './plan-schema';
import { loadHopState, saveHopState, hopStatePath, type HopPark } from './hop-state';
import { composeArsenalDirective } from './arsenal';
import { composeRagContext } from '../rag-inject';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { verifyHopDeterministic, type HopVerifyResult } from './verify';
import { spawnOpencode, findOlympusRoot } from '@/lib/opencode-spawn';
import { classifyRetry, resolveRetryPlan, applyRetryJitter } from '@/lib/opencode-session';
import { markLaneAlive, markLaneDead, laneChain, isLaneDeadClass } from '@/lib/lane-health';
import { FREE_HYBRID_ROSTER } from '@/lib/model-strategies';

/** The #106 law: never more than 3 gods riding pools at once. */
export const MAX_HOP_CONCURRENCY = 3;
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
}

export type HopDispatcher = (hop: PlanHop, ctx: {
  laneRoot: string;
  /** The composed prompt: the slice + the file pointers — never full context. */
  prompt: string;
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
  const lines = [
    hop.prompt,
    '',
    '[HOP CONTRACT]',
    `Project lane root: ${laneRoot}`,
  ];
  if (hop.artifacts.length > 0) {
    lines.push(`Write these artifacts (paths relative to the lane root): ${hop.artifacts.join(', ')}`);
  }
  lines.push(`Budget: at most ${hop.budgetTokens ?? MAX_HOP_BUDGET_TOKENS} output tokens — a small hop, one god, artifacts on disk.`);
  lines.push('The spine verifies the artifacts deterministically (file-exists / build / lint). Sessions are lanes; the disk carries the campaign.');
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
export const DEFAULT_HOP_SILENCE_MS = 600_000;
export function resolveHopSilenceMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.OLYMPUS_HOP_SILENCE_MS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HOP_SILENCE_MS;
}
export const HOP_FIRST_BYTE_MARKER = 'hop-first-byte-timeout';
export function resolveHopFirstByteMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number.parseInt(env.OLYMPUS_HOP_FIRST_BYTE_MS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HOP_FIRST_BYTE_MS;
}

function runSpawn(args: string[], hopCwd: string, timeoutMs: number, laneGod?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveP) => {
    // #81 (D17/D20): the deterministic-spawn COST STAMP — the hop's god rides
    // the child's environment, so every cost row from this session resolves
    // its god WITHOUT the in-band agent or event ordering (the agent-less
    // one-shot rows that fell to 'global').
    const child = spawnOpencode(args, { cwd: hopCwd, extraEnv: laneGod ? { OLYMPUS_LANE_GOD: laneGod } : undefined });
    let stdout = '';
    let stderr = '';
    let firstByteAt: number | null = null;
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }, timeoutMs);
    // #FIRST-BYTE: a mute child is a stalled pool, not a slow hop — kill at
    // the deadline and NAME the class on stderr (the classifier reads it).
    const firstByteTimer = setTimeout(() => {
      if (firstByteAt !== null) return;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      stderr += `\n${HOP_FIRST_BYTE_MARKER} (OLYMPUS_HOP_FIRST_BYTE_MS ${resolveHopFirstByteMs()}ms): the turn produced ZERO output — the provider pool stalled before the first token (the empty-reasoning stall class; transient pool contention — retries absorb it)`;
    }, resolveHopFirstByteMs());
    // #ROLLING-SILENCE (the fixtures specimen, 05:28→05:42): the MID-RUN
    // stall class — the child EMITTED its first bytes (first-byte is happy)
    // then froze on a step-2 provider request for the rest of the ceiling.
    // The rolling deadline resets on every stdout chunk: a live hop is
    // never silent for long (its json events stream per turn); a stalled
    // one dies at the deadline, NAMED, retried. 600s default — above the
    // longest legitimate silent window (a cold `npm install` can take 2-4
    // quiet minutes; the deadline must never kill live work).
    const silenceMs = resolveHopSilenceMs();
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    const armSilence = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        stderr += `\n${HOP_FIRST_BYTE_MARKER} (OLYMPUS_HOP_SILENCE_MS ${silenceMs}ms rolling): the turn went SILENT mid-run after producing output — a step's provider request stalled (the fixtures step-2 class; transient pool contention — retries absorb it)`;
      }, silenceMs);
    };
    child.stdout?.on('data', (d) => {
      if (firstByteAt === null && String(d).trim()) firstByteAt = Date.now();
      stdout += String(d);
      if (String(d).trim()) armSilence();
    });
    child.stderr?.on('data', (d) => { stderr += String(d); });
    child.on('error', (e) => { clearTimeout(timer); clearTimeout(firstByteTimer); if (silenceTimer) clearTimeout(silenceTimer); resolveP({ code: -1, stdout, stderr: stderr + String(e) }); });
    child.on('close', (code) => { clearTimeout(timer); clearTimeout(firstByteTimer); if (silenceTimer) clearTimeout(silenceTimer); resolveP({ code, stdout, stderr }); });
    armSilence();
  });
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
/** One lane's attempt loop — the #107 crescendo, unchanged in behaviour. */
type LaneOutcome =
  | { kind: 'ok'; result: HopDispatchResult }
  | { kind: 'lane-dead'; errorClass: string | null; retryAfterMs: number | null; error: string }
  | { kind: 'failed'; result: HopDispatchResult };

async function attemptLane(
  lane: string,
  hop: PlanHop,
  ctx: { laneRoot: string; prompt: string },
  retriesAbsorbedStart: number,
): Promise<LaneOutcome> {
  const plan = resolveRetryPlan();
  let retriesAbsorbed = retriesAbsorbedStart;
  let last: { code: number | null; stdout: string; stderr: string } = { code: null, stdout: '', stderr: '' };
  const startedAt = Date.now();
  for (let attempt = 0; ; attempt++) {
    // The per-hop runtime budget (#R3: env-tunable — OLYMPUS_HOP_TIMEOUT_MS;
    // the default stays 15 min).
    last = await runSpawn(
      ['run', '--model', lane, '--format', 'json', ...(resolveHopVariant() ? ['--variant', resolveHopVariant()!] : []), ctx.prompt],
      ctx.laneRoot,
      resolveHopTimeoutMs(),
      hop.god,
    );
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
          retriesAbsorbed, exhausted: false,
        },
      };
    }
    // #V2-ERRORS: a LANE-DEAD class never retries — retrying a monthly quota
    // (retryAfterMs measured in days) or an unroutable model burns the whole
    // crescendo budget for nothing. Hand the class up so the caller can move
    // the hop to the next live lane.
    if (isLaneDeadClass(parsed.errorClass)) {
      return { kind: 'lane-dead', errorClass: parsed.errorClass, retryAfterMs: parsed.retryAfterMs, error: errText };
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
  const applied = resolveGodModelLane(hop.god);
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

  for (const lane of chain) {
    const outcome = await attemptLane(lane, hop, ctx, retriesAbsorbed);
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
 * #121 (PLANO-MASTER-1 B7) + UAT-4-FIX (E1): the lane config bootstrap —
 * the #99 lane doctrine EXTENDED to the intake home. opencode resolves its
 * config from the CWD; a hop spawned in an intake-created 02_Projects home
 * dies `ProviderModelNotFound` (the live acceptance-test specimen) — and
 * even WITH the config copy, the CLI dies on the `{file:.opencode/...}`
 * references unless the `.opencode` symlink exists (the UAT-4 specimen:
 * `Configuration is invalid ... bad file reference`). The #99 workspace
 * lanes ALWAYS get the symlink; the intake homes now do too.
 */
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
    const verdictCfg = syncLaneFile(join(root, 'opencode.json'), dst);
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
export type HopWalkEvent =
  | { type: 'hop_start'; hop: string; god: string; artifacts?: string[] }
  /** W-T HOP-HEARTBEAT: the long-hop visibility — every 45s the in-flight
   *  hops narrate their elapsed time (the 'demora mt' cure: a silent
   *  2-minute spawn reads as a hang; a heartbeat reads as work). */
  | { type: 'hop_heartbeat'; hop: string; god: string; elapsedMs: number }
  | { type: 'hop_done'; hop: string; god: string; durationMs: number; tokensIn: number | null; tokensOut: number | null; retriesAbsorbed: number }
  | { type: 'hop_parked'; hop: string; god: string; reason: string; error?: string };

export interface WalkOptions {
  plan: DispatchPlan | unknown;
  /** Injected dispatcher (fixtures). Defaults to the live spawn dispatcher. */
  dispatcher?: HopDispatcher;
  /** Resume from the state file (skip completed, re-run the parked hop). */
  resume?: boolean;
  /** Where the state + telemetry live. Defaults to the plan's laneRoot. */
  stateDir?: string;
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
 * failure, resume from the state file. The walk STOPS at the first park
 * (in-flight hops settle + record first) — the campaign never dies, it
 * parks; --resume continues from the state file.
 */
export async function walkPlan(opts: WalkOptions): Promise<WalkResult> {
  const v = validateDispatchPlan(opts.plan);
  if (!v.ok) {
    throw new Error(`[hop-runtime] garbage plan — refusing to walk:\n${v.errors.map((e) => `  - ${e}`).join('\n')}`);
  }
  const plan = v.plan;
  const laneRoot = plan.laneRoot;
  const stateDir = opts.stateDir ?? laneRoot;
  const dispatch = opts.dispatcher ?? spawnHopDispatcher;

  // #121: the lane config bootstrap BEFORE any dispatch — the intake home
  // must carry the config copy the #99 lanes always had, or every hop dies
  // ProviderModelNotFound (the B7 live specimen).
  ensureLaneConfig(laneRoot);

  // State: resume honors the disk; a fresh walk resets it. The parked hop
  // (if any) is NOT in `completed`, so the DAG naturally re-runs it.
  const state = opts.resume ? loadHopState(stateDir) : null;
  const completed = new Set<string>(state?.completed ?? []);
  let parkedHop: (HopPark & { verify?: HopVerifyResult }) | null = null;
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
    parked: null,
    inFlight: [],
    updatedAt: new Date().toISOString(),
  });

  const pending = plan.hops.filter((h) => !completed.has(h.id));
  const byId = new Map(plan.hops.map((h) => [h.id, h]));
  const ready = (h: PlanHop) => (h.after ?? []).every((dep) => completed.has(dep));

  let stopped = false;
  const telemetryRow = (hop: PlanHop, r: HopDispatchResult | null, status: string, startedAt: number): HopTelemetryRow => {
    const row: HopTelemetryRow = {
      ts: new Date().toISOString(),
      hop: hop.id,
      god: hop.god,
      lane: laneRoot,
      tokensIn: r?.tokensIn ?? null,
      tokensOut: r?.tokensOut ?? null,
      durationMs: Date.now() - startedAt,
      retriesAbsorbed: r?.retriesAbsorbed ?? 0,
      status,
      reasoning: r?.reasoning ?? undefined,
      sessionId: r?.sessionId ?? undefined,
    };
    appendHopTelemetry(stateDir, row);
    rows.push(row);
    return row;
  };

  await new Promise<void>((resolveWalk) => {
    const inFlight = new Map<string, WalkTask>();
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
          inFlight: [...inFlight.values()].map((t) => ({ hopId: t.hop.id, startedAt: new Date(t.startedAt).toISOString() })),
          updatedAt: new Date().toISOString(),
        });
      } catch { /* a state-write failure must never kill the walk */ }
    };
    const launch = () => {
      if (stopped) return;
      while (inFlight.size < MAX_HOP_CONCURRENCY) {
        // #POOL-CONTENTION: count the in-flight hops per provider lane; a
        // saturated lane's hops wait (other-pool hops can still launch).
        const perPool = new Map<string, number>();
        for (const t of inFlight.values()) {
          const lane = resolveGodModelLane(t.hop.god) ?? 'unknown';
          perPool.set(lane, (perPool.get(lane) ?? 0) + 1);
        }
        const next = pending.find((h) => {
          if (!ready(h) || inFlight.has(h.id) || completed.has(h.id)) return false;
          const lane = resolveGodModelLane(h.god) ?? 'unknown';
          // #LANE-CAP: the cap depends on the LANE CLASS (a free NVIDIA pool
          // tolerates 2; a paid/plan lane rides the full global cap).
          return (perPool.get(lane) ?? 0) < maxHopsPerPoolFor(lane);
        });
        if (!next) return;
        // #SACRED-RUNTIME: self-healing lane — a god (or anything) may have
        // deleted the runtime config mid-walk (the 10:16 specimen killed the
        // NEXT hop with "Model not found"). Re-assert the lane config before
        // every dispatch: config, demigods, symlink — idempotent, cheap.
        try { ensureLaneConfig(laneRoot); } catch { /* the dispatch names the failure */ }
        const startedAt = Date.now();
        const task: WalkTask = { hop: next, startedAt, done: false, promise: Promise.resolve() };
        inFlight.set(next.id, task);
        // #PANTHEON-RAIL: the hop's ARTIFACTS ride the start event — the
        // rail shows WHAT each god is creating (the file list from the
        // plan), not just that it started.
        opts.onEvent?.({ type: 'hop_start', hop: next.id, god: next.god, artifacts: next.artifacts });
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
            result = await dispatch(next, { laneRoot, prompt: await composeHopPromptWithRag(next, laneRoot) });
          } catch (e) {
            result = {
              ok: false, exitCode: null, output: '', tokensIn: null, tokensOut: null,
              retriesAbsorbed: 0, exhausted: false,
              error: e instanceof Error ? e.message : String(e),
            };
          }
          if (result.ok) {
            const verify = verifyHopDeterministic(next, laneRoot);
            if (verify.ok) {
              completed.add(next.id);
              telemetryRow(next, result, 'completed', startedAt);
              opts.onEvent?.({
                type: 'hop_done', hop: next.id, god: next.god,
                durationMs: Date.now() - startedAt, tokensIn: result.tokensIn,
                tokensOut: result.tokensOut, retriesAbsorbed: result.retriesAbsorbed,
              });
            } else {
              if (!stopped) {
                stopped = true;
                parkedHop = {
                  hopId: next.id, reason: 'verify-failed',
                  ts: new Date().toISOString(), error: verify.checks.find((c) => !c.ok)?.detail,
                  verify,
                };
              }
              telemetryRow(next, result, 'parked-verify-failed', startedAt);
              opts.onEvent?.({ type: 'hop_parked', hop: next.id, god: next.god, reason: 'verify-failed', error: verify.checks.find((c) => !c.ok)?.detail });
            }
          } else if (result.exhausted) {
            if (!stopped) {
              stopped = true;
              parkedHop = {
                hopId: next.id, reason: 'retry-exhausted',
                ts: new Date().toISOString(), error: result.error,
              };
            }
            telemetryRow(next, result, 'parked-retry-exhausted', startedAt);
            opts.onEvent?.({ type: 'hop_parked', hop: next.id, god: next.god, reason: 'retry-exhausted', error: result.error });
          } else {
            if (!stopped) {
              stopped = true;
              parkedHop = {
                hopId: next.id, reason: 'dispatch-failed',
                ts: new Date().toISOString(), error: result.error,
              };
            }
            telemetryRow(next, result, 'parked-dispatch-failed', startedAt);
            opts.onEvent?.({ type: 'hop_parked', hop: next.id, god: next.god, reason: 'dispatch-failed', error: result.error });
          }
          task.done = true;
          } catch (e) {
            // The armor: post-dispatch failures (verify, telemetry, the
            // event bridge) park NAMED instead of rejecting the promise.
            if (!stopped) {
              stopped = true;
              parkedHop = {
                hopId: next.id, reason: 'walker-internal-error',
                ts: new Date().toISOString(),
                error: e instanceof Error ? e.message : String(e),
              };
            }
            try {
              telemetryRow(next, null, 'parked-walker-internal-error', startedAt);
              opts.onEvent?.({ type: 'hop_parked', hop: next.id, god: next.god, reason: 'walker-internal-error', error: e instanceof Error ? e.message : String(e) });
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
          opts.onEvent?.({ type: 'hop_heartbeat', hop: t.hop.id, god: t.hop.god, elapsedMs: elapsed });
        }
      }
    }, 45_000);
    (inFlight as any).__stopHeartbeat = () => clearInterval(heartbeat);
    launch();
    void settle();
  });

  // The walk is over: the final state clears the RUNNING set (nothing is
  // in flight anymore — the file never lies about liveness).
  saveHopState(stateDir, {
    version: 1,
    completed: [...completed],
    parked: parkedHop,
    inFlight: [],
    updatedAt: new Date().toISOString(),
  });
  return { completed: [...completed], parked: parkedHop, rows };
}
