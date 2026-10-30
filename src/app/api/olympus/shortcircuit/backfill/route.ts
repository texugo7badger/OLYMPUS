/**
 * POST /api/olympus/shortcircuit/backfill — ground `tokens_saved` (v0.0.26).
 *
 * Runs the measured backfill (median demigod input per god) and returns the
 * rows it wrote. GET previews without writing.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { backfillShortCircuitSavings, computeBaselines } from '@/lib/shortcircuit-savings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      ...backfillShortCircuitSavings({ dryRun: true }),
      baselines: computeBaselines(),
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const windowDays = Number(body?.windowDays) > 0 ? Number(body.windowDays) : undefined;
    const result = backfillShortCircuitSavings({ windowDays });
    return NextResponse.json({
      ok: true,
      dryRun: false,
      ...result,
      note: result.backfilled > 0
        ? `Grounded ${result.backfilled} short-circuit row(s) from measured demigod baselines.`
        : 'No short-circuit row has a baseline yet (need >=3 attributed demigod turns for the god).',
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
