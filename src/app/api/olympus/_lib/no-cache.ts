/**
 * Shared `no-cache` headers for live Olympus API routes.
 * Without Cache-Control: no-store, polling dashboards would see stale data.
 *
 * Usage:
 *   import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
 *
 *   return NextResponse.json(data, { headers: NO_CACHE_HEADERS });
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export const NO_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'Vary': '*',
  // Custom hint so the client can verify it's getting a fresh response.
  'X-Olympus-Cache-Bust': String(Date.now()),
};
