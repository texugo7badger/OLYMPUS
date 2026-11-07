/**
 * go-usage.ts — v0.0.81: the GO / GO Plus / GO Teams consumption ledger.
 *
 * The plan's limits are PER MODEL (5h = 20% of the monthly limit, week = 50%,
 * month = 100%). The console is authoritative; this module measures the local
 * OpenCode ledger and prices each assistant turn with the PUBLIC Go catalog
 * (`https://opencode.ai/inference/go/v1/models`), which already carries the
 * cache prices, the long-context overrides and the DeepSeek peak multiplier.
 *
 * Honesty rules:
 *   - never invent a limit for a model the plan table does not name;
 *   - never present a fake 0% when the DB is unreadable (`unknown: true`);
 *   - the console remains the source of truth; Extra Usage may bill PAYG.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type GoPlan = 'go' | 'go-plus' | 'go-teams';
export type GoWindow = 'h5' | 'd7' | 'month';

/** Monthly USD limits, transcribed from the Console Go page (2026-11-05). */
export const GO_LIMITS: Record<GoPlan, Record<string, number>> = {
  go: {
    'glm-5.3-flash': 60, 'glm-5.3': 15, 'glm-5.2': 60,
    'kimi-k3.1-pro': 15, 'kimi-k3': 15, 'kimi-k2.7-code': 60,
    'longcat-2.0': 60, 'step-5-preview': 15,
    'mimo-v2.6-flash': 60, 'mimo-v2.6-pro': 15, 'mimo-v2.5': 60, 'mimo-v2.5-pro': 15,
    'minimax-m3.1-flash': 20, 'minimax-m3': 60,
    'qwen3.8-max': 15, 'qwen3.8-flash': 30, 'qwen3.7-plus': 60,
    'deepseek-v4.1-flash': 100, 'deepseek-v4-pro': 15,
    hy4: 60, 'hy4-preview': 30, hy3: 60,
    'grok-4.7': 15, 'gpt-6-luna': 15, 'gpt-5.6-luna': 15,
    'claude-haiku-5.5': 15, 'gemini-4-argon': 30,
  },
  'go-plus': {
    'glm-5.3-flash': 180, 'glm-5.3': 120, 'glm-5.2': 180,
    'kimi-k3.1-pro': 60, 'kimi-k3': 60, 'kimi-k2.7-code': 180,
    'longcat-2.0': 240, 'step-5-preview': 60,
    'mimo-v2.6-flash': 120, 'mimo-v2.6-pro': 60, 'mimo-v2.5': 120, 'mimo-v2.5-pro': 60,
    'minimax-m3.1-flash': 80, 'minimax-m3': 180,
    'qwen3.8-max': 60, 'qwen3.8-flash': 90, 'qwen3.7-plus': 180,
    'deepseek-v4.1-flash': 200, 'deepseek-v4-pro': 60,
    hy4: 240, 'hy4-preview': 120, hy3: 240,
    'grok-4.7': 60, 'gpt-6-luna': 60, 'gpt-5.6-luna': 60,
    'claude-haiku-5.5': 60, 'gemini-4-argon': 120,
  },
  'go-teams': {
    'glm-5.3-flash': 65, 'glm-5.3': 20, 'glm-5.2': 65,
    'kimi-k3.1-pro': 20, 'kimi-k3': 20, 'kimi-k2.7-code': 65,
    'longcat-2.0': 65, 'step-5-preview': 20,
    'mimo-v2.6-flash': 65, 'mimo-v2.6-pro': 20, 'mimo-v2.5': 65, 'mimo-v2.5-pro': 20,
    'minimax-m3.1-flash': 25, 'minimax-m3': 65,
    'qwen3.8-max': 20, 'qwen3.8-flash': 35, 'qwen3.7-plus': 65,
    'deepseek-v4.1-flash': 105, 'deepseek-v4-pro': 20,
    hy4: 65, 'hy4-preview': 35, hy3: 65,
    'grok-4.7': 20, 'gpt-6-luna': 20, 'gpt-5.6-luna': 20,
    'claude-haiku-5.5': 20, 'gemini-4-argon': 35,
  },
};

