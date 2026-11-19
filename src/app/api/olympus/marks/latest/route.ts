/**
 * /api/olympus/marks/latest — v0.0.94: the latest durable Apollo mark plan.
 * GET ?slug=aime&target=apollo
 *
 * Lets a freshly opened preview window restore the plan/error of the last
 * batch instead of losing it with the previous React state.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { latestBatch } from '@/lib/marks-plan';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;
  const slug = String(req.nextUrl.searchParams.get('slug') || '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  const target = req.nextUrl.searchParams.get('target') === 'athena' ? 'athena' : 'apollo';
  const view = latestBatch(slug, target);
  return NextResponse.json({ ok: true, batch: view }, { headers: NO_CACHE_HEADERS });
}
