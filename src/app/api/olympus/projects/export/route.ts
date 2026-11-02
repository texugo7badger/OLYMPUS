/**
 * GET /api/olympus/projects/export?slug=<slug> — v0.0.48 (R48-01).
 *
 * Returns the portable project passport: identity, stacks, summary, brief,
 * docs and design memory. No code tree, no absolute home paths.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { exportProjectPassport } from '@/lib/project-passport';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  try {
    const passport = exportProjectPassport(slug);
    return NextResponse.json(passport, {
      headers: {
        ...NO_CACHE_HEADERS,
        'Content-Disposition': `attachment; filename="olympus-${passport.project.slug}.passport.json"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 404, headers: NO_CACHE_HEADERS });
  }
}
