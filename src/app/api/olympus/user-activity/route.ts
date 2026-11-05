/**
 * POST /api/olympus/user-activity — v0.0.83: extend the user lane lease.
 *
 * Body { ms?: number }. GET returns the current lease (debug/UX).
 * The hop walker reads the same file and holds NEW hops while the lease lives.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { markUserActivity, userActivityUntil, userIsActive } from '@/lib/user-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true, active: userIsActive(), until: userActivityUntil() }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const ms = Number(body?.ms);
  markUserActivity(Number.isFinite(ms) ? ms : 60_000);
  return NextResponse.json({ ok: true, active: true, until: userActivityUntil() }, { headers: NO_CACHE_HEADERS });
}
