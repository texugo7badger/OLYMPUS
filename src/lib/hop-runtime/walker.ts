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
import { appendFileSync, existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { syncLaneFile } from '@/lib/lane-config';
import { validateDispatchPlan, MAX_HOP_BUDGET_TOKENS, type DispatchPlan, type PlanHop } from './plan-schema';
import { loadHopState, saveHopState, hopStatePath, type HopPark } from './hop-state';
import { verifyHopDeterministic, type HopVerifyResult } from './verify';
import { spawnOpencode, findOlympusRoot } from '@/lib/opencode-spawn';
import { classifyRetry, resolveRetryPlan, applyRetryJitter } from '@/lib/opencode-session';

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
  error?: string;
}

export type HopDispatcher = (hop: PlanHop, ctx: {
  laneRoot: string;
  /** The composed prompt: the slice + the file pointers — never full context. */
  prompt: string;
}) => Promise<HopDispatchResult>;

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
  return lines.join('\n');
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
}

/** Parse `opencode run --format json` events: text parts + step-finish tokens.
 *  The CLI emits two shapes (probe-verified 2026-10-09): the wrapped
 *  `{type, part}` events and bare `{type:'step-finish', tokens}` lines —
 *  both are honored. */
function parseJsonEvents(raw: string): JsonEventParse {
  const acc: JsonEventParse = { textOut: '', tokensIn: 0, tokensOut: 0 };
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const ev = JSON.parse(t);
      const part = ev?.data?.part ?? ev?.part ?? ev;
      if (part?.type === 'text' && typeof part.text === 'string') acc.textOut += part.text;
      if (part?.type === 'step-finish' || ev?.type === 'step-finish' || ev?.type === 'step_finish') {
        const tokens = part?.tokens ?? ev?.tokens;
        if (tokens) {
          acc.tokensIn += n(tokens.input);
          acc.tokensOut += n(tokens.output);
        }
      }
    } catch { /* not a JSON line — ignore */ }
  }
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

function runSpawn(args: string[], hopCwd: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveP) => {
    const child = spawnOpencode(args, { cwd: hopCwd });
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
 * The default hop dispatcher: one fresh one-shot session per hop on the
 * god's live model lane (the FREE-1 §6.2 transport — sessions are lanes),
 * with the #107 crescendo INSIDE the dispatcher: an overload burst is
 * absorbed per resolveRetryPlan(), exhaustion reported for the PARK.
 */
export const spawnHopDispatcher: HopDispatcher = async (hop, ctx) => {
  const lane = resolveGodModelLane(hop.god);
  if (!lane) {
    return {
      ok: false, exitCode: null, output: '', tokensIn: null, tokensOut: null,
      retriesAbsorbed: 0, exhausted: false,
      error: `no live model lane for god '${hop.god}' in opencode.json — cannot dispatch (reassignment is a table edit, the #106 doctrine)`,
    };
  }
  const plan = resolveRetryPlan();
  let retriesAbsorbed = 0;
  let last: { code: number | null; stdout: string; stderr: string } = { code: null, stdout: '', stderr: '' };
  for (let attempt = 0; ; attempt++) {
    // The per-hop runtime budget (#R3: env-tunable — OLYMPUS_HOP_TIMEOUT_MS;
    // the default stays 15 min).
    last = await runSpawn(
      ['run', '--model', lane, '--format', 'json', ...(resolveHopVariant() ? ['--variant', resolveHopVariant()!] : []), ctx.prompt],
      ctx.laneRoot,
      resolveHopTimeoutMs(),
    );
    const ok = last.code === 0;
    const errText = (last.stderr || '').slice(-2000) || (ok ? '' : `exit ${last.code}`);
    if (ok) {
      const parsed = parseJsonEvents(last.stdout);
      return {
        ok: true, exitCode: last.code, output: parsed.textOut || last.stdout.slice(0, 4000),
        tokensIn: parsed.tokensIn || null, tokensOut: parsed.tokensOut || null,
        retriesAbsorbed, exhausted: false,
      };
    }
    // #111 (HIGIENIA-1 H1a): the ceiling-kill — classified, never
    // classless. A provider-erroring hang counts as provider-overload
    // WITHIN the crescendo budget (absorbed, retried within maxAttempts);
    // a pure hang parks NAMED with the knob + the ceiling.
    if (last.code === null) {
      const ck = classifyCeilingKill(last.stderr);
      if (ck.kind === 'hang') {
        return { ok: false, exitCode: last.code, output: last.stdout.slice(0, 4000), tokensIn: null, tokensOut: null, retriesAbsorbed, exhausted: false, error: ck.error };
      }
      if (attempt >= plan.maxAttempts - 1) {
        return { ok: false, exitCode: last.code, output: last.stdout.slice(0, 4000), tokensIn: null, tokensOut: null, retriesAbsorbed, exhausted: true, error: ck.error };
      }
      retriesAbsorbed++;
      const delay = applyRetryJitter(plan.backoffMs[attempt] ?? plan.backoffMs[plan.backoffMs.length - 1], Math.random(), plan.jitterFraction);
      await new Promise((r) => setTimeout(r, Math.min(delay, 10_000)));
      continue;
    }
    if (attempt >= plan.maxAttempts - 1) {
      return {
        ok: false, exitCode: last.code, output: last.stdout.slice(0, 4000),
        tokensIn: null, tokensOut: null, retriesAbsorbed, exhausted: true,
        error: errText,
      };
    }
    const kind = classifyRetry({ code: last.code ?? -1, error: errText, statusCode: undefined } as never);
    if (!kind) {
      return {
        ok: false, exitCode: last.code, output: last.stdout.slice(0, 4000),
        tokensIn: null, tokensOut: null, retriesAbsorbed, exhausted: false,
        error: errText,
      };
    }
    retriesAbsorbed++;
    const base = kind === 'provider-rate-limit' ? plan.rateLimitBackoffMs : plan.backoffMs[attempt];
    const delay = kind === 'provider-overload' ? applyRetryJitter(base, Math.random(), plan.jitterFraction) : base;
    await new Promise((r) => setTimeout(r, Math.min(delay, 10_000)));
  }
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
    };
    appendHopTelemetry(stateDir, row);
    rows.push(row);
    return row;
  };

  await new Promise<void>((resolveWalk) => {
    const inFlight = new Map<string, WalkTask>();
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
          return (perPool.get(lane) ?? 0) < MAX_HOP_PER_POOL;
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
            result = await dispatch(next, { laneRoot, prompt: composeHopPrompt(next, laneRoot) });
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
        try {
          saveHopState(stateDir, {
            version: 1,
            completed: [...completed],
            parked: parkedHop,
            updatedAt: new Date().toISOString(),
          });
        } catch { /* a state-write failure must never kill the walk */ }
        launch();
      }
      } catch { /* the armor: settle NEVER rejects */ }
      // In-flight drained: either every hop completed, or a park stopped
      // the campaign. The result tells the truth.
      resolveWalk();
    };
    launch();
    void settle();
  });

  saveHopState(stateDir, {
    version: 1,
    completed: [...completed],
    parked: parkedHop,
    updatedAt: new Date().toISOString(),
  });
  return { completed: [...completed], parked: parkedHop, rows };
}
