/**
 * /api/olympus/briefing — v0.0.85: the phone's read-only project document.
 *
 * GET ?slug=aime → the deterministic briefing the companion speaks and the
 * widget renders: plan progress, current hops, the last parked hop, recent
 * settled hops and what comes next. No LLM, no tokens, no write of any kind.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { computeProjectBriefing } from '@/lib/project-briefing';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;
  const slug = req.nextUrl.searchParams.get('slug') || req.nextUrl.searchParams.get('project');
  try {
    const briefing = computeProjectBriefing(slug);
    return NextResponse.json(briefing, {
      status: briefing.ok ? 200 : 404,
      headers: NO_CACHE_HEADERS,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'briefing failed' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
