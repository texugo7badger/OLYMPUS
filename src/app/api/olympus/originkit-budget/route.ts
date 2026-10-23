/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * GET  /api/olympus/originkit-budget  — the free-tier fetch budget (read).
 * POST /api/olympus/originkit-budget  — consume one fetch (honest refusal
 *                                       at 0; the runtime gate uses the
 *                                       same module).
 *
 * #198: the free OriginKit key allows 10 fetches/day; the References tab and
 * the [OLYMPUS-DESIGN] marker surface "N fetches left today" so an
 * exhaustion is never mistaken for a broken references lane.
 */

import { NextResponse } from 'next/server';
import { consumeOriginkitFetch, readOriginkitBudget } from '@/lib/originkit-budget';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, budget: readOriginkitBudget() }, { headers: NO_CACHE_HEADERS });
}

export async function POST() {
  const result = consumeOriginkitFetch();
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, budget: result.budget },
      { status: 429, headers: NO_CACHE_HEADERS },
    );
  }
  return NextResponse.json({ ok: true, budget: result.budget }, { headers: NO_CACHE_HEADERS });
}
