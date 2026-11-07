/**
 * /api/olympus/lane-health — v0.0.86: inspect and RETRY a dead model lane.
 *
 * The status-bar chip already said "N dead model lane(s)", but clicking it
 * opened Settings where the table was read-only: the user could see the lane
 * was blocked and had no action. This route is that action.
 *
 *   GET  → { ok, lanes: [{ lane, status, error, retryUntil }], checkedAt }
 *   POST { lane, action: 'retry' } → clears the lane's dead entry (markAlive)
 *        so the next dispatch tries it again. Honest: this is a local health
 *        reset, not a provider-key fix; a lane that is genuinely unkeyed will
 *        be marked dead again by the next dispatch.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { readLaneHealth, blockedLanes, markLaneAlive } from '@/lib/lane-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const health = readLaneHealth();
  const blocked = blockedLanes(health.lanes);
  return NextResponse.json({
    ok: true,
    lanes: blocked.map((l) => ({
      lane: l.lane,
      status: l.status,
      error: l.error ?? null,
      retryUntil: l.retryUntil ?? null,
    })),
    checkedAt: health.updatedAt || null,
  }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const lane = String(body?.lane || '').trim();
  const action = String(body?.action || 'retry');
  if (!lane) return NextResponse.json({ ok: false, error: 'lane is required' }, { status: 400 });
  if (action !== 'retry') return NextResponse.json({ ok: false, error: `unknown action: ${action}` }, { status: 400 });
  markLaneAlive(lane);
  const health = readLaneHealth();
  return NextResponse.json({
    ok: true,
    lane,
    action,
    lanes: blockedLanes(health.lanes).map((l) => ({
      lane: l.lane, status: l.status, error: l.error ?? null, retryUntil: l.retryUntil ?? null,
    })),
  }, { headers: NO_CACHE_HEADERS });
}
