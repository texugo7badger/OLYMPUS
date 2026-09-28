/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { getShortCircuitStats } from '@/lib/shortcircuit-telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/shortcircuit-stats
 *
 * Returns aggregate short-circuit telemetry from
 * ~/OLYMPUS-VAULT/05_Auto_Learning/shortcircuit-log.jsonl. Polled by the God
 * Intelligence Dashboard's "Short-Circuit Health" widget every 30 seconds.
 *
 * Query params:
 *   ?maxLines=<n>  Cap the number of log lines to read (default: 100,000).
 *                  Set to 0 to read the whole file.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const maxLinesParam = url.searchParams.get('maxLines');
    const maxLines = maxLinesParam ? parseInt(maxLinesParam, 10) : 100_000;
    const stats = getShortCircuitStats(Number.isFinite(maxLines) ? maxLines : 100_000);
    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Vary': '*',
        'X-Olympus-Shortcircuit-Refresh': '30s',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
