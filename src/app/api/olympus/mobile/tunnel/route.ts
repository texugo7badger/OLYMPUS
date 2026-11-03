/**
 * /api/olympus/mobile/tunnel — the remote companion lane.
 *
 * GET  → { ok, ...status }   (running, url, pid, startedAt, binary)
 * POST → { action: 'start' | 'stop' }
 *
 * Auth-gated: the tunnel URL is a public door; starting one is an explicit
 * user action and the bearer token is checked by `requireAuth` in every mode.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { startTunnel, stopTunnel, tunnelStatus } from '@/lib/mobile-tunnel';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  return NextResponse.json({ ok: true, ...tunnelStatus() }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  try {
    if (body?.action === 'start') {
      const status = await startTunnel();
      return NextResponse.json({ ok: true, ...status }, { headers: NO_CACHE_HEADERS });
    }
    if (body?.action === 'stop') {
      const status = stopTunnel();
      return NextResponse.json({ ok: true, ...status }, { headers: NO_CACHE_HEADERS });
    }
    return NextResponse.json({ ok: false, error: "action must be 'start' | 'stop'" }, { status: 400, headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'tunnel failed' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
