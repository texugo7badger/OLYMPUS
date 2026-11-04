/**
 * cost-caps.ts — v0.0.72: the spend brake.
 *
 * The campaign deadline already bounds TIME; nothing bounded MONEY. This
 * module reads the same ledger the cost panel reads and answers one question
 * before a hop launches: is this campaign still inside the user's budget?
 *
 * The cap is evaluated on the LIST VALUE (`spend_estimated_usd`) because a
 * subscription reports a $0 invoice while still consuming a quota — the
 * brake must see the quota, not the invoice. When no cap is configured the
 * walk is unlimited (the default: caps are opt-in, a cap file or env vars).
 *
 * Config (`~/.olympus/cost-caps.json`, all fields optional):
 *   {
 *     "global": {
 *       "fiveHourUsd": 5,  "weeklyUsd": 50,  "monthlyUsd": 150,
 *       "fiveHourTokens": 5000000, "weeklyTokens": 50000000, "monthlyTokens": 200000000
 *     }
 *   }
 *
 * Env overrides: OLYMPUS_CAP_5H_USD, OLYMPUS_CAP_WEEKLY_USD,
 * OLYMPUS_CAP_MONTHLY_USD, OLYMPUS_CAP_5H_TOKENS, OLYMPUS_CAP_WEEKLY_TOKENS,
 * OLYMPUS_CAP_MONTHLY_TOKENS.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface CostWindowCaps {
  fiveHourUsd?: number;
  weeklyUsd?: number;
  monthlyUsd?: number;
  fiveHourTokens?: number;
  weeklyTokens?: number;
  monthlyTokens?: number;
}

export interface CostCaps {
  /** A cap file or an env var exists. When false, the brake is off. */
  enabled: boolean;
  global: CostWindowCaps;
}

export interface CostLedgerRow {
  ts: string;
  spend_estimated_usd?: number;
  spend_usd?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface CostWindowUsage {
  spendUsd: number;
  tokens: number;
  rows: number;
}

export type CostCapVerdict =
  | { ok: true; enabled: boolean }
  | {
      ok: false;
      /** `5h` | `weekly` | `monthly` */
      window: '5h' | 'weekly' | 'monthly';
      usedUsd: number;
      capUsd: number | null;
      usedTokens: number;
      capTokens: number | null;
      reason: string;
    };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function homeDir(home?: string): string {
  return home || process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Read the caps file + env. Never throws: a broken file is "no caps". */
export function readCostCaps(home?: string): CostCaps {
  let global: CostWindowCaps = {};
  try {
    const file = path.join(homeDir(home), 'cost-caps.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const g = raw?.global ?? raw ?? {};
    global = {
      fiveHourUsd: num(g.fiveHourUsd),
      weeklyUsd: num(g.weeklyUsd),
      monthlyUsd: num(g.monthlyUsd),
      fiveHourTokens: num(g.fiveHourTokens),
      weeklyTokens: num(g.weeklyTokens),
      monthlyTokens: num(g.monthlyTokens),
    };
  } catch { /* no file = no caps */ }

  const env = process.env;
  global = {
    fiveHourUsd: num(env.OLYMPUS_CAP_5H_USD) ?? global.fiveHourUsd,
    weeklyUsd: num(env.OLYMPUS_CAP_WEEKLY_USD) ?? global.weeklyUsd,
    monthlyUsd: num(env.OLYMPUS_CAP_MONTHLY_USD) ?? global.monthlyUsd,
    fiveHourTokens: num(env.OLYMPUS_CAP_5H_TOKENS) ?? global.fiveHourTokens,
    weeklyTokens: num(env.OLYMPUS_CAP_WEEKLY_TOKENS) ?? global.weeklyTokens,
    monthlyTokens: num(env.OLYMPUS_CAP_MONTHLY_TOKENS) ?? global.monthlyTokens,
  };
  const enabled = Object.values(global).some((v) => typeof v === 'number');
  return { enabled, global };
}

/** Read the ledger, cached by mtime — the walker may ask once per hop. */
let ledgerCache: { file: string; mtimeMs: number; rows: CostLedgerRow[] } | null = null;
export function readLedgerRows(home?: string): CostLedgerRow[] {
  const file = path.join(homeDir(home), 'metrics', 'cost.jsonl');
  let mtimeMs = 0;
  try { mtimeMs = fs.statSync(file).mtimeMs; } catch { return []; }
  if (ledgerCache && ledgerCache.file === file && ledgerCache.mtimeMs === mtimeMs) return ledgerCache.rows;
  const rows: CostLedgerRow[] = [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line) as CostLedgerRow); } catch { /* torn line */ }
    }
  } catch { /* unreadable = empty */ }
  ledgerCache = { file, mtimeMs, rows };
  return rows;
}

