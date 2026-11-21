/**
 * GET /api/olympus/logs — v0.0.98: the Logs workspace's one read.
 *
 * Server-side slice + aggregates from the hop telemetry, cost, recovery,
 * resonance, burn and hop-state evidence. Cached 10s; never scans the 57k
 * ledger on the request path (the cost file is tailed and cached by mtime).
 *
 * Query: ?lane=<slug> (optional) — the UI filters the payload client-side.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { withTtl } from '@/lib/ttl-cache';
import { buildLogsPayload } from '@/lib/logs-index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const lane = String(req.nextUrl.searchParams.get('lane') || '').trim();
  const payload = await withTtl('logs-payload', () => buildLogsPayload(), { ttlMs: 10_000 });
  if (!lane) return NextResponse.json(payload, { headers: NO_CACHE_HEADERS });
  return NextResponse.json({
    ...payload,
    hops: payload.hops.filter((h) => h.slug === lane),
    walks: payload.walks.filter((w) => w.slug === lane),
  }, { headers: NO_CACHE_HEADERS });
}
