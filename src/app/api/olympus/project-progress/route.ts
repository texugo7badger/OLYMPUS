/**
 * /api/olympus/project-progress — v0.0.64: the honest 0–100%.
 *
 * GET ?slug=aime → overall + per-god + size, computed from the lane's plan and
 * hop state (0 tokens). The studio polls this while it is open; a new prompt
 * changes the plan and the bar recomputes.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/project-context';
import { computeProjectProgress } from '@/lib/project-progress';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;
  const slug = req.nextUrl.searchParams.get('slug') || req.nextUrl.searchParams.get('project') || '';
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  const project = getProject(slug);
  if (!project) return NextResponse.json({ ok: false, error: `project '${slug}' not found` }, { status: 404, headers: NO_CACHE_HEADERS });
  const lane = project.path || '';
  if (!lane) return NextResponse.json({ ok: false, error: 'project has no path' }, { status: 409, headers: NO_CACHE_HEADERS });
  try {
    return NextResponse.json(computeProjectProgress(lane, slug), { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'progress failed' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
