/**
 * Lumina CRM local hop-runtime walker — standalone, no Olympus deps.
 * Walks the dispatch-plan.json DAG with small LLM hops.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { validateDispatchPlan, MAX_HOP_BUDGET_TOKENS, type DispatchPlan, type PlanHop } from './plan-schema';

const MAX_HOP_CONCURRENCY = 3;
const DEFAULT_HOP_TIMEOUT_MS = 15 * 60_000;
const HOP_TELEMETRY_FILENAME = '.olympus-hop-telemetry.jsonl';

export interface HopTelemetryRow {
  ts: string;
  hop: string;
  god: string;
  lane: string;
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number;
  retriesAbsorbed: number;
  status: string;
}

export interface HopCheckResult {
  check: string;
  ok: boolean;
  detail: string;
}

export interface HopVerifyResult {
  ok: boolean;
  review: 'deterministic' | 'llm';
  checks: HopCheckResult[];
  note?: string;
}

export interface HopPark {
  hopId: string;
  reason: 'retry-exhausted' | 'verify-failed' | 'dispatch-failed';
  ts: string;
  error?: string;
}

export interface HopState {
  version: number;
  completed: string[];
  parked: (HopPark & { verify?: HopVerifyResult }) | null;
  updatedAt: string;
}

export interface HopDispatchResult {
  ok: boolean;
  exitCode: number | null;
  output: string;
  tokensIn: number | null;
  tokensOut: number | null;
  retriesAbsorbed: number;
  exhausted: boolean;
  error?: string;
}

export interface WalkResult {
  completed: string[];
  parked: (HopPark & { verify?: HopVerifyResult }) | null;
  rows: HopTelemetryRow[];
}

export interface WalkOptions {
  plan: DispatchPlan | unknown;
  dispatcher?: (hop: PlanHop, ctx: { laneRoot: string; prompt: string }) => Promise<HopDispatchResult>;
  resume?: boolean;
  stateDir?: string;
}

/** Resolve an artifact path inside the lane, refusing traversal escapes. */
function laneRelative(laneRoot: string, rel: string): string | null {
  const abs = resolve(laneRoot, rel);
  const rootAbs = resolve(laneRoot) + sep;
  if (!abs.startsWith(rootAbs) && abs !== resolve(laneRoot)) return null;
  return abs;
}

function fileExistsCheck(laneRoot: string, rel: string): HopCheckResult {
  const abs = laneRelative(laneRoot, rel);
  if (!abs) return { check: `file-exists:${rel}`, ok: false, detail: 'path escapes the lane root — refused' };
  return {
    check: `file-exists:${rel}`,
    ok: existsSync(abs),
    detail: existsSync(abs) ? 'present' : 'MISSING — the hop declared this artifact and did not write it',
  };
}

function scriptCheck(laneRoot: string, script: 'build' | 'lint'): HopCheckResult {
  const pkgPath = join(laneRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    return { check: script, ok: false, detail: 'no package.json in the lane' };
  }
  let scripts: Record<string, string> = {};
  try {
    scripts = JSON.parse(readFileSync(pkgPath, 'utf-8')).scripts ?? {};
  } catch {
    return { check: script, ok: false, detail: 'package.json unreadable' };
  }
  if (typeof scripts[script] !== 'string') {
    return { check: script, ok: false, detail: `no '${script}' script declared` };
  }
  const r = spawnSync('npm', ['run', script], { cwd: laneRoot, timeout: 180_000, encoding: 'utf-8' });
  const ok = r.status === 0;
  return {
    check: script,
    ok,
    detail: ok
      ? `'npm run ${script}' exit 0`
      : `'npm run ${script}' exit ${r.status} — ${(r.stderr || r.stdout || '').slice(-400)}`,
  };
}

function verifyHopDeterministic(hop: PlanHop, laneRoot: string): HopVerifyResult {
  const declared = (hop.verify?.checks ?? []).filter((c) => typeof c === 'string');
  const checks: HopCheckResult[] = [];
  for (const rel of hop.artifacts) checks.push(fileExistsCheck(laneRoot, rel));
  for (const c of declared) {
    if (c.startsWith('file-exists:')) {
      const rel = c.slice('file-exists:'.length);
      if (!hop.artifacts.includes(rel)) checks.push(fileExistsCheck(laneRoot, rel));
    } else if (c === 'build' || c === 'lint') {
      checks.push(scriptCheck(laneRoot, c));
    } else {
      checks.push({ check: c, ok: false, detail: 'unknown check (supported: file-exists:<rel> | build | lint)' });
    }
  }
  const review = hop.verify?.review ?? 'deterministic';
  return {
    ok: checks.every((c) => c.ok),
    review,
    checks,
    note: review === 'llm'
      ? "review:'llm' requested — not wired tonight (deterministic result stands; the flag is the config seam for later nights)"
      : undefined,
  };
}

