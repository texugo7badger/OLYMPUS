/**
 * tasks-sheet.ts — W-D2+D3 (v0.0.6 MISSION-CONTROL-TRUE): the TASK SHEET
 * data layer, extracted from the /api/olympus/tasks route so a fixture lane
 * can test the join. The route is a thin shell.
 *
 * Joins the hop runtime's own artifacts into the per-god task lists the
 * Parthenon cards and the drill-down modal render:
 *   - <lane>/dispatch-plan.json        — the DAG (hops: id, god, prompt,
 *     artifacts, verify, budgetTokens)
 *   - <lane>/.olympus-hop-state.json   — completed[] + parked + inFlight[]
 *     (W-D2: the RUNNING ground truth — written at every launch/settle)
 *   - <lane>/.olympus-hop-telemetry.jsonl — per-hop: ts, tokens in/out,
 *     duration, retries, status + the child's OWN reasoning + id
 *   - the vault's 06_Activity_Feed/live.jsonl — the files each god touched
 *     inside the hop's time window (tool_call events carry meta.file).
 *
 * The ACTIVE lane: the most recently updated dispatch-plan.json under the
 * vault's 02_Projects (or lane=<absolute path> to pin one).
 *
 * W-D3: stats.projectedRemainingMs — the whole-project time projection. The
 * honest model is the CRITICAL PATH: hops of the same god serialize on the
 * pool lane (MAX_HOP_PER_POOL=1), so per-god expected time = the sum of
 * that god's remaining hops' expected durations (running hops count down
 * their elapsed), and the projection is the MAX across gods — never a flat
 * divide-by-3 that pretends same-pool hops parallelize.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import { getVaultRoot } from './vault-root';
import { getProviderInfo } from './olympus';

/** The walker's concurrency law (the projection's honesty bound). */
const MAX_HOP_CONCURRENCY = 3;
/** No median yet: the fallback expected duration (5 min — the house's own
 *  observed hop class, hop-runtime.test.mjs fixtures + the ORBITAL medians). */
const DEFAULT_EXPECTED_MS = 300_000;

export interface TaskFile {
  file: string;
  tool: string;
  ts: string;
}

export interface TaskRecord {
  id: string;
  god: string;
  promptExcerpt: string;
  artifacts: string[];
  verify: unknown;
  budgetTokens: number | null;
  status: string;
  parkedReason?: string | null;
  ts?: string;
  /** W-D2: when this hop STARTED (the inFlight ground truth — running hops
   *  have no settled telemetry row, so this is the timer's only source). */
  startedAt?: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  durationMs?: number;
  retriesAbsorbed?: number;
  reasoning?: string | null;
  sessionId?: string | null;
  files: TaskFile[];
  progress?: number;
  /** W-D5: the derived $ cost for this hop (tokens x the active strategy's
   *  per-1M rates — the honest $0 on free tiers). Null before any telemetry. */
  estimatedCostUsd?: number | null;
}

/** #184: one live demigod card (the Parthenon's per-demigod record). */
export interface DemigodLive {
  id: string;
  ts: string;
  /** running = dispatched, no outcome yet; done/error = finalize verdict. */
  status: 'running' | 'done' | 'error';
  task: string;
  skill: string | null;
  mcp: string | null;
  tokensOut: number;
  durationMs: number | null;
  dispatchId: string | null;
}

export interface TasksSheet {
  lane: string;
  project: string;
  updatedAt: string;
  tasks: TaskRecord[];
  gods: Record<string, { total: number; completed: number; running: number; tokensIn: number; tokensOut: number; demigods: DemigodLive[] }>;
  stats: {
    total: number;
    completed: number;
    parked: number;
    running: number;
    pending: number;
    tokensIn: number;
    tokensOut: number;
    /** W-D3: the whole-project remaining wall-time projection (the critical
     *  path across gods; ms). 0 when nothing remains. */
    projectedRemainingMs: number;
  };
}

function safeJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

/** The most recently updated lane (or the explicit pin). */
function findActiveLane(projectsDir: string, pin?: string | null): { lane: string; updatedAt: string } | null {
  if (pin && typeof pin === 'string' && pin.startsWith('/') && fs.existsSync(path.join(pin, 'dispatch-plan.json'))) {
    const st = fs.statSync(path.join(pin, 'dispatch-plan.json'));
    return { lane: pin, updatedAt: st.mtime.toISOString() };
  }
  let best: { lane: string; updatedAt: string } | null = null;
  let entries: string[] = [];
  try { entries = fs.readdirSync(projectsDir); } catch { return null; }
  for (const name of entries) {
    const plan = path.join(projectsDir, name, 'dispatch-plan.json');
    try {
      const st = fs.statSync(plan);
      if (!best || st.mtimeMs > new Date(best.updatedAt).getTime()) {
        best = { lane: path.join(projectsDir, name), updatedAt: st.mtime.toISOString() };
      }
    } catch { /* no plan here */ }
  }
  return best;
}

