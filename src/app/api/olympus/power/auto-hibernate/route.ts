/**
 * /api/olympus/power/auto-hibernate — v0.0.32.
 *
 * GET  → { ok, prefs }
 * POST { autoHibernateOnLock: boolean } → persist
 *
 * The Electron main reads the same file on lock-screen and hibernates when
 * enabled, so the campaign keeps running while the screen is away.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse, NextRequest } from 'next/server';
import { normalizePowerPrefs, readPowerPrefs, writePowerPrefs } from '@/lib/power-prefs';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, prefs: readPowerPrefs() }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const prefs = normalizePowerPrefs({ ...readPowerPrefs(), ...body });
  if (!writePowerPrefs(prefs)) {
    return NextResponse.json({ ok: false, error: 'could not persist' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, prefs }, { headers: NO_CACHE_HEADERS });
}
