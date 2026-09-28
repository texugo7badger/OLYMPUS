/**
 * Olympus Vault Periodic — Next.js API Route Handler
 * ======================================================
 *
 * Portable route handler for `POST /api/vault/periodic/{daily,weekly}`.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { VaultAPI } from '../vault';
import { generateDailySummary, generateWeeklySummary } from './generator';

/**
 * Handle a POST request to `/api/vault/periodic/{daily,weekly}`.
 *
 * Routes:
 *   POST /api/vault/periodic/daily   { god: string, date?: string }
 *     → { path, content, size }
 *   POST /api/vault/periodic/weekly  { god: string, weekStart?: string }
 *     → { path, content, size }
 *
 * `date` defaults to today (UTC). `weekStart` defaults to today; the Monday
 * of that week is used as the canonical start.
 */
export async function handleVaultPeriodicRoute(
  api: VaultAPI,
  request: { method: string; url: string; body: unknown },
): Promise<{ status: number; body: unknown }> {
  if (request.method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed — use POST' } };
  }

  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname.replace(/\/$/, '').toLowerCase();
  const body = (request.body || {}) as Record<string, unknown>;

  const god = body.god as string;
  if (!god) {
    return { status: 400, body: { error: 'god is required' } };
  }

  try {
    if (path.endsWith('/daily')) {
      const date = body.date ? new Date(body.date as string) : new Date();
      if (Number.isNaN(date.getTime())) {
        return { status: 400, body: { error: `Invalid date: ${body.date}` } };
      }
      const result = await generateDailySummary(api, god, date);
      return { status: 200, body: result };
    }
    if (path.endsWith('/weekly')) {
      const weekStart = body.weekStart ? new Date(body.weekStart as string) : new Date();
      if (Number.isNaN(weekStart.getTime())) {
        return { status: 400, body: { error: `Invalid weekStart: ${body.weekStart}` } };
      }
      const result = await generateWeeklySummary(api, god, weekStart);
      return { status: 200, body: result };
    }
    return { status: 404, body: { error: `Unknown periodic route: ${path}` } };
  } catch (err) {
    return { status: 500, body: { error: (err as Error).message } };
  }
}
