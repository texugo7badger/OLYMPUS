/**
 * Olympus Vault Periodic Notes — Public API (v2.0.0)
 * =====================================================
 *
 * Daily / weekly per-god session summaries. Replaces the v1 stub (which
 * threw `'Tier 2 — not implemented'`).
 *
 * The Callimachus agent calls `generateDaily(god, date)` at the end of each
 * session and `generateWeekly(god, weekStart)` on Sundays.
 *
 * Both functions are idempotent — calling twice for the same god+date
 * overwrites the file with fresh content.
 *
 * Public API signatures match the v1 stub EXACTLY:
 *   - `getDailyNotePath(god, date)` — pure path logic (already in v1 stub)
 *   - `getWeeklyNotePath(god, weekStart)` — pure path logic (already in v1 stub)
 *   - `generateDaily(god, date)` — generates + writes the daily note
 *   - `generateWeekly(god, weekStart)` — generates + writes the weekly note
 *
 * Implementation requires a bound `VaultAPI` (set by `bindVaultApi()`).
 * The `VaultAPI` facade calls `bindVaultApi()` on construction.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { VaultAPI } from '../vault';
import type { PeriodicNoteResult } from './types';
import { generateDailySummary, generateWeeklySummary } from './generator';

// Re-export the path helpers (already in v1 stub — keep signatures identical).
export { getDailyNotePath, getWeeklyNotePath } from './index-helpers';
export type { PeriodicNoteResult } from './types';

// ─────────────────────────────────────────────────────────────────────
// Module-level singleton: the active VaultAPI.
// ─────────────────────────────────────────────────────────────────────

let activeApi: VaultAPI | null = null;

/**
 * Bind a `VaultAPI` to this module. Called by `VaultAPI` on construction.
 */
export function bindVaultApi(api: VaultAPI | null): void {
  activeApi = api;
}

function getApi(): VaultAPI {
  if (!activeApi) {
    throw new Error(
      'vault-periodic: no VaultAPI bound. Construct a VaultAPI (which binds automatically) before calling periodic functions.',
    );
  }
  return activeApi;
}

/**
 * Generate a daily session summary for a god.
 *
 * Reads `06_Activity_Feed/live.jsonl` for events by this god on this date,
 * reads the god's `working-memory.md` for session log entries, aggregates
 * them, renders a Markdown summary, and writes to
 * `01_Gods/<God>/activity/YYYY-MM-DD.md`.
 *
 * @example
 *   await generateDaily('apollo', new Date('2026-07-14'));
 *   // → writes 01_Gods/Apollo/activity/2026-07-14.md
 */
export async function generateDaily(god: string, date: Date = new Date()): Promise<PeriodicNoteResult> {
  return generateDailySummary(getApi(), god, date);
}

/**
 * Generate a weekly session summary for a god.
 *
 * Aggregates the 7 daily summaries for the week (Mon–Sun) containing
 * `weekStart`, computes totals + trends vs the previous week, and writes
 * to `01_Gods/<God>/activity/week-YYYY-MM-DD.md`.
 *
 * @example
 *   await generateWeekly('apollo', new Date('2026-07-14'));
 *   // → writes 01_Gods/Apollo/activity/week-2026-07-13.md (Monday of that week)
 */
export async function generateWeekly(god: string, weekStart: Date = new Date()): Promise<PeriodicNoteResult> {
  return generateWeeklySummary(getApi(), god, weekStart);
}