/** Usage inside one window, computed from the ledger's list value. */
export function windowUsage(rows: CostLedgerRow[], windowMs: number, now = Date.now()): CostWindowUsage {
  const since = now - windowMs;
  let spendUsd = 0;
  let tokens = 0;
  let count = 0;
  for (const row of rows) {
    const ts = Date.parse(String(row.ts ?? ''));
    if (!Number.isFinite(ts) || ts < since) continue;
    count += 1;
    spendUsd += Number(row.spend_estimated_usd) || 0;
    tokens += (Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0);
  }
  return { spendUsd: Number(spendUsd.toFixed(4)), tokens, rows: count };
}

function exceeded(
  window: '5h' | 'weekly' | 'monthly',
  usage: CostWindowUsage,
  capUsd: number | undefined,
  capTokens: number | undefined,
): CostCapVerdict | null {
  const usdHit = typeof capUsd === 'number' && usage.spendUsd >= capUsd;
  const tokHit = typeof capTokens === 'number' && usage.tokens >= capTokens;
  if (!usdHit && !tokHit) return null;
  const parts: string[] = [];
  if (usdHit) parts.push(`$${usage.spendUsd.toFixed(2)} of $${capUsd!.toFixed(2)} list value`);
  if (tokHit) parts.push(`${usage.tokens.toLocaleString('en-US')} of ${capTokens!.toLocaleString('en-US')} tokens`);
  return {
    ok: false,
    window,
    usedUsd: usage.spendUsd,
    capUsd: typeof capUsd === 'number' ? capUsd : null,
    usedTokens: usage.tokens,
    capTokens: typeof capTokens === 'number' ? capTokens : null,
    reason: `cost-cap-exceeded:${window} — ${parts.join(' and ')}; raise the cap or wait for the window to roll`,
  };
}

/**
 * The brake. Evaluated tightest-window-first so the reason names the window
 * that actually stopped the walk. A disabled cap set is always `ok`.
 */
export function evaluateCostCaps(
  rows: CostLedgerRow[],
  caps: CostCaps = readCostCaps(),
  now = Date.now(),
): CostCapVerdict {
  if (!caps.enabled) return { ok: true, enabled: false };
  const windows: Array<['5h' | 'weekly' | 'monthly', number, number | undefined, number | undefined]> = [
    ['5h', 5 * HOUR, caps.global.fiveHourUsd, caps.global.fiveHourTokens],
    ['weekly', 7 * DAY, caps.global.weeklyUsd, caps.global.weeklyTokens],
    ['monthly', 30 * DAY, caps.global.monthlyUsd, caps.global.monthlyTokens],
  ];
  for (const [name, ms, capUsd, capTokens] of windows) {
    if (typeof capUsd !== 'number' && typeof capTokens !== 'number') continue;
    const verdict = exceeded(name, windowUsage(rows, ms, now), capUsd, capTokens);
    if (verdict) return verdict;
  }
  return { ok: true, enabled: true };
}

/** Convenience for the walker: read the ledger + evaluate in one call. */
export function checkCostCaps(home?: string, now = Date.now()): CostCapVerdict {
  const caps = readCostCaps(home);
  if (!caps.enabled) return { ok: true, enabled: false };
  return evaluateCostCaps(readLedgerRows(home), caps, now);
}

/** The caps, as the UI/route prints them (never a silent zero). */
export function describeCaps(caps: CostCaps, rows: CostLedgerRow[], now = Date.now()) {
  const usage = {
    fiveHour: windowUsage(rows, 5 * HOUR, now),
    weekly: windowUsage(rows, 7 * DAY, now),
    monthly: windowUsage(rows, 30 * DAY, now),
  };
  return { enabled: caps.enabled, caps: caps.global, usage };
}