/** Feed tool_call rows with a file, per god, inside [fromMs, toMs]. */
function filesInWindow(feedPath: string, god: string, fromMs: number, toMs: number): TaskFile[] {
  let raw = '';
  try {
    const size = fs.statSync(feedPath).size;
    if (size > 2 * 1024 * 1024) {
      const fh = fs.openSync(feedPath, 'r');
      const buf = Buffer.alloc(Math.min(size, 2 * 1024 * 1024));
      fs.readSync(fh, buf, 0, buf.length, Math.max(0, size - buf.length));
      fs.closeSync(fh);
      raw = buf.toString('utf-8');
      raw = raw.slice(raw.indexOf('\n') + 1);
    } else {
      raw = fs.readFileSync(feedPath, 'utf-8');
    }
  } catch { return []; }
  const out: TaskFile[] = [];
  const seen = new Set<string>();
  for (const line of raw.trim().split('\n').filter(Boolean).slice(-8000)) {
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev?.action !== 'tool_call') continue;
    if (String(ev?.god || '').toLowerCase() !== god) continue;
    const meta = ev?.meta && typeof ev.meta === 'object' ? ev.meta : {};
    const file = meta.file;
    if (typeof file !== 'string' || !file) continue;
    let t = 0;
    try { t = new Date(ev.ts).getTime(); } catch { continue; }
    if (!Number.isFinite(t) || t < fromMs || t > toMs) continue;
    const key = `${meta.tool || ''}:${file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ file, tool: String(meta.tool || 'tool'), ts: String(ev.ts) });
  }
  return out;
}

/**
 * Live demigod dispatches per god — the PARALLELISM-OF-PARALLELISM surface.
 * #184: each record joins the dispatch (task/skill/MCP) with its outcome
 * (status/tokens/duration) by dispatch_id, so parallel demigods under one
 * god render as distinct live cards instead of bare chips.
 */
function demigodsByGod(feedPath: string, now: number): Record<string, DemigodLive[]> {
  const demigods: Record<string, DemigodLive[]> = {};
  try {
    const raw = fs.readFileSync(feedPath, 'utf-8');
    const cutoff = now - 30 * 60 * 1000;
    const lines = raw.trim().split('\n').filter(Boolean).slice(-4000);
    const outcomes = new Map<string, any>();
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (ev?.action === 'dispatch_outcome' && ev?.dispatch_id) outcomes.set(String(ev.dispatch_id), ev);
      } catch { /* skip */ }
    }
    const seen = new Set<string>();
    for (const line of lines) {
      let ev: any;
      try { ev = JSON.parse(line); } catch { continue; }
      const act = String(ev?.action || '');
      if (act !== 'dispatch' && act !== 'symphony-dispatch') continue;
      const god = String(ev?.god || '').toLowerCase();
      const dg = ev?.demigod ?? ev?.meta?.demigod;
      if (!dg || typeof dg !== 'string') continue;
      let t = 0;
      try { t = new Date(ev.ts).getTime(); } catch { continue; }
      if (!Number.isFinite(t) || t < cutoff) continue;
      const dispatchId = ev?.dispatch_id ?? ev?.signature_id ?? null;
      const key = `${god}:${dispatchId ?? dg}:${ev.ts}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const outcome = dispatchId ? outcomes.get(String(dispatchId)) : null;
      const verdict = String(outcome?.outcome || '');
      const list = (demigods[god] ||= []);
      list.push({
        id: dg,
        ts: String(ev.ts),
        status: verdict === 'success' ? 'done' : verdict === 'failure' || verdict === 'failed' ? 'error' : 'running',
        task: String(ev?.task_signature || ev?.msg || '').slice(0, 160),
        skill: ev?.skill_equipped ?? ev?.meta?.skill ?? null,
        mcp: ev?.mcp_enabled ?? ev?.meta?.mcp ?? null,
        tokensOut: Number(outcome?.tokens_used?.output) || 0,
        durationMs: typeof outcome?.duration_ms === 'number' ? outcome.duration_ms : null,
        dispatchId: dispatchId ? String(dispatchId) : null,
      });
    }
    for (const list of Object.values(demigods)) list.sort((a, b) => a.ts < b.ts ? 1 : -1);
  } catch { /* decorative */ }
  return demigods;
}

