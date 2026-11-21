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
import { pruneHibernationPlan, readHibernationPlan, writeHibernationPlan } from '@/lib/hibernation';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeOptIn } from '@/lib/atlas-warden';
import { startDetachedWalk } from '@/lib/hop-runtime/supervisor';
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  pruneHibernationPlan();
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
  // v0.0.98 — A NIGHT CONTRACT NEEDS A DETACHED WORKER. The renderer is
  // destroyed on hibernate; opt the active lane in and start the detached
  // supervisor so the walk survives the window (idempotent; a live lane lock
  // is respected).
  let night: { slug: string | null; started: boolean; reason?: string } = { slug: null, started: false };
  try {
    const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
    const active = JSON.parse(fs.readFileSync(path.join(home, 'active-project.json'), 'utf-8'));
    const slug = typeof active?.slug === 'string' && active.slug ? active.slug : null;
    if (slug) {
      const laneRoot = path.join(getVaultRoot(), '02_Projects', slug);
      writeOptIn(slug, true);
      const started = startDetachedWalk({ slug, laneRoot, autoResume: true, keepQuarantine: true, retryParkedHop: false });
      night = { slug, started: started.ok, reason: started.ok ? undefined : started.reason };
    }
  } catch { /* the plan is still written; the warden can start later */ }
  return NextResponse.json({ ok: true, plan, night }, { headers: NO_CACHE_HEADERS });
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