/** A small offline fallback for the core lanes; the live catalog wins. */
const FALLBACK_COST: Record<string, CatalogModel['cost']> = {
  'deepseek-v4.1-flash': {
    text: { input: { price: 0.15, cache: { read: 0.003 } }, output: { price: 0.6 } },
    multipliers: [{ when: { utc_days: { in: ['mon', 'tue', 'wed', 'thu', 'fri'] }, any: [{ all: [{ utc_hours: { gte: '01:00' } }, { utc_hours: { lt: '04:00' } }] }, { all: [{ utc_hours: { gte: '06:00' } }, { utc_hours: { lt: '10:00' } }] }] }, factor: 2 }],
  },
  'qwen3.7-plus': {
    text: {
      input: { price: 0.4, cache: { read: 0.04, write: 0.5 }, overrides: [{ when: { context: { gt: 256000 } }, price: 1.2, cache: { read: 0.12, write: 1.5 } }] },
      output: { price: 1.6, overrides: [{ when: { context: { gt: 256000 } }, price: 4.8 }] },
    },
  },
  'kimi-k2.7-code': { text: { input: { price: 0.95, cache: { read: 0.19 } }, output: { price: 4.0 } } },
  hy3: { text: { input: { price: 0.14, cache: { read: 0.035 } }, output: { price: 0.58 } } },
  'minimax-m3': { text: { input: { price: 0.3, cache: { read: 0.06 } }, output: { price: 1.2 } } },
  'claude-haiku-5.5': { text: { input: { price: 0.1, cache: { read: 0.01, write: 0.125 } }, output: { price: 0.5 } } },
  'gemini-4-argon': { text: { input: { price: 2.0, cache: { read: 0.1 } }, output: { price: 10.0 } } },
  'gpt-6-luna': { text: { input: { price: 0.1, cache: { read: 0.01, write: 0.125 } }, output: { price: 0.5 } } },
  'kimi-k3': { text: { input: { price: 3.0, cache: { read: 0.3, write: 3.0 } }, output: { price: 15.0 } } },
  'kimi-k3.1-pro': { text: { input: { price: 2.0, cache: { read: 0.2, write: 2.0 } }, output: { price: 10.0 } } },
};

export interface CatalogModel {
  id: string;
  cost?: {
    text?: {
      input?: { price?: number; cache?: { read?: number; write?: number }; overrides?: Array<{ when?: { context?: { gt?: number } }; price?: number; cache?: { read?: number; write?: number } }> };
      output?: { price?: number; overrides?: Array<{ when?: { context?: { gt?: number } }; price?: number }> };
    };
    multipliers?: Array<{ when?: MultiplierWhen; factor?: number }>;
  };
}

interface MultiplierWhen {
  utc_days?: { in?: string[] };
  any?: Array<{ all?: Array<{ utc_hours?: { gte?: string; lt?: string } }> }>;
}

export interface GoSpendRow {
  ts: number;
  model: string;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface ModelUsage {
  model: string;
  spend5h: number;
  spend7d: number;
  spendMonth: number;
  limit: number | null;
  pct5h: number | null;
  pct7d: number | null;
  pctMonth: number | null;
  projectedDays: number | null;
}

export interface GoUsage {
  plan: GoPlan;
  models: ModelUsage[];
  windows: Record<GoWindow, { pct: number | null; model: string | null; resetAt: string | null }>;
  binding: { model: string; window: GoWindow; pct: number } | null;
  source: 'local-ledger' | 'unavailable';
  periodStart: string;
  updatedAt: string;
  note: string;
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function hhmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function matchesWhen(when: MultiplierWhen | undefined, ts: number): boolean {
  if (!when) return false;
  const d = new Date(ts);
  const day = DAY_NAMES[d.getUTCDay()];
  if (when.utc_days?.in && !when.utc_days.in.includes(day)) return false;
  const t = hhmm(d);
  const any = when.any ?? [];
  if (any.length === 0) return true;
  for (const group of any) {
    const all = group.all ?? [];
    if (all.every((c) => {
      const gte = c.utc_hours?.gte;
      const lt = c.utc_hours?.lt;
      return (!gte || t >= gte) && (!lt || t < lt);
    })) return true;
  }
  return false;
}

function priceFor(entry: CatalogModel | undefined, context: number, ts: number): { input: number; output: number; cacheRead: number; cacheWrite: number; factor: number } {
  const text = entry?.cost?.text;
  if (!text) return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, factor: 1 };
  let input = Number(text.input?.price ?? 0);
  let output = Number(text.output?.price ?? 0);
  let cacheRead = Number(text.input?.cache?.read ?? 0);
  let cacheWrite = Number(text.input?.cache?.write ?? 0);
  for (const o of text.input?.overrides ?? []) {
    if (context > Number(o.when?.context?.gt ?? Infinity)) {
      input = Number(o.price ?? input);
      cacheRead = Number(o.cache?.read ?? cacheRead);
      cacheWrite = Number(o.cache?.write ?? cacheWrite);
    }
  }
  for (const o of text.output?.overrides ?? []) {
    if (context > Number(o.when?.context?.gt ?? Infinity)) output = Number(o.price ?? output);
  }
  let factor = 1;
  for (const m of entry?.cost?.multipliers ?? []) {
    if (matchesWhen(m.when, ts)) factor = Number(m.factor ?? factor);
  }
  return { input, output, cacheRead, cacheWrite, factor };
}

/** Price one assistant turn. Pure; the test uses it directly. */
export function priceTurn(entry: CatalogModel | undefined, tokens: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }, ts: number): number {
  const input = Number(tokens.input ?? 0);
  const output = Number(tokens.output ?? 0);
  const cacheRead = Number(tokens.cacheRead ?? 0);
  const cacheWrite = Number(tokens.cacheWrite ?? 0);
  const context = input + cacheRead + cacheWrite;
  const p = priceFor(entry, context, ts);
  const cost = p.input * input / 1e6 + p.output * output / 1e6 + p.cacheRead * cacheRead / 1e6 + p.cacheWrite * cacheWrite / 1e6;
  return Math.max(0, cost * p.factor);
}

function monthStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function todayStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function aggregate(rows: GoSpendRow[], plan: GoPlan, now = Date.now(), startedAt?: number): GoUsage {
  const limits = GO_LIMITS[plan] ?? GO_LIMITS['go-plus'];
  // The plan period starts when the subscription started, not when the
  // calendar month did. The default is today (the user subscribed today);
  // the console remains authoritative.
  const periodStart = Math.max(0, startedAt ?? todayStart(now));
  const windows = {
    h5: Math.max(now - 5 * 3600_000, periodStart),
    d7: Math.max(now - 7 * 86400_000, periodStart),
    month: Math.max(monthStart(now), periodStart),
  };
  const byModel = new Map<string, GoSpendRow[]>();
  for (const r of rows) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model)!.push(r);
  }
  const models: ModelUsage[] = [];
  for (const [model, list] of byModel) {
    const sum = (since: number) => list.filter((r) => r.ts >= since).reduce((s, r) => s + r.cost, 0);
    const spend5h = sum(windows.h5);
    const spend7d = sum(windows.d7);
    const spendMonth = sum(windows.month);
    const limit = limits[model] ?? null;
    // The console shows each window against ITS OWN allowance: 5h = 20% of
    // the monthly limit, week = 50%, month = 100%.
    const pct = (spend: number, factor: number) => limit && limit > 0 ? Math.min(999, (spend / (limit * factor)) * 100) : null;
    const elapsedDays = Math.max(1 / 24, (now - windows.month) / 86400_000);
    const projectedDays = limit && spendMonth > 0 ? Math.max(0, (limit - spendMonth) / (spendMonth / elapsedDays)) : null;
    models.push({ model, spend5h, spend7d, spendMonth, limit, pct5h: pct(spend5h, 0.20), pct7d: pct(spend7d, 0.50), pctMonth: pct(spendMonth, 1), projectedDays });
  }
  models.sort((a, b) => (b.pctMonth ?? -1) - (a.pctMonth ?? -1));

  const maxFor = (key: 'pct5h' | 'pct7d' | 'pctMonth') => {
    const row = [...models].filter((m) => m[key] != null).sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))[0];
    return row ? { pct: row[key] as number, model: row.model } : { pct: null, model: null };
  };
  const h5 = maxFor('pct5h');
  const d7 = maxFor('pct7d');
  const mo = maxFor('pctMonth');
  const oldest = (since: number) => rows.filter((r) => r.ts >= since).reduce((min, r) => Math.min(min, r.ts), Infinity);
  const h5Oldest = oldest(windows.h5);
  const d7Oldest = oldest(windows.d7);
  const nextMonth = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 1);
  const bindingCandidates: Array<{ model: string; window: GoWindow; pct: number }> = [];
  for (const m of models) {
    if (m.pct5h != null) bindingCandidates.push({ model: m.model, window: 'h5', pct: m.pct5h });
    if (m.pct7d != null) bindingCandidates.push({ model: m.model, window: 'd7', pct: m.pct7d });
    if (m.pctMonth != null) bindingCandidates.push({ model: m.model, window: 'month', pct: m.pctMonth });
  }
  bindingCandidates.sort((a, b) => b.pct - a.pct);

  return {
    plan,
    models,
    windows: {
      h5: { ...h5, resetAt: Number.isFinite(h5Oldest) ? new Date(h5Oldest + 5 * 3600_000).toISOString() : null },
      d7: { ...d7, resetAt: Number.isFinite(d7Oldest) ? new Date(d7Oldest + 7 * 86400_000).toISOString() : null },
      month: { ...mo, resetAt: new Date(nextMonth).toISOString() },
    },
    binding: bindingCandidates[0] ?? null,
    source: rows.length > 0 ? 'local-ledger' : 'unavailable',
    periodStart: new Date(periodStart).toISOString(),
    updatedAt: new Date(now).toISOString(),
    note: 'Measured locally from OpenCode message tokens × the public Go catalog; 5h/week are % of each window allowance (20%/50% of the monthly limit). The console is authoritative; Extra Usage may bill PAYG.',
  };
}

