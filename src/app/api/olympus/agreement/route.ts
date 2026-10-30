/**
 * GET /api/olympus/agreement — classifier ↔ dispatch agreement over time
 * (v0.0.26). POST runs a fresh window and appends it (the heartbeat does this
 * automatically; the button is for on-demand).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { readAgreementSeries, recordAgreementWindow } from '@/lib/agreement-metric';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const limit = Number(new URL(req.url).searchParams.get('limit')) || 200;
    const rows = readAgreementSeries({ limit });
    const latest = rows[rows.length - 1] ?? null;
    const rated = rows.filter((r) => typeof r.summary?.agreement_rate === 'number');
    const avg = rated.length
      ? rated.reduce((n, r) => n + (r.summary.agreement_rate as number), 0) / rated.length
      : null;
    return NextResponse.json({
      ok: true,
      rows,
      latest,
      windows: rows.length,
      average_agreement: avg === null ? null : Math.round(avg * 1000) / 1000,
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const windowMin = Number(body?.windowMin) > 0 ? Number(body.windowMin) : 60;
    const row = await recordAgreementWindow({ windowMin });
    if (!row) {
      return NextResponse.json({ ok: false, error: 'the agreement metric could not run (script or feed missing)' }, { status: 500, headers: NO_CACHE_HEADERS });
    }
    return NextResponse.json({ ok: true, row }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
