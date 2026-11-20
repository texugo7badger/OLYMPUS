/**
 * go-console.ts — v0.0.96: the GO console anchor.
 *
 * The console is the source of truth for the ACCOUNT windows (25% monthly,
 * 3% 5h, 8% weekly); the local ledger is the source of truth for the
 * per-model attribution and for the delta between syncs. This module stores
 * one honest anchor:
 *
 *   { plan, monthlyPct, h5Pct, weeklyPct, resetAt, capUsd,
 *     localSpendMonthUsd, localSpend5hUsd, localSpend7dUsd,
 *     requests, tokens, modelMix, capturedAt, source }
 *
 * The capture stores the local spend at the same instant, so the app can
 * interpolate the account percentage between syncs without inventing a
 * history: pctNow = anchorPct + (spendNow - spendAtAnchor) / cap * 100.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type GoConsoleSource = 'manual' | 'browser' | 'import';

export interface GoConsoleModelMix {
  model: string;
  pct: number;
}

export interface GoConsoleAnchor {
  plan: 'go' | 'go-plus' | 'go-teams';
  monthlyPct: number;
  h5Pct: number;
  weeklyPct: number;
  resetAt: string;
  /** The plan-wide monthly cap (USD), when known/inferred. */
  capUsd: number | null;
  /** Local ledger totals at the capture instant (the interpolation base). */
  localSpendMonthUsd: number;
  localSpend5hUsd: number;
  localSpend7dUsd: number;
  /** The local spend since the current weekly (Monday 00:00 UTC) start. */
  localSpendWeekUsd: number;
  requests: number | null;
  tokens: number | null;
  modelMix: GoConsoleModelMix[];
  capturedAt: string;
  source: GoConsoleSource;
}

const HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
export const GO_CONSOLE_FILE = 'go-console.json';

export function goConsolePath(home = HOME()): string {
  return path.join(home, GO_CONSOLE_FILE);
}

function clampPct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, n));
}

/** Parse a console percentage; accepts "25", "25%", "25.4%". */
export function parsePct(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return clampPct(value);
  const text = String(value ?? '').trim().replace(/%/g, '').replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? clampPct(n) : null;
}

