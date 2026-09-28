/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { costSummary } from '@/lib/olympus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/costs
 *
 * Returns ALL ZEROS on first load (no real telemetry). The
 * costSummary() in lib/olympus.ts reads ~/.olympus/metrics/cost.jsonl
 * — if the file doesn't exist (or is empty), every god shows $0.00 / 0
 * requests. NO fake budget display.
 *
 * Real-time cost updates:
 *   - `Cache-Control: no-store, max-age=0` so the browser NEVER caches
 *     this endpoint. Without it, the dashboard's 10s poll showed stale
 *     data because the browser served the previous response from cache.
 *   - `Vary: *` so any client-side cache proxy revalidates on every request.
 *   - The dashboard client also passes `cache: 'no-store'` on its fetch.
 */
export async function GET() {
  const body = costSummary();
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'Vary': '*',
      'X-Olympus-Cost-Refresh': '10s',
    },
  });
}
