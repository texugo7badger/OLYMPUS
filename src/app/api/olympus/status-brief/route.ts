/**
 * /api/olympus/status-brief — v0.1.0: one honest "where is my project?" read.
 * GET ?project=aime
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { buildStatusBrief } from '@/lib/status-brief';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const slug = req.nextUrl.searchParams.get('project') || req.nextUrl.searchParams.get('slug');
  try {
    return NextResponse.json({ ok: true, brief: buildStatusBrief(slug) }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'status brief failed' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
