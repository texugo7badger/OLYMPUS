/**
 * /api/olympus/mcp/quarantine — v0.0.67 (#283): the broken-server memory.
 *
 * GET    → { servers: QuarantineEntry[] }
 * POST   { name, reason? } → quarantine now (manual)
 * DELETE ?name=...        → clear (revive) a quarantined server
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { listQuarantine, quarantine, clearQuarantine } from '@/lib/mcp-quarantine';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;
  return NextResponse.json({ ok: true, servers: listQuarantine() }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch { /* invalid */ }
  const name = String(body?.name || '').trim();
  if (!name) return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  const entry = quarantine(name, String(body?.reason || 'manual quarantine'), 2);
  return NextResponse.json({ ok: true, entry, servers: listQuarantine() }, { headers: NO_CACHE_HEADERS });
}

export async function DELETE(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  const name = req.nextUrl.searchParams.get('name') || '';
  if (!name) return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  return NextResponse.json({ ok: clearQuarantine(name), servers: listQuarantine() }, { headers: NO_CACHE_HEADERS });
}
