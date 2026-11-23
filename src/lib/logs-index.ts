/**
 * logs-index.ts — v0.0.98: the read model behind the Logs workspace.
 *
 * One server-side pass over the append-only evidence (hop telemetry, cost,
 * recovery, resonance, burn) and the hop state, cached by mtime. The browser
 * never receives 57k rows: the API ships a bounded recent slice and the
 * aggregates the UI needs. Unknown is a value, never a fabricated zero.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getVaultRoot } from './vault-root';
import { accountWindows, readGoConsoleAnchor, type GoConsoleAnchor } from './go-console';
import { peekUsageSnapshot, readGoPlan } from './go-usage';
import { readBurnPolicy, readBurnDecision } from './burn-state';
import { classifyParkReason, type DispatchFailureClass } from './hop-runtime/failure-class';

const HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const VAULT = () => getVaultRoot();
const PROJECTS = () => path.join(VAULT(), '02_Projects');

export interface LogHop {
  id: string;
  laneRoot: string;
  slug: string;
  ts: string;
  hop: string;
  god: string;
  build: string | null;
  model: string;
  status: string;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  errorClass: string | null;
  failureClass: DispatchFailureClass | null;
  error: string | null;
  failedCheck: string | null;
  sessionId: string | null;
  transport: string | null;
  retries: number;
  artifacts: string[];
  checks: string[];
  abilities: { skills: string[]; mcps: string[]; demigods: string[] };
  promptExcerpt: string;
  outputTail: string | null;
  toolBudget: number | null;
  tools: Array<{ tool: string; count: number }>;
  costSource: 'session' | 'window' | null;
  park: { reason: string; errorClass: string | null; error: string | null; ts: string } | null;
  recovery: { kind: string; message: string; ts: string } | null;
  resonance: { build: string | null; skill: string | null; mcp: string | null; demigod: string | null; outcome: string | null } | null;
}

export interface LogWalk {
  slug: string;
  laneRoot: string;
  generation: number;
  campaignId: string | null;
  completed: number;
  total: number;
  parked: string | null;
  status: 'RUNNING' | 'PARKED' | 'BLOCKED' | 'WAITING' | 'DONE' | 'IDLE';
  updatedAt: string | null;
  planCreatedAt: string | null;
  hops: Array<{ id: string; god: string; status: string; after: string[]; artifacts: string[]; toolBudget: number | null; build: string | null; checks?: string[]; promptExcerpt?: string; promptChars?: number }>;
  quarantined: string[];
  parks: Record<string, { reason: string; failureClass: string | null; error: string | null }>;
  report: string | null;
}

export interface LogModelRow {
  model: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  completed: number;
  parked: number;
  lastUsed: string | null;
}

export interface LogRecovery {
  lane: string;
  slug: string;
  ts: string;
  hopId: string;
  god: string;
  failureClass: string | null;
  kind: string;
  action: string;
  message: string;
  nextLane: string | null;
  toolBudget: number | null;
  campaignId: string | null;
}

export interface LogError {
  ts: string;
  source: string;
  message: string;
  stack: string | null;
  appVersion: string | null;
}

/** v0.0.98-14 — the same benign-noise filter the Electron crash log uses. */
export function isBenignErrorLogEntry(message: string): boolean {
  const m = String(message || '');
  return /preloaded using link preload but not used/i.test(m)
    || /Electron Security Warning \(Insecure Content-Security-Policy\)/i.test(m)
    || /Access to fetch at 'https:\/\/api\.github\.com\/_private\/browser\/stats/i.test(m)
    || /Oversized browser stats delivery failed/i.test(m)
    || /ResizeObserver loop completed with undelivered notifications/i.test(m)
    || /Download the React DevTools/i.test(m);
}

function readRealErrors(max = 200): LogError[] {
  const rows: LogError[] = [];
  const file = path.join(HOME(), 'errors.log');
  let lines: string[] = [];
  try { lines = fs.readFileSync(file, 'utf-8').trim().split('\n').slice(-1500); } catch { return rows; }
  for (const line of lines) {
    let r: any;
    try { r = JSON.parse(line); } catch { continue; }
    const message = String(r?.message ?? '');
    if (!message || isBenignErrorLogEntry(message)) continue;
    rows.push({
      ts: String(r?.ts ?? ''),
      source: String(r?.source ?? 'unknown'),
      message: message.slice(0, 1_000),
      stack: r?.stack ? String(r.stack).slice(0, 1_500) : null,
      appVersion: r?.appVersion ? String(r.appVersion) : null,
    });
  }
  return rows.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, max);
}