export function normalizeAnchor(input: unknown): GoConsoleAnchor | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<GoConsoleAnchor> & Record<string, unknown>;
  const plan = raw.plan === 'go' || raw.plan === 'go-plus' || raw.plan === 'go-teams' ? raw.plan : 'go-plus';
  const monthlyPct = parsePct(raw.monthlyPct);
  const h5Pct = parsePct(raw.h5Pct);
  const weeklyPct = parsePct(raw.weeklyPct);
  const resetAt = Date.parse(String(raw.resetAt ?? ''));
  if (monthlyPct == null || h5Pct == null || weeklyPct == null || !Number.isFinite(resetAt)) return null;
  const cap = Number(raw.capUsd);
  const capUsd = Number.isFinite(cap) && cap > 0 ? cap : null;
  const local = (key: string): number => {
    const n = Number((raw as any)[key]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const requests = Number(raw.requests);
  const tokens = Number(raw.tokens);
  const modelMix = Array.isArray(raw.modelMix)
    ? raw.modelMix
      .map((m: any) => ({ model: String(m?.model ?? '').trim(), pct: parsePct(m?.pct) ?? 0 }))
      .filter((m) => m.model && m.pct > 0)
      .slice(0, 40)
    : [];
  return {
    plan,
    monthlyPct,
    h5Pct,
    weeklyPct,
    resetAt: new Date(resetAt).toISOString(),
    capUsd,
    localSpendMonthUsd: local('localSpendMonthUsd'),
    localSpend5hUsd: local('localSpend5hUsd'),
    localSpend7dUsd: local('localSpend7dUsd'),
    localSpendWeekUsd: local('localSpendWeekUsd') || local('localSpend7dUsd'),
    requests: Number.isFinite(requests) && requests >= 0 ? requests : null,
    tokens: Number.isFinite(tokens) && tokens >= 0 ? tokens : null,
    modelMix,
    capturedAt: Number.isFinite(Date.parse(String(raw.capturedAt ?? '')))
      ? new Date(String(raw.capturedAt)).toISOString()
      : new Date().toISOString(),
    source: raw.source === 'browser' || raw.source === 'import' ? raw.source : 'manual',
  };
}

export function readGoConsoleAnchor(home = HOME()): GoConsoleAnchor | null {
  try {
    return normalizeAnchor(JSON.parse(fs.readFileSync(goConsolePath(home), 'utf-8')));
  } catch {
    return null;
  }
}

export function writeGoConsoleAnchor(anchor: GoConsoleAnchor, home = HOME()): boolean {
  try {
    const normalized = normalizeAnchor(anchor);
    if (!normalized) return false;
    fs.mkdirSync(path.dirname(goConsolePath(home)), { recursive: true });
    fs.writeFileSync(goConsolePath(home), JSON.stringify(normalized, null, 2) + '\n', { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

/**
 * The next weekly reset. The console's "Resets in 2d 6h" on Wed 20 Nov points
 * at Monday 00:00 UTC; a rolling 7-day window is a different (and wrong)
 * number. Kept pure for the test suite.
 */
export function nextWeeklyReset(now = Date.now()): string {
  const d = new Date(now);
  const day = d.getUTCDay(); // 0 Sun … 1 Mon
  const daysUntilMonday = (8 - day) % 7;
  let target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMonday, 0, 0, 0, 0);
  if (target <= now) target += 7 * 86400_000;
  return new Date(target).toISOString();
}

export interface AccountWindowInput {
  anchor: GoConsoleAnchor | null;
  spendMonthUsd: number;
  spend5hUsd: number;
  spend7dUsd: number;
  /** Spend since the current Monday 00:00 UTC (the console's weekly window). */
  spendWeekUsd?: number;
  now?: number;
}

export interface AccountWindowResult {
  monthlyPct: number | null;
  h5Pct: number | null;
  weeklyPct: number | null;
  capUsd: number | null;
  source: 'console' | 'mixed' | 'local';
  anchorAt: string | null;
  anchorAgeMs: number | null;
  weeklyResetAt: string;
  monthlyResetAt: string | null;
}

/**
 * The anchor + local delta. If the anchor has no cap, the cap is inferred from
 * its own spend/pct pair — never from a hardcoded plan price. When there is no
 * anchor, the local ledger totals are returned as a LOWER BOUND with
 * `source:'local'`; the UI must label it that way.
 */
export function accountWindows(input: AccountWindowInput, now = input.now ?? Date.now()): AccountWindowResult {
  const anchor = input.anchor;
  const weeklyResetAt = nextWeeklyReset(now);
  if (!anchor) {
    return {
      monthlyPct: null,
      h5Pct: null,
      weeklyPct: null,
      capUsd: null,
      source: 'local',
      anchorAt: null,
      anchorAgeMs: null,
      weeklyResetAt,
      monthlyResetAt: null,
    };
  }
  const cap = anchor.capUsd
    ?? (anchor.monthlyPct > 0 ? (anchor.localSpendMonthUsd / (anchor.monthlyPct / 100)) : null);
  const safeCap = cap && Number.isFinite(cap) && cap > 0 ? cap : null;
  const delta = (nowSpend: number, atAnchor: number) => Math.max(0, Number(nowSpend || 0) - Number(atAnchor || 0));
  const pct = (base: number, deltaSpend: number, limit: number | null) => {
    if (!limit || limit <= 0) return null;
    return Math.max(0, Math.min(999, base + (deltaSpend / limit) * 100));
  };
  const monthPct = safeCap ? pct(anchor.monthlyPct, delta(input.spendMonthUsd, anchor.localSpendMonthUsd), safeCap) : anchor.monthlyPct;
  const h5Cap = safeCap ? safeCap * 0.20 : null;
  const weekCap = safeCap ? safeCap * 0.50 : null;
  const h5Pct = h5Cap ? pct(anchor.h5Pct, delta(input.spend5hUsd, anchor.localSpend5hUsd), h5Cap) : anchor.h5Pct;
  // The weekly anchor is only valid inside its own week; a week has passed
  // when the captured reset is before the next boundary.
  const anchorMs = Date.parse(anchor.capturedAt);
  const sameWeek = Number.isFinite(anchorMs) && Date.parse(nextWeeklyReset(anchorMs)) > now;
  const weeklyPct = sameWeek && weekCap
    ? pct(anchor.weeklyPct, delta(input.spendWeekUsd ?? input.spend7dUsd, anchor.localSpendWeekUsd ?? anchor.localSpend7dUsd), weekCap)
    : null;
  return {
    monthlyPct: monthPct,
    h5Pct,
    weeklyPct,
    capUsd: safeCap,
    source: safeCap ? 'console' : 'mixed',
    anchorAt: anchor.capturedAt,
    anchorAgeMs: Number.isFinite(anchorMs) ? Math.max(0, now - anchorMs) : null,
    weeklyResetAt,
    monthlyResetAt: anchor.resetAt,
  };
}
