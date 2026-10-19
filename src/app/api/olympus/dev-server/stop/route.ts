/**
 * POST /api/olympus/dev-server/stop — #100 (v0.0.6 MISSION-CONTROL-TRUE):
 * the durable host's stop. The manager owns the process tree (pid + group);
 * the panel (and any surface) can stop the managed server cleanly. The
 * response carries the honest outcome — never a silent corpse.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { stop as managerStop } from '@/lib/dev-server-manager';
import { getActiveProjectSlug } from '@/lib/project-context';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug = (typeof body?.slug === 'string' && body.slug) || getActiveProjectSlug();
    if (!slug) {
      return NextResponse.json({ ok: false, error: 'No active project to stop.' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const result = await managerStop(slug);
    return NextResponse.json({ ok: result.ok, slug, result }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