export interface LogSummary {
  hops: number;
  completed: number;
  parked: number;
  waiting: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  parksByClass: Array<{ klass: string; count: number }>;
  byGod: Array<{ god: string; hops: number; completed: number; parked: number; tokensOut: number; costUsd: number }>;
  byModel: LogModelRow[];
  updatedAt: string;
}

export interface LogEconomy {
  anchor: GoConsoleAnchor | null;
  windows: { h5: number | null; weekly: number | null; monthly: number | null };
  resets: { h5: string | null; weekly: string | null; monthly: string | null };
  anchorAgeMs: number | null;
  source: string;
  policy: { mode: string; targetPct: number } | null;
  decision: { blocked: string | null; step: number; projectedPct: number | null; mode: string } | null;
  recent: Array<{ at: string; mode: string; step: number; accountPct: number | null; projectedPct: number | null; blocked: string | null }>;
}

export interface LogsPayload {
  ok: true;
  generatedAt: string;
  summary: LogSummary;
  hops: LogHop[];
  walks: LogWalk[];
  recoveries: LogRecovery[];
  errors: LogError[];
  models: LogModelRow[];
  economy: LogEconomy;
  truncated: boolean;
}

const fileCache = new Map<string, { mtime: number; size: number; rows: any[] }>();

function readJsonlTail(file: string, maxLines: number): any[] {
  try {
    const st = fs.statSync(file);
    const hit = fileCache.get(file);
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit.rows;
    const text = fs.readFileSync(file, 'utf-8');
    const lines = text.split('\n').slice(-maxLines);
    const rows: any[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try { rows.push(JSON.parse(t)); } catch { /* torn line */ }
    }
    fileCache.set(file, { mtime: st.mtimeMs, size: st.size, rows });
    return rows;
  } catch { return []; }
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return fallback; }
}

function laneDirs(): string[] {
  try {
    return fs.readdirSync(PROJECTS(), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => path.join(PROJECTS(), d.name))
      .filter((dir) => fs.existsSync(path.join(dir, '.olympus-hop-telemetry.jsonl')) || fs.existsSync(path.join(dir, 'dispatch-plan.json')));
  } catch { return []; }
}

const HOP_TAIL = 400;
const COST_TAIL = 20_000;
const RESONANCE_TAIL = 8_000;

