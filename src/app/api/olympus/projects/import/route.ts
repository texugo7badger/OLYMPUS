/**
 * POST /api/olympus/projects/import — v0.0.48 (R48-01).
 *
 * Imports a project passport as a NEW lane at 02_Projects/<slug>. It never
 * overwrites an existing project; design memory is copied to the new slug.
 *
 * Body: the passport JSON.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { importProjectPassport } from '@/lib/project-passport';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const result = importProjectPassport(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_CACHE_HEADERS });
}