function hopTelemetryPath(stateDir: string): string {
  return join(stateDir, HOP_TELEMETRY_FILENAME);
}

function appendHopTelemetry(stateDir: string, row: HopTelemetryRow): void {
  appendFileSync(hopTelemetryPath(stateDir), JSON.stringify(row) + '\n');
}

function readHopTelemetry(stateDir: string): HopTelemetryRow[] {
  const p = hopTelemetryPath(stateDir);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as HopTelemetryRow);
}

function hopStatePath(stateDir: string): string {
  return join(stateDir, '.olympus-hop-state.json');
}

function loadHopState(stateDir: string): HopState | null {
  const p = hopStatePath(stateDir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as HopState;
  } catch {
    return null;
  }
}

function saveHopState(stateDir: string, state: HopState): void {
  writeFileSync(hopStatePath(stateDir), JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

/** Find opencode binary in the Lumina CRM project or Olympus root. */
function findOpencodeBinary(projectRoot: string): string | null {
  const binDir = join(projectRoot, 'node_modules', '.bin');
  const candidates = [join(binDir, 'opencode')];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fallback to Olympus root
  const olympusRoot = '/home/texugo/Projects/olympus';
  const olympusBinDir = join(olympusRoot, 'node_modules', '.bin');
  const olympusCandidates = [join(olympusBinDir, 'opencode')];
  for (const c of olympusCandidates) {
    if (existsSync(c)) return c;
  }
  console.error('[walker] opencode binary NOT FOUND in:', projectRoot, 'or', olympusRoot);
  return null;
}

/** Build env for spawned opencode processes. */
function buildOpencodeEnv(projectRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  
  // Load .env files
  const envFiles = [
    join(projectRoot, '.env'),
  ];
  for (const f of envFiles) {
    try {
      if (!existsSync(f)) continue;
      const content = readFileSync(f, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key) env[key] = value;
      }
    } catch {}
  }

  // Prepend node_modules/.bin to PATH
  const localBinDir = join(projectRoot, 'node_modules', '.bin');
  const existingPath = env.PATH || '';
  env.PATH = [localBinDir, existingPath].filter(Boolean).join(':');

  // Useful context
  env.OLYMPUS_ROOT = '/home/texugo/Projects/olympus';
  env.OLYMPUS_VAULT = '/home/texugo/OLYMPUS-VAULT';
  env.OLYMPUS_MANAGED = '1';
  if (!('FORCE_COLOR' in env)) env.FORCE_COLOR = '0';
  if (!('NO_COLOR' in env)) env.NO_COLOR = '1';

  return env;
}

function resolveHopTimeoutMs(): number {
  const n = Number.parseInt(process.env.OLYMPUS_HOP_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HOP_TIMEOUT_MS;
}

interface JsonEventParse {
  textOut: string;
  tokensIn: number;
  tokensOut: number;
}

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

function runSpawn(args: string[], hopCwd: string, timeoutMs: number, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  console.error('[walker] spawning:', args[0], args.slice(1).join(' '));
  console.error('[walker] cwd:', hopCwd);
  return new Promise((resolveP) => {
    const child = spawn(args[0], args.slice(1), { cwd: hopCwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }, timeoutMs);
    child.stdout?.on('data', (d) => { stdout += String(d); });
    child.stderr?.on('data', (d) => { stderr += String(d); });
    child.on('error', (e) => { clearTimeout(timer); console.error('[walker] spawn error:', e); resolveP({ code: -1, stdout, stderr: stderr + String(e) }); });
    child.on('close', (code) => { clearTimeout(timer); console.error('[walker] spawn exited with code:', code, 'stderr:', stderr.slice(-500)); resolveP({ code, stdout, stderr }); });
  });
}

/** Compose the hop prompt: the spec SLICE + FILE POINTERS. */
function composeHopPrompt(hop: PlanHop, laneRoot: string): string {
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

/** Default hop dispatcher: one fresh opencode run per hop. */
async function defaultHopDispatcher(hop: PlanHop, ctx: { laneRoot: string; prompt: string }): Promise<HopDispatchResult> {
  const projectRoot = ctx.laneRoot;
  console.error('[walker] dispatching hop:', hop.id, 'god:', hop.god);
  const opencodeBin = findOpencodeBinary(projectRoot);
  
  if (!opencodeBin) {
    return {
      ok: false, exitCode: null, output: '', tokensIn: null, tokensOut: null,
      retriesAbsorbed: 0, exhausted: false,
      error: `opencode binary not found in ${projectRoot}/node_modules/.bin or Olympus root`,
    };
  }
  console.error('[walker] using opencode binary:', opencodeBin);

  const model = resolveGodModelLane(hop.god, projectRoot);
  console.error('[walker] resolved model for', hop.god, ':', model);
  if (!model) {
    return {
      ok: false, exitCode: null, output: '', tokensIn: null, tokensOut: null,
      retriesAbsorbed: 0, exhausted: false,
      error: `no live model lane for god '${hop.god}' — cannot dispatch`,
    };
  }

  const plan = { maxAttempts: 3, backoffMs: [1000, 3000, 5000], rateLimitBackoffMs: 30000, jitterFraction: 0.2 };
  let retriesAbsorbed = 0;
  let last: { code: number | null; stdout: string; stderr: string } = { code: null, stdout: '', stderr: '' };

  for (let attempt = 0; ; attempt++) {
    const env = buildOpencodeEnv(projectRoot);
    last = await runSpawn(
      [opencodeBin, 'run', '--model', model, '--format', 'json', ctx.prompt],
      ctx.laneRoot,
      resolveHopTimeoutMs(),
      env,
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

    // Simple retry classification
    const isRateLimit = errText.includes('429') || errText.includes('rate limit');
    const isOverload = errText.includes('503') || errText.includes('overload') || errText.includes('unavailable');
    
    if (!isRateLimit && !isOverload) {
      return {
        ok: false, exitCode: last.code, output: last.stdout.slice(0, 4000),
        tokensIn: null, tokensOut: null, retriesAbsorbed, exhausted: false,
        error: errText,
      };
    }
    
    retriesAbsorbed++;
    const base = isRateLimit ? plan.rateLimitBackoffMs : plan.backoffMs[attempt];
    const delay = isOverload ? base * (1 + Math.random() * 0.2) : base;
    await new Promise((r) => setTimeout(r, Math.min(delay, 10_000)));
  }
}

function resolveGodModelLane(god: string, configPath?: string): string | null {
  // Always use Olympus root opencode.json for god model resolution
  const p = '/home/texugo/Projects/olympus/opencode.json';
  try {
    const cfg = JSON.parse(readFileSync(p, 'utf-8'));
    const model = cfg?.agent?.[god]?.model;
    return typeof model === 'string' && model ? model : null;
  } catch (e) {
    console.error('[walker] failed to read opencode.json:', e);
    return null;
  }
}

export async function walkPlan(opts: WalkOptions): Promise<WalkResult> {
  const v = validateDispatchPlan(opts.plan);
  if (!v.ok) {
    throw new Error(`[hop-runtime] garbage plan — refusing to walk:\n${v.errors.map((e) => `  - ${e}`).join('\n')}`);
  }
  const plan = v.plan;
  const laneRoot = plan.laneRoot;
  const stateDir = opts.stateDir ?? laneRoot;
  const dispatch = opts.dispatcher ?? defaultHopDispatcher;

  // State: resume honors the disk; a fresh walk resets it.
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
    const inFlight = new Map<string, { hop: PlanHop; startedAt: number; done: boolean; promise: Promise<void> }>();
    const launch = () => {
      if (stopped) return;
      while (inFlight.size < MAX_HOP_CONCURRENCY) {
        const next = pending.find((h) => ready(h) && !inFlight.has(h.id) && !completed.has(h.id));
        if (!next) return;
        const startedAt = Date.now();
        const task = { hop: next, startedAt, done: false, promise: Promise.resolve() };
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
        saveHopState(stateDir, {
          version: 1,
          completed: [...completed],
          parked: parkedHop,
          updatedAt: new Date().toISOString(),
        });
        launch();
      }
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