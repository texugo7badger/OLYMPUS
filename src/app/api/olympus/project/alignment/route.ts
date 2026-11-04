/**
 * GET /api/olympus/project/alignment — v0.0.80: the explainable alignment score.
 *
 * Returns the five signals with their evidence, the score and `ready`. The UI
 * shows the score AND what is missing — a preview is only generated when the
 * project is clear enough (and the user asks).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { computeAlignment } from '@/lib/alignment';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const slug = req.nextUrl.searchParams.get('project') || '';
  if (!slug) return NextResponse.json({ ok: false, error: 'project is required' }, { status: 400 });
  const alignment = computeAlignment(slug);
  if (!alignment) return NextResponse.json({ ok: false, error: `project not found: ${slug}` }, { status: 404 });
  return NextResponse.json({ ok: true, alignment }, { headers: NO_CACHE_HEADERS });
}
