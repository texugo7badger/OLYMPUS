/**
 * /api/olympus/mobile/presence — the companion heartbeat (v0.0.99).
 *
 * GET  → { ok, connected, lastSeen, userAgent, page, tokenMatches }
 * POST → records a beacon for the authenticated token
 *
 * Auth-gated: the phone already sends x-olympus-token; the desktop's pairing
 * card reads over loopback (or its bearer token in LAN mode).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { readPresence, touchPresence, tokenFingerprint, presenceFresh } from '@/lib/mobile-presence';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requestToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer || req.headers.get('x-olympus-token') || null;
}

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;
  const presence = readPresence();
  const token = requestToken(req);
  const expected = tokenFingerprint(token);
  return NextResponse.json({
    ok: true,
    connected: presenceFresh(),
    lastSeen: presence.lastSeen,
    userAgent: presence.userAgent,
    page: presence.page,
    tokenMatches: Boolean(expected && expected === presence.fingerprint),
  }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const presence = touchPresence({
    token: requestToken(req),
    userAgent: req.headers.get('user-agent'),
    page: body?.page,
  });
  return NextResponse.json({
    ok: true,
    connected: true,
    lastSeen: presence.lastSeen,
  }, { headers: NO_CACHE_HEADERS });
}