/** The server-side slice + aggregates. */
export function buildLogsPayload(now = Date.now()): LogsPayload {
  const lanes = laneDirs();
  const hops: LogHop[] = [];
  const walks: LogWalk[] = [];
  const recoveries: LogRecovery[] = [];
  let truncated = false;

  const costRows = readJsonlTail(path.join(HOME(), 'metrics', 'cost.jsonl'), COST_TAIL);
  const costBySession = new Map<string, number>();
  const costByModel = new Map<string, { requests: number; cost: number; last: string | null }>();
  const costByModelMinute = new Map<string, Map<number, number>>();
  for (const r of costRows) {
    const sid = typeof r?.session_id === 'string' ? r.session_id : '';
    const cost = Number(r?.spend_usd ?? 0) + Number(r?.spend_estimated_usd ?? 0);
    if (sid && Number.isFinite(cost)) costBySession.set(sid, (costBySession.get(sid) ?? 0) + cost);
    const model = String(r?.model ?? 'unknown');
    const ts = Date.parse(String(r?.ts ?? ''));
    if (Number.isFinite(ts) && Number.isFinite(cost) && cost > 0) {
      const minute = Math.floor(ts / 60_000);
      const buckets = costByModelMinute.get(model) ?? new Map<number, number>();
      buckets.set(minute, (buckets.get(minute) ?? 0) + cost);
      costByModelMinute.set(model, buckets);
    }
    const m = costByModel.get(model) ?? { requests: 0, cost: 0, last: null };
    m.requests += 1;
    if (Number.isFinite(cost)) m.cost += cost;
    if (typeof r?.ts === 'string' && (!m.last || r.ts > m.last)) m.last = r.ts;
    costByModel.set(model, m);
  }

  const resonance = readJsonlTail(path.join(VAULT(), '03_Index', 'arsenal-resonance.jsonl'), RESONANCE_TAIL);
  const resonanceByHop = new Map<string, any>();
  for (const r of resonance) {
    if (typeof r?.hop === 'string') resonanceByHop.set(`${r.hop}:${r.god ?? ''}`, r);
  }

  for (const laneRoot of lanes) {
    const slug = path.basename(laneRoot);
    const plan = readJson<any>(path.join(laneRoot, 'dispatch-plan.json'), { hops: [] });
    const state = readJson<any>(path.join(laneRoot, '.olympus-hop-state.json'), null);
    const planHops = Array.isArray(plan?.hops) ? plan.hops : [];
    // v0.0.98 — the live plan is overwritten by each generation; the frozen
    // plan keeps the previous generation's hop definitions so a historical
    // row still shows its prompt/artifacts/checks.
    const frozen = readJson<any>(path.join(laneRoot, '.olympus-plan-frozen.json'), { hops: [] });
    const frozenHops = Array.isArray(frozen?.hops) ? frozen.hops : [];
    // v0.0.98.1 — the generation archive keeps older hop definitions.
    const archiveHops: any[] = [];
    try {
      const archiveDir = path.join(laneRoot, '.olympus-plan-archive');
      for (const f of fs.readdirSync(archiveDir).filter((x) => x.endsWith('.json')).slice(-20)) {
        const p = readJson<any>(path.join(archiveDir, f), { hops: [] });
        if (Array.isArray(p?.hops)) archiveHops.push(...p.hops);
      }
    } catch { /* no archive yet */ }
    const planById = new Map([...archiveHops, ...frozenHops, ...planHops].map((h: any) => [String(h?.id), h]));
    const parks = state?.parks && typeof state.parks === 'object' ? state.parks : {};
    const recovery = readJsonlTail(path.join(laneRoot, '.olympus-recovery.jsonl'), 400);
    const recoveryByHop = new Map<string, any>();
    for (const r of recovery) {
      if (typeof r?.hopId === 'string' && r?.action === 'retry') recoveryByHop.set(r.hopId, r);
      if (typeof r?.hopId === 'string') {
        recoveries.push({
          lane: laneRoot, slug, ts: String(r?.ts ?? ''), hopId: String(r.hopId), god: String(r?.god ?? 'system'),
          failureClass: r?.failureClass ? String(r.failureClass) : null,
          kind: String(r?.kind ?? 'unknown'), action: String(r?.action ?? 'retry'),
          message: String(r?.message ?? '').slice(0, 1_000),
          nextLane: r?.nextLane ? String(r.nextLane) : null,
          toolBudget: Number.isFinite(Number(r?.override?.toolBudget)) ? Number(r.override.toolBudget) : null,
          campaignId: r?.campaignId ? String(r.campaignId) : null,
        });
      }
    }
    const telemetry = readJsonlTail(path.join(laneRoot, '.olympus-hop-telemetry.jsonl'), HOP_TAIL);
    if (telemetry.length >= HOP_TAIL) truncated = true;
    for (const row of telemetry) {
      const hopId = String(row?.hop ?? '');
      if (!hopId) continue;
      const hopDef = planById.get(hopId) as any;
      const park = parks[hopId] ?? null;
      const errorClass = row?.errorClass ? String(row.errorClass) : (park?.errorClass ?? null);
      const failureClass = classifyParkReason(String(row?.status ?? '').replace(/^parked-/, ''), row?.error ?? park?.error, errorClass) as DispatchFailureClass;
      const sessionId = typeof row?.sessionId === 'string' ? row.sessionId : null;
      let costUsd = sessionId && costBySession.has(sessionId) ? costBySession.get(sessionId)! : null;
      let costSource: 'session' | 'window' | null = costUsd != null ? 'session' : null;
      if (costUsd == null && typeof row?.ts === 'string') {
        const end = Date.parse(row.ts);
        const start = end - Math.max(60_000, Number(row?.durationMs) || 0);
        const buckets = costByModelMinute.get(String(row?.lane ?? ''));
        if (Number.isFinite(end) && buckets) {
          let sum = 0;
          for (let m = Math.floor(start / 60_000); m <= Math.floor(end / 60_000); m += 1) sum += buckets.get(m) ?? 0;
          if (sum > 0) { costUsd = Math.round(sum * 1e6) / 1e6; costSource = 'window'; }
        }
      }
      const resonanceRow = resonanceByHop.get(`${hopId}:${row?.god ?? ''}`) ?? null;
      hops.push({
        id: `${slug}:${hopId}:${row?.ts ?? ''}`,
        laneRoot,
        slug,
        ts: String(row?.ts ?? ''),
        hop: hopId,
        god: String(row?.god ?? 'system'),
        build: row?.build ? String(row.build) : null,
        model: String(row?.lane ?? 'unknown'),
        status: String(row?.status ?? 'unknown'),
        durationMs: Number(row?.durationMs ?? 0),
        tokensIn: Number.isFinite(Number(row?.tokensIn)) ? Number(row.tokensIn) : null,
        tokensOut: Number.isFinite(Number(row?.tokensOut)) ? Number(row.tokensOut) : null,
        costUsd,
        costSource,
        errorClass,
        failureClass,
        error: row?.error ? String(row.error).slice(0, 2000) : (park?.error ? String(park.error).slice(0, 2000) : null),
        failedCheck: row?.failedCheck ? String(row.failedCheck) : null,
        sessionId,
        transport: row?.transport ? String(row.transport) : null,
        retries: Number(row?.retriesAbsorbed ?? 0),
        artifacts: Array.isArray(hopDef?.artifacts) ? hopDef.artifacts.filter((a: unknown) => typeof a === 'string') : (Array.isArray(row?.artifacts) ? row.artifacts.map(String) : []),
        checks: Array.isArray(hopDef?.verify?.checks) ? hopDef.verify.checks.filter((a: unknown) => typeof a === 'string') : (Array.isArray(row?.checks) ? row.checks.map(String) : []),
        abilities: hopDef ? {
          skills: [...(Array.isArray(hopDef?.skills) ? hopDef.skills : []), ...(hopDef?.skill ? [hopDef.skill] : [])].filter((x: unknown) => typeof x === 'string'),
          mcps: [...(Array.isArray(hopDef?.mcps) ? hopDef.mcps : []), ...(hopDef?.mcp ? [hopDef.mcp] : [])].filter((x: unknown) => typeof x === 'string'),
          demigods: [...(Array.isArray(hopDef?.demigods) ? hopDef.demigods : []), ...(hopDef?.demigod ? [hopDef.demigod] : [])].filter((x: unknown) => typeof x === 'string'),
        } : (row?.abilities && typeof row.abilities === 'object' ? {
          skills: Array.isArray(row.abilities.skills) ? row.abilities.skills.map(String) : [],
          mcps: Array.isArray(row.abilities.mcps) ? row.abilities.mcps.map(String) : [],
          demigods: Array.isArray(row.abilities.demigods) ? row.abilities.demigods.map(String) : [],
        } : { skills: [], mcps: [], demigods: [] }),
        promptExcerpt: String(hopDef?.prompt ?? row?.promptExcerpt ?? '').slice(0, 1200),
        outputTail: row?.outputTail ? String(row.outputTail).slice(-2400) : null,
        toolBudget: Number.isFinite(Number(hopDef?.toolBudget)) ? Number(hopDef.toolBudget) : (Number.isFinite(Number(row?.toolBudget)) ? Number(row.toolBudget) : null),
        tools: Array.isArray(row?.tools) ? row.tools.filter((t: any) => t && typeof t.tool === 'string').slice(0, 20) : [],
        park: park ? { reason: String(park.reason ?? ''), errorClass: park.errorClass ?? null, error: park.error ?? null, ts: String(park.ts ?? '') } : null,
        recovery: recoveryByHop.get(hopId) ? {
          kind: String(recoveryByHop.get(hopId)?.kind ?? ''),
          message: String(recoveryByHop.get(hopId)?.message ?? ''),
          ts: String(recoveryByHop.get(hopId)?.ts ?? ''),
        } : null,
        resonance: resonanceRow ? {
          build: resonanceRow?.build ?? null,
          skill: resonanceRow?.skill ?? null,
          mcp: resonanceRow?.mcp ?? null,
          demigod: resonanceRow?.demigod ?? null,
          outcome: resonanceRow?.outcome ?? null,
        } : null,
      });
    }
    const completedIds = Array.isArray(state?.completed) ? state.completed.map(String) : [];
    const quarantined = Array.isArray(state?.quarantined) ? state.quarantined.map(String) : [];
    const total = planHops.length;
    const done = completedIds.filter((id: string) => planById.has(id)).length;
    const parked = state?.parked?.hopId ? String(state.parked.hopId) : null;
    const waiting = state?.waitingUntil && Date.parse(state.waitingUntil) > now;
    const status: LogWalk['status'] = waiting ? 'WAITING'
      : done >= total && total > 0 ? 'DONE'
        : parked && (state?.parked?.reason ?? '').startsWith('blocked') ? 'BLOCKED'
          : parked ? 'PARKED'
            : done > 0 || (state?.inFlight?.length ?? 0) > 0 ? 'RUNNING' : 'IDLE';
    const digest = path.join(laneRoot, '.olympus-morning-digest.md');
    walks.push({
      slug,
      laneRoot,
      generation: Number(state?.generation ?? plan?.generation ?? 0),
      campaignId: typeof state?.campaignId === 'string' ? state.campaignId : null,
      completed: done,
      total,
      parked,
      status,
      updatedAt: state?.updatedAt ?? null,
      planCreatedAt: plan?.createdAt ?? null,
      hops: planHops.map((h: any) => ({
        id: String(h?.id ?? ''),
        god: String(h?.god ?? 'system'),
        status: completedIds.includes(String(h?.id)) ? 'completed' : quarantined.includes(String(h?.id)) ? 'parked' : (state?.inFlight ?? []).some((f: any) => f?.hopId === h?.id) ? 'running' : 'pending',
        after: Array.isArray(h?.after) ? h.after.map(String) : [],
        artifacts: Array.isArray(h?.artifacts) ? h.artifacts.filter((a: unknown) => typeof a === 'string') : [],
        toolBudget: Number.isFinite(Number(h?.toolBudget)) ? Number(h.toolBudget) : null,
        build: h?.buildId ? String(h.buildId) : null,
        checks: Array.isArray(h?.verify?.checks) ? h.verify.checks.filter((c: unknown) => typeof c === 'string') : [],
        promptExcerpt: String(h?.prompt ?? '').slice(0, 1_200),
        promptChars: String(h?.prompt ?? '').length,
      })),
      quarantined,
      parks: Object.fromEntries(Object.entries(parks).map(([id, p]: [string, any]) => [id, { reason: String(p?.reason ?? ''), failureClass: p?.failureClass ?? p?.errorClass ?? null, error: p?.error ?? null }])),
      report: fs.existsSync(digest) ? digest : null,
    });
  }

  hops.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  walks.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  recoveries.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  const errors = readRealErrors(200);

  const summary = summarize(hops, costByModel);
  const economy = buildEconomy();
  return {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    summary,
    hops,
    walks,
    recoveries: recoveries.slice(0, 200),
    errors,
    models: summary.byModel,
    economy,
    truncated,
  };
}

