/**
 * OriginKit free-tier fetch budget — the RUNTIME GATE copy (#198).
 *
 * The free API key allows 10 fetches/day. This module counts them at the
 * point of use (the `permission.ask` hook sees every MCP tool call) and
 * refuses the 11th synchronously with the reset time — never a hang.
 *
 * Source of truth: src/lib/originkit-budget.ts (the Next app: UI + routes).
 * The overlay cannot import from src/, so this copy must stay
 * behavior-identical — scripts/originkit-budget.test.mjs pins both.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const ORIGINKIT_DAILY_LIMIT = 10;
export const ORIGINKIT_BUDGET_FILENAME = "originkit-budget.json";

export interface OriginkitBudget {
  day: string;
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
  exhausted: boolean;
}

export interface OriginkitBudgetOptions {
  now?: Date;
  stateDir?: string;
}

export type OriginkitConsumeResult =
  | { ok: true; budget: OriginkitBudget }
  | { ok: false; error: string; budget: OriginkitBudget };

function stateDir(opts?: OriginkitBudgetOptions): string {
  return opts?.stateDir || process.env.OLYMPUS_HOME || join(homedir(), ".olympus");
}

function budgetFile(opts?: OriginkitBudgetOptions): string {
  return join(stateDir(opts), ORIGINKIT_BUDGET_FILENAME);
}

function localDay(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nextLocalMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
}

export function formatOriginkitReset(resetAt: string): string {
  const d = new Date(resetAt);
  if (Number.isNaN(d.getTime())) return "local midnight";
  return d.toLocaleString("en-US", { hour12: false });
}

export function readOriginkitBudget(opts?: OriginkitBudgetOptions): OriginkitBudget {
  const now = opts?.now ?? new Date();
  const day = localDay(now);
  let used = 0;
  try {
    const raw = JSON.parse(readFileSync(budgetFile(opts), "utf-8"));
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
    if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ day: next.day, used: next.used, updatedAt: now.toISOString() }, null, 2), "utf-8");
  } catch (e: any) {
    return {
      ok: false,
      error: `OriginKit budget could not be persisted (${e?.message || "unknown error"}) — refusing the fetch rather than overrunning the free key.`,
      budget,
    };
  }
  return { ok: true, budget: next };
}

/** A fetch-shaped Originkit tool consumes quota; browse/list do not. */
export function isOriginkitFetchTool(toolName: string): boolean {
  return /fetch|download|source/i.test(toolName);
}
