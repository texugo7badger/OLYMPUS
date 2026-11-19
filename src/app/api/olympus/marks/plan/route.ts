/**
 * /api/olympus/marks/plan — v0.0.94: poll a durable mark-batch plan.
 * GET ?inboxId=…&target=apollo|athena
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { planFor } from '@/lib/marks-plan';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;
  const inboxId = String(req.nextUrl.searchParams.get('inboxId') || '').trim();
  if (!inboxId) return NextResponse.json({ ok: false, error: 'inboxId is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  const target = req.nextUrl.searchParams.get('target');
  const view = planFor(inboxId, target === 'athena' ? 'athena' : target === 'apollo' ? 'apollo' : null);
  if (!view) return NextResponse.json({ ok: false, error: 'batch not found' }, { status: 404, headers: NO_CACHE_HEADERS });
  return NextResponse.json({ ok: true, ...view }, { headers: NO_CACHE_HEADERS });
}