function summarize(hops: LogHop[], costByModel: Map<string, { requests: number; cost: number; last: string | null }>): LogSummary {
  const completed = hops.filter((h) => h.status === 'completed').length;
  const parked = hops.filter((h) => h.status.startsWith('parked')).length;
  const waiting = hops.filter((h) => h.status === 'waiting').length;
  const tokensIn = hops.reduce((n, h) => n + (h.tokensIn ?? 0), 0);
  const tokensOut = hops.reduce((n, h) => n + (h.tokensOut ?? 0), 0);
  const costUsd = hops.reduce((n, h) => n + (h.costUsd ?? 0), 0);
  const classMap = new Map<string, number>();
  for (const h of hops) if (h.status.startsWith('parked')) classMap.set(String(h.failureClass ?? 'unknown'), (classMap.get(String(h.failureClass ?? 'unknown')) ?? 0) + 1);
  const godMap = new Map<string, { hops: number; completed: number; parked: number; tokensOut: number; costUsd: number }>();
  for (const h of hops) {
    const g = godMap.get(h.god) ?? { hops: 0, completed: 0, parked: 0, tokensOut: 0, costUsd: 0 };
    g.hops += 1; if (h.status === 'completed') g.completed += 1; if (h.status.startsWith('parked')) g.parked += 1;
    g.tokensOut += h.tokensOut ?? 0; g.costUsd += h.costUsd ?? 0;
    godMap.set(h.god, g);
  }
  const modelMap = new Map<string, LogModelRow>();
  for (const h of hops) {
    const m = modelMap.get(h.model) ?? { model: h.model, requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, completed: 0, parked: 0, lastUsed: null };
    m.requests += 1; m.tokensIn += h.tokensIn ?? 0; m.tokensOut += h.tokensOut ?? 0; m.costUsd += h.costUsd ?? 0;
    if (h.status === 'completed') m.completed += 1; if (h.status.startsWith('parked')) m.parked += 1;
    if (!m.lastUsed || h.ts > m.lastUsed) m.lastUsed = h.ts;
    modelMap.set(h.model, m);
  }
  // Cost rows may know models the hop telemetry never saw (chat turns).
  for (const [model, m] of costByModel) {
    if (!model || model === 'unknown' || modelMap.has(model)) continue;
    modelMap.set(model, { model, requests: m.requests, tokensIn: 0, tokensOut: 0, costUsd: m.cost, completed: 0, parked: 0, lastUsed: m.last });
  }
  return {
    hops: hops.length,
    completed,
    parked,
    waiting,
    tokensIn,
    tokensOut,
    costUsd,
    parksByClass: [...classMap.entries()].map(([klass, count]) => ({ klass, count })).sort((a, b) => b.count - a.count),
    byGod: [...godMap.entries()].map(([god, v]) => ({ god, ...v })).sort((a, b) => b.hops - a.hops),
    byModel: [...modelMap.values()].sort((a, b) => b.requests - a.requests),
    updatedAt: new Date().toISOString(),
  };
}