// ── Plan persistence ──────────────────────────────────────────────────────

function home(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

export function readGoPlan(): GoPlan {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(home(), 'go-plan.json'), 'utf-8'));
    if (raw?.plan === 'go' || raw?.plan === 'go-plus' || raw?.plan === 'go-teams') return raw.plan;
  } catch { /* default */ }
  return 'go-plus';
}

export function readGoPlanStart(now = Date.now()): number {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(home(), 'go-plan.json'), 'utf-8'));
    const t = Date.parse(raw?.startedAt);
    if (Number.isFinite(t) && t > 0) return t;
  } catch { /* default */ }
  return todayStart(now);
}

export function writeGoPlan(plan: GoPlan, startedAt?: number): void {
  try {
    fs.mkdirSync(home(), { recursive: true });
    const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(home(), 'go-plan.json'), 'utf-8')); } catch { return {}; } })();
    const start = startedAt ?? (Date.parse(prev?.startedAt) || todayStart(Date.now()));
    fs.writeFileSync(path.join(home(), 'go-plan.json'), JSON.stringify({ plan, startedAt: new Date(start).toISOString(), updatedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  } catch { /* best effort */ }
}

// ── Catalog (live + 24h cache + offline fallback) ─────────────────────────

const CATALOG_URL = 'https://opencode.ai/inference/go/v1/models';
const CATALOG_TTL_MS = 24 * 3600_000;

export async function loadCatalog(): Promise<{ models: Map<string, CatalogModel>; source: 'live' | 'cache' | 'fallback' }> {
  const file = path.join(home(), 'go-models.json');
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (cached?.fetchedAt && Date.now() - Number(cached.fetchedAt) < CATALOG_TTL_MS && Array.isArray(cached?.data)) {
      return { models: new Map((cached.data as CatalogModel[]).map((m) => [m.id, m])), source: 'cache' };
    }
  } catch { /* fetch */ }
  try {
    const r = await fetch(CATALOG_URL, { headers: { 'User-Agent': 'olympus-go-usage/1.0' }, cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      const data = Array.isArray(d?.data) ? d.data as CatalogModel[] : [];
      if (data.length > 0) {
        try { fs.writeFileSync(file, JSON.stringify({ fetchedAt: Date.now(), data }, null, 0) + '\n', { mode: 0o600 }); } catch { /* cache best effort */ }
        return { models: new Map(data.map((m) => [m.id, m])), source: 'live' };
      }
    }
  } catch { /* offline */ }
  const fallback = new Map<string, CatalogModel>();
  for (const [id, cost] of Object.entries(FALLBACK_COST)) fallback.set(id, { id, cost });
  return { models: fallback, source: 'fallback' };
}

// ── Local ledger ───────────────────────────────────────────────────────────

function dbPaths(): string[] {
  return [
    process.env.OPENCODE_DATA_DIR ? path.join(process.env.OPENCODE_DATA_DIR, 'opencode.db') : '',
    path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db'),
    path.join(os.homedir(), '.olympus', 'hop-data', 'opencode', 'opencode.db'),
    path.join(os.homedir(), '.olympus', 'opencode', 'opencode.db'),
    path.join(os.homedir(), '.config', 'opencode', 'opencode.db'),
  ].filter(Boolean);
}

/** Read the OpenCode message ledger (global + the hop-lane DB) and price
 *  every Go assistant turn. The AIME walk writes to the hop-data DB; reading
 *  only the chat DB undercounted the 5h window. */
export function readSpendRows(catalog: Map<string, CatalogModel>, now = Date.now()): GoSpendRow[] {
  let Database: any = null;
  try { Database = require('better-sqlite3'); } catch { return []; }
  const rows: GoSpendRow[] = [];
  const seen = new Set<string>();
  const since = monthStart(now);
  for (const dbPath of dbPaths()) {
    try { if (!fs.existsSync(dbPath)) continue; } catch { continue; }
    try {
      const db = new Database(dbPath, { readonly: true, timeout: 2500 });
      try {
        const hasV2 = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_message'").get();
        const table = hasV2 ? 'session_message' : 'message';
        const list = db.prepare(`SELECT rowid as rowid, data, time_created FROM ${table} WHERE time_created >= ? AND data LIKE '%opencode-go%' ORDER BY time_created DESC LIMIT 50000`).all(since) as Array<{ rowid: number; data: string; time_created: number }>;
        for (const row of list) {
          let d: any;
          try { d = JSON.parse(row.data); } catch { continue; }
          // v0.0.87 — the hop-data DB writes the flat v1 shape
          // (`providerID`, `modelID`); the global v2 DB writes `model`.
          // Reading only `d.model.providerID` skipped every AIME hop row.
          const provider = typeof d?.model?.providerID === 'string' ? d.model.providerID
            : typeof d?.providerID === 'string' ? d.providerID : '';
          if (provider !== 'opencode-go') continue;
          const model = typeof d?.model?.id === 'string' ? d.model.id
            : typeof d?.modelID === 'string' ? d.modelID : '';
          if (!model || !d?.tokens || typeof d.tokens !== 'object') continue;
          const out = Number(d.tokens.output ?? 0);
          const input = Number(d.tokens.input ?? 0);
          const cacheRead = Number(d.tokens.cache?.read ?? 0);
          const cacheWrite = Number(d.tokens.cache?.write ?? 0);
          if (out + input + cacheRead + cacheWrite <= 0) continue;
          const key = `${dbPath}:${row.rowid}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const ts = Number(d?.time?.completed ?? d?.time?.streamed ?? row.time_created) || row.time_created;
          const cost = Number(d?.cost) > 0 ? Number(d.cost) : priceTurn(catalog.get(model), { input, output: out, cacheRead, cacheWrite }, ts);
          rows.push({ ts, model, input, output: out, reasoning: Number(d.tokens.reasoning ?? 0), cacheRead, cacheWrite, cost });
        }
      } finally { db.close(); }
    } catch { /* a locked/absent DB must not hide the others */ }
  }
  // v0.0.87 — the app's own step-finish ledger carries the interactive
  // sessions (the v2 DB has no per-message tokens). Merge it, deduping the
  // rows the hop-data DB already reported (same model + ~5s + token pair).
  try {
    const ledger = path.join(home(), 'metrics', 'cost.jsonl');
    const lines = fs.readFileSync(ledger, 'utf-8').trim().split('\n').slice(-60_000);
    for (const line of lines) {
      let r: any;
      try { r = JSON.parse(line); } catch { continue; }
      if (r?.tool !== '_step-finish_') continue;
      const fullModel = String(r.model || '');
      if (!fullModel.startsWith('opencode-go/')) continue;
      const model = fullModel.slice('opencode-go/'.length);
      const ts = Date.parse(r.ts) || 0;
      if (!ts || ts < since) continue;
      const input = Number(r.input_tokens ?? 0);
      const out = Number(r.output_tokens ?? 0);
      const cacheRead = Number(r.cached_tokens ?? 0);
      const cacheWrite = Number(r.cache_write_tokens ?? 0);
      if (input + out + cacheRead + cacheWrite <= 0) continue;
      const key = `${model}:${Math.round(ts / 5000)}:${input}:${out}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cost = Number(r.spend_usd) > 0 ? Number(r.spend_usd) : priceTurn(catalog.get(model), { input, output: out, cacheRead, cacheWrite }, ts);
      rows.push({ ts, model, input, output: out, reasoning: Number(r.reasoning_tokens ?? 0), cacheRead, cacheWrite, cost });
    }
  } catch { /* no ledger is not a crash */ }
  return rows;
}
