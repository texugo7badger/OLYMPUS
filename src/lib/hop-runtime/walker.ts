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
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { validateDispatchPlan, MAX_HOP_BUDGET_TOKENS, type DispatchPlan, type PlanHop } from './plan-schema';
import { loadHopState, saveHopState, hopStatePath, type HopPark } from './hop-state';
import { verifyHopDeterministic, type HopVerifyResult } from './verify';
import { spawnOpencode, findOlympusRoot } from '@/lib/opencode-spawn';
import { classifyRetry, resolveRetryPlan, applyRetryJitter } from '@/lib/opencode-session';

/** The #106 law: never more than 3 gods riding pools at once. */
export const MAX_HOP_CONCURRENCY = 3;

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

/** Parse `opencode run --format json` events: text parts + step-finish tokens. */
function parseJsonEvents(raw: string): JsonEventParse {
  const acc: JsonEventParse = { textOut: '', tokensIn: 0, tokensOut: 0 };
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const ev = JSON.parse(t);
      const part = ev?.data?.part ?? ev?.part ?? ev;
      if (part?.type === 'text' && typeof part.text === 'string') acc.textOut += part.text;
      if (part?.type === 'step-finish' && part.tokens) {
        const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
        acc.tokensIn += n(part.tokens.input);
        acc.tokensOut += n(part.tokens.output);
      }
    } catch { /* not a JSON line — ignore */ }
  }
  return acc;
}

function runSpawn(args: string[], hopCwd: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveP) => {
    const child = spawnOpencode(args, { cwd: hopCwd });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }, timeoutMs);
    child.stdout?.on('data', (d) => { stdout += String(d); });
    child.stderr?.on('data', (d) => { stderr += String(d); });
    child.on('error', (e) => { clearTimeout(timer); resolveP({ code: -1, stdout, stderr: stderr + String(e) }); });
    child.on('close', (code) => { clearTimeout(timer); resolveP({ code, stdout, stderr }); });
  });
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
    // The per-hop runtime budget: the hop is SMALL by doctrine (<= 16k out),
    // so the ceiling is generous wall-clock, not the monolith's minutes.
    last = await runSpawn(
      ['run', '--model', lane, '--format', 'json', ctx.prompt],
      ctx.laneRoot,
      15 * 60_000,
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

// ─── The spine ────────────────────────────────────────────────────────────────

export interface WalkResult {
  completed: string[];
  parked: (HopPark & { verify?: HopVerifyResult }) | null;
  /** Every telemetry row written this walk. */
  rows: HopTelemetryRow[];
}

export interface WalkOptions {
  plan: DispatchPlan | unknown;
  /** Injected dispatcher (fixtures). Defaults to the live spawn dispatcher. */
  dispatcher?: HopDispatcher;
  /** Resume from the state file (skip completed, re-run the parked hop). */
  resume?: boolean;
  /** Where the state + telemetry live. Defaults to the plan's laneRoot. */
  stateDir?: string;
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

  // State: resume honors the disk; a fresh walk resets it. The parked hop
  // (if any) is NOT in `completed`, so the DAG naturally re-runs it.
  const state = opts.resume ? loadHopState(stateDir) : null;
  const completed = new Set<string>(state?.completed ?? []);
  let parkedHop: (HopPark & { verify?: HopVerifyResult }) | null = null;
  const rows: HopTelemetryRow[] = [];

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
        const next = pending.find((h) => ready(h) && !inFlight.has(h.id) && !completed.has(h.id));
        if (!next) return;
        const startedAt = Date.now();
        const task: WalkTask = { hop: next, startedAt, done: false, promise: Promise.resolve() };
        inFlight.set(next.id, task);
        task.promise = (async () => {
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
          } else {
            if (!stopped) {
              stopped = true;
              parkedHop = {
                hopId: next.id, reason: 'dispatch-failed',
                ts: new Date().toISOString(), error: result.error,
              };
            }
            telemetryRow(next, result, 'parked-dispatch-failed', startedAt);
          }
          task.done = true;
        })();
      }
    };
    const settle = async () => {
      while (inFlight.size > 0) {
        await Promise.race([...inFlight.values()].map((t) => t.promise));
        for (const [id, t] of [...inFlight.entries()]) {
          if (t.done) inFlight.delete(id);
        }
        // Persist durable progress after each settle — the disk carries the campaign.
        saveHopState(stateDir, {
          version: 1,
          completed: [...completed],
          parked: parkedHop,
          updatedAt: new Date().toISOString(),
        });
        launch();
      }
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