/**
 * Build the task sheet. opts: the lane pin (or the newest plan under
 * projectsDir), the feed path, and `now` (the test seam — production passes
 * nothing and gets Date.now()).
 */
export function buildTasksSheet(opts: {
  lane?: string | null;
  projectsDir?: string;
  feedPath?: string;
  now?: number;
}): TasksSheet {
  const vaultRoot = getVaultRoot();
  const projectsDir = opts.projectsDir ?? path.join(vaultRoot, '02_Projects');
  const feedPath = opts.feedPath ?? path.join(vaultRoot, '06_Activity_Feed', 'live.jsonl');
  const now = opts.now ?? Date.now();

  const active = findActiveLane(projectsDir, opts.lane);
  const empty: TasksSheet = {
    lane: '', project: '', updatedAt: '',
    tasks: [], gods: {},
    stats: { total: 0, completed: 0, parked: 0, running: 0, pending: 0, tokensIn: 0, tokensOut: 0, projectedRemainingMs: 0 },
  };
  if (!active) return empty;
  const lane = active.lane;

  const plan = safeJson<any>(path.join(lane, 'dispatch-plan.json'), { hops: [] });
  const state = safeJson<any>(path.join(lane, '.olympus-hop-state.json'), { completed: [], parked: null, inFlight: [] });
  const completed: string[] = Array.isArray(state.completed) ? state.completed : [];
  const inFlight: Array<{ hopId: string; startedAt: string }> = Array.isArray(state.inFlight) ? state.inFlight : [];

  // Telemetry: the LAST row per hop wins (retries append rows).
  const telemetry = new Map<string, any>();
  try {
    const raw = fs.readFileSync(path.join(lane, '.olympus-hop-telemetry.jsonl'), 'utf-8');
    for (const line of raw.trim().split('\n').filter(Boolean)) {
      try {
        const row = JSON.parse(line);
        if (row?.hop) telemetry.set(String(row.hop), row);
      } catch { /* skip */ }
    }
  } catch { /* no telemetry yet */ }

  // The per-god median hop duration (the honest ETA source: the lane's own
  // completed hops) + the global fallback.
  const durationsByGod = new Map<string, number[]>();
  for (const r of telemetry.values()) {
    if (r?.status !== 'completed' || !r?.god || typeof r.durationMs !== 'number') continue;
    const list = durationsByGod.get(String(r.god).toLowerCase()) || [];
    list.push(r.durationMs);
    durationsByGod.set(String(r.god).toLowerCase(), list);
  }
  const median = (arr: number[]): number => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const globalMedian = median([...durationsByGod.values()].flat());
  const expectedFor = (god: string): number =>
    median(durationsByGod.get(god) || []) || globalMedian || DEFAULT_EXPECTED_MS;

  const inFlightByHop = new Map(inFlight.map((f) => [String(f?.hopId), f]));

  // W-D5: the derived $ per hop — the active strategy's per-1M rates over
  // this hop's tokens (the honest $0 on free tiers; the GO plan's real
  // rates when it rides). Strategy-aware via getProviderInfo.
  let costRates: { input: number; output: number } | null = null;
  try {
    costRates = getProviderInfo().cost_per_1m_tokens;
  } catch { costRates = null; }
  const deriveCost = (tokensIn: number | null | undefined, tokensOut: number | null | undefined): number | null => {
    if (tokensIn == null && tokensOut == null) return null;
    if (!costRates) return null;
    const usd = ((tokensIn ?? 0) / 1e6) * costRates.input + ((tokensOut ?? 0) / 1e6) * costRates.output;
    return Math.round(usd * 10000) / 10000;
  };

  const tasks: TaskRecord[] = (Array.isArray(plan.hops) ? plan.hops : []).map((h: any) => {
    const tel = telemetry.get(String(h?.id)) || null;
    const isCompleted = completed.includes(String(h?.id));
    const isParked = !!state.parked && state.parked.hopId === h?.id;
    // W-D2: the RUNNING ground truth — the walker's inFlight record. This
    // kills the fresh-first-hop lie (no telemetry row yet, the old 30-min
    // window never fired) and lights the timer + progress bar.
    const startRec = inFlightByHop.get(String(h?.id)) ?? null;
    let status = 'pending';
    if (isCompleted) status = 'completed';
    else if (isParked) status = 'parked';
    else if (startRec) status = 'running';
    const startedAt = status === 'running' && startRec ? String(startRec.startedAt) : undefined;
    const prompt = typeof h?.prompt === 'string' ? h.prompt : '';
    const files: TaskFile[] = tel
      ? filesInWindow(
          feedPath,
          String(h?.god || '').toLowerCase(),
          new Date(tel.ts).getTime() - (tel.durationMs || 0),
          new Date(tel.ts).getTime() + 60_000,
        )
      : [];
    const t: TaskRecord = {
      id: String(h?.id ?? ''),
      god: String(h?.god ?? 'apollo').toLowerCase(),
      promptExcerpt: prompt.slice(0, 240),
      artifacts: Array.isArray(h?.artifacts) ? h.artifacts.map(String) : [],
      verify: h?.verify ?? null,
      budgetTokens: typeof h?.budgetTokens === 'number' ? h.budgetTokens : null,
      status,
      parkedReason: isParked ? (state.parked?.reason ?? null) : null,
      ts: tel?.ts,
      startedAt,
      tokensIn: tel?.tokensIn ?? null,
      tokensOut: tel?.tokensOut ?? null,
      durationMs: tel?.durationMs,
      retriesAbsorbed: tel?.retriesAbsorbed ?? 0,
      reasoning: tel?.reasoning ?? null,
      sessionId: tel?.sessionId ?? null,
      files,
      estimatedCostUsd: deriveCost(tel?.tokensIn, tel?.tokensOut),
    };
    if (isCompleted) t.progress = 100;
    else if (status === 'running') {
      // Running: elapsed vs the god's median — honest, telemetry-derived,
      // capped (a slow hop never fakes 100%).
      const startMs = startedAt ? new Date(startedAt).getTime() : now;
      const expected = expectedFor(t.god);
      const elapsed = Math.max(0, now - startMs);
      t.progress = Math.min(95, Math.max(3, Math.round((elapsed / Math.max(expected, 60_000)) * 100)));
    }
    return t;
  });

  // The legacy heuristic (walks from before the inFlight field): the most
  // recent telemetry within 30 min implies the first pending hop is running.
  if (inFlight.length === 0) {
    const lastTelTs = Math.max(0, ...[...telemetry.values()].map((r: any) => { try { return new Date(r.ts).getTime(); } catch { return 0; } }));
    for (const t of tasks) {
      if (t.status !== 'pending') continue;
      if (!telemetry.has(t.id) && Date.now() - lastTelTs < 30 * 60_000) { t.status = 'running'; break; }
    }
  }

  const demigods = demigodsByGod(feedPath, now);

  const gods: TasksSheet['gods'] = {};
  for (const t of tasks) {
    const g = (gods[t.god] ||= { total: 0, completed: 0, running: 0, tokensIn: 0, tokensOut: 0, demigods: [] });
    g.total++;
    if (t.status === 'completed') g.completed++;
    if (t.status === 'running') g.running++;
    g.tokensIn += t.tokensIn ?? 0;
    g.tokensOut += t.tokensOut ?? 0;
    g.demigods = demigods[t.god] || [];
  }

  // W-D3: the CRITICAL-PATH projection. Per god, the serial expected time of
  // that god's remaining hops (same-pool hops serialize; running hops count
  // down their elapsed); the projection = the max across gods.
  const remainingByGod = new Map<string, number>();
  for (const t of tasks) {
    if (t.status !== 'pending' && t.status !== 'running') continue;
    let exp = expectedFor(t.god);
    if (t.status === 'running' && t.startedAt) {
      try { exp = Math.max(30_000, exp - (now - new Date(t.startedAt).getTime())); } catch { /* keep exp */ }
    }
    remainingByGod.set(t.god, (remainingByGod.get(t.god) || 0) + exp);
  }
  const projectedRemainingMs = remainingByGod.size > 0
    ? Math.round(Math.max(...remainingByGod.values()))
    : 0;

  const stats: TasksSheet['stats'] = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    parked: tasks.filter(t => t.status === 'parked').length,
    running: tasks.filter(t => t.status === 'running').length,
    pending: tasks.filter(t => t.status === 'pending').length,
    tokensIn: tasks.reduce((n, t) => n + (t.tokensIn ?? 0), 0),
    tokensOut: tasks.reduce((n, t) => n + (t.tokensOut ?? 0), 0),
    projectedRemainingMs,
  };
  void MAX_HOP_CONCURRENCY; // documented bound — the model itself is per-god serial

  return {
    lane,
    project: path.basename(lane),
    updatedAt: active.updatedAt,
    tasks,
    gods,
    stats,
  };
}
