/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * #198 — OriginKit free-tier fetch budget. The free API key allows 10
 * fetches/day. Nothing used to count them, so the first silent exhaustion
 * looked like a broken references lane. This module is the canonical
 * counter: persisted next to the equipped-MCPs store (~/.olympus/
 * mcp-state.json → ~/.olympus/originkit-budget.json), reset at local
 * midnight, and honest when exhausted (remaining + reset time).
 *
 * The runtime gate lives in .opencode/olympus/lib/originkit-budget.ts and
 * is kept behavior-identical (pinned by scripts/originkit-budget.test.mjs):
 * the overlay cannot import from src/, so the two copies must agree.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ORIGINKIT_DAILY_LIMIT = 10;
export const ORIGINKIT_BUDGET_FILENAME = 'originkit-budget.json';

export interface OriginkitBudget {
  /** Local calendar day the counter belongs to (YYYY-MM-DD). */
  day: string;
  used: number;
  limit: number;
  remaining: number;
  /** ISO timestamp of the next local midnight (when the counter resets). */
  resetAt: string;
  exhausted: boolean;
}

export interface OriginkitBudgetOptions {
  now?: Date;
  /** Override the state dir (tests / fixtures). Defaults to OLYMPUS_HOME or ~/.olympus. */
  stateDir?: string;
}

export type OriginkitConsumeResult =
  | { ok: true; budget: OriginkitBudget }
  | { ok: false; error: string; budget: OriginkitBudget };

function stateDir(opts?: OriginkitBudgetOptions): string {
  return opts?.stateDir || process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

function budgetFile(opts?: OriginkitBudgetOptions): string {
  return path.join(stateDir(opts), ORIGINKIT_BUDGET_FILENAME);
}

function localDay(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nextLocalMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
}

export function formatOriginkitReset(resetAt: string): string {
  const d = new Date(resetAt);
  if (Number.isNaN(d.getTime())) return 'local midnight';
  return d.toLocaleString('en-US', { hour12: false });
}

/** Read the current day's budget. A stale/corrupt file reads as a fresh day. */
export function readOriginkitBudget(opts?: OriginkitBudgetOptions): OriginkitBudget {
  const now = opts?.now ?? new Date();
  const day = localDay(now);
  let used = 0;
  try {
    const raw = JSON.parse(fs.readFileSync(budgetFile(opts), 'utf-8'));
    if (raw && raw.day === day && Number.isFinite(raw.used)) {
      used = Math.max(0, Math.floor(raw.used));
    }
  } catch { /* missing/corrupt = fresh day */ }
  const remaining = Math.max(0, ORIGINKIT_DAILY_LIMIT - used);
  return {
    day,
    used,
    limit: ORIGINKIT_DAILY_LIMIT,
    remaining,
    resetAt: nextLocalMidnight(now).toISOString(),
    exhausted: remaining === 0,
  };
}

/**
 * Consume one fetch. Refuses synchronously (no network, no hang) when the
 * day is exhausted, and refuses rather than silently overrunning when the
 * counter cannot be persisted.
 */
export function consumeOriginkitFetch(opts?: OriginkitBudgetOptions): OriginkitConsumeResult {
  const now = opts?.now ?? new Date();
  const budget = readOriginkitBudget({ ...opts, now });
  if (budget.exhausted) {
    return {
      ok: false,
      error: `OriginKit free key exhausted: ${budget.limit}/${budget.limit} fetches used today. Resets at ${formatOriginkitReset(budget.resetAt)}. Use the Skiper shadcn lane or the demo URL instead — do not retry.`,
      budget,
    };
  }
  const next: OriginkitBudget = {
    ...budget,
    used: budget.used + 1,
    remaining: budget.remaining - 1,
    exhausted: budget.remaining - 1 === 0,
  };
  try {
    const file = budgetFile(opts);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ day: next.day, used: next.used, updatedAt: now.toISOString() }, null, 2), 'utf-8');
  } catch (e: any) {
    return {
      ok: false,
      error: `OriginKit budget could not be persisted (${e?.message || 'unknown error'}) — refusing the fetch rather than overrunning the free key.`,
      budget,
    };
  }
  return { ok: true, budget: next };
}
