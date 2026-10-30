/**
 * GET /api/olympus/hops — the live hop snapshot (v0.0.24, #227).
 *
 * Poll fallback for the God Intelligence panel; the SSE route
 * (/api/olympus/hops/stream) is the primary lane.
 *
 * Query: since=<ISO ts>, limit=1..500.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { readHopEvents } from '@/lib/hop-runtime/hop-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get('since');
  const limitRaw = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '200', 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 200;
  try {
    const page = readHopEvents({ since, limit });
    const inFlight = new Map<string, any>();
    for (const ev of page.events) {
      if (!ev.hop) continue;
      if (ev.type === 'hop_start') inFlight.set(ev.hop, ev);
      else if (ev.type === 'hop_done' || ev.type === 'hop_parked') inFlight.delete(ev.hop);
    }
    const lastCampaign = [...page.events].reverse().find((e) => e.type === 'campaign_start' || e.type === 'campaign_end') ?? null;
    return NextResponse.json({
      ok: true,
      events: page.events,
      total: page.total,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      inFlight: [...inFlight.values()],
      campaign: lastCampaign,
      serverTime: new Date().toISOString(),
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