function buildEconomy(): LogEconomy {
  const anchor = readGoConsoleAnchor();
  const snap = peekUsageSnapshot(readGoPlan());
  const usage = snap?.usage?.account ?? null;
  const aw = accountWindows({
    anchor,
    spendMonthUsd: usage?.spendMonthUsd ?? 0,
    spend5hUsd: usage?.spend5hUsd ?? 0,
    spend7dUsd: usage?.spend7dUsd ?? 0,
    spendWeekUsd: usage?.spendWeekUsd ?? 0,
  });
  const policy = readBurnPolicy();
  const decision = readBurnDecision();
  const recent = readJsonlTail(path.join(HOME(), 'metrics', 'burn-log.jsonl'), 40)
    .map((r) => ({
      at: String(r?.generatedAt ?? r?.loggedAt ?? ''),
      mode: String(r?.mode ?? ''),
      step: Number(r?.step ?? 0),
      accountPct: Number.isFinite(Number(r?.accountPct)) ? Number(r.accountPct) : null,
      projectedPct: Number.isFinite(Number(r?.projectedPct)) ? Number(r.projectedPct) : null,
      blocked: r?.blocked ? String(r.blocked) : null,
    }))
    .filter((r) => r.at)
    .sort((a, b) => b.at.localeCompare(a.at));
  return {
    anchor,
    windows: { h5: aw.h5Pct, weekly: aw.weeklyPct, monthly: aw.monthlyPct },
    resets: { h5: aw.rollingResetAt, weekly: aw.weeklyResetAt, monthly: aw.monthlyResetAt },
    anchorAgeMs: aw.anchorAgeMs,
    source: aw.source,
    policy: policy ? { mode: policy.mode, targetPct: policy.targetPct } : null,
    decision: decision ? { blocked: decision.blocked, step: decision.step, projectedPct: decision.projectedPct, mode: decision.mode } : null,
    recent,
  };
}
