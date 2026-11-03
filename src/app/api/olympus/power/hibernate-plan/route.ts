/**
 * /api/olympus/power/hibernate-plan — v0.0.54.
 *
 * The user's explicit night authorization: "you may work alone for N hours,
 * auto-resuming parks". The walker reads this file; 0 hours means no plan.
 * GET → current plan; POST { hours, autoResume } → write; DELETE → clear.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { readHibernationPlan, writeHibernationPlan } from '@/lib/hibernation';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, plan: readHibernationPlan() }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const hours = Number(body?.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return NextResponse.json({ ok: false, error: 'hours must be between 0.25 and 24' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const plan = writeHibernationPlan({ hours, autoResume: body?.autoResume !== false });
  return NextResponse.json({ ok: true, plan }, { headers: NO_CACHE_HEADERS });
}

export async function DELETE() {
  try {
    const { hibernationPlanPath } = await import('@/lib/hibernation');
    const fs = await import('node:fs');
    try { fs.unlinkSync(hibernationPlanPath()); } catch { /* absent */ }
    return NextResponse.json({ ok: true, plan: null }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
