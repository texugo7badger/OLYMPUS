/**
 * /api/olympus/hygiene — v0.0.99: the release gate as a read model.
 *
 * Reads public/hygiene.json (written by `npm run hygiene`) and returns the
 * last measured gate results. It never runs tsc/lint in a request.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const file = path.join(process.cwd(), 'public', 'hygiene.json');
    const raw = fs.readFileSync(file, 'utf-8');
    return NextResponse.json(JSON.parse(raw), { headers: NO_CACHE_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: 'no hygiene report yet — run npm run hygiene' }, { status: 404, headers: NO_CACHE_HEADERS });
  }
}
