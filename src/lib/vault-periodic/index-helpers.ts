/**
 * Olympus Vault Periodic — Path Helpers
 * =======================================
 *
 * Pure path-derivation logic for daily / weekly note paths. No IO.
 *
 * These helpers were already implemented in the v1 stub (and their
 * signatures must not change). They live in this separate file to avoid
 * a circular import between `index.ts` (the public API) and
 * `generator.ts` (the implementation).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/** Normalize a god name to Olympus path convention (Capitalized). */
function capitalizeGod(god: string): string {
  return god.charAt(0).toUpperCase() + god.slice(1).toLowerCase();
}

/** Format a Date as YYYY-MM-DD (UTC, to avoid TZ drift). */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Get the daily note path for a god + date (no IO — pure path logic).
 * Useful for routers that want to link to today's note without generating it.
 *
 * @example
 *   getDailyNotePath('apollo', new Date('2026-07-14'))
 *   // → '01_Gods/Apollo/activity/2026-07-14.md'
 */
export function getDailyNotePath(god: string, date: Date): string {
  const godName = capitalizeGod(god);
  const ds = toDateString(date);
  return `01_Gods/${godName}/activity/${ds}.md`;
}

/**
 * Get the weekly note path for a god + week-start date.
 *
 * @example
 *   getWeeklyNotePath('apollo', new Date('2026-07-13'))
 *   // → '01_Gods/Apollo/activity/week-2026-07-13.md'
 */
export function getWeeklyNotePath(god: string, weekStart: Date): string {
  const godName = capitalizeGod(god);
  const ds = toDateString(weekStart);
  return `01_Gods/${godName}/activity/week-${ds}.md`;
}
