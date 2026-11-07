/**
 * /api/olympus/walk/plan — v0.0.88: inspect/apply the staged generation.
 *
 * GET  ?slug=aime → current generation, frozen snapshot, next-plan diff
 * POST { slug, action: 'apply' | 'discard' }
 *
 * Apply is REFUSED while a walk holds the lane: a generation advances only at
 * a hop boundary. The refusal names the live pid and the safe action.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { getVaultRoot } from '@/lib/vault-root';
import { readWalkLock } from '@/lib/hop-runtime/walk-lock';
import { readFrozenPlan, readNextPlan, readPlanFile, planPath, applyNextPlan, discardNextPlan, diffPlans } from '@/lib/hop-runtime/plan-generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function laneFor(slug: string): string | null {
  const safe = String(slug || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return null;
  const lane = path.join(getVaultRoot(), '02_Projects', safe);
  return fs.existsSync(lane) ? lane : null;
}

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const lane = laneFor(String(req.nextUrl.searchParams.get('slug') || ''));
  if (!lane) return NextResponse.json({ ok: false, error: 'no lane' }, { status: 404 });
  const frozen = readFrozenPlan(lane);
  const current = readPlanFile(planPath(lane));
  const next = readNextPlan(lane);
  return NextResponse.json({
    ok: true,
    generation: frozen?.generation ?? current?.generation ?? null,
    total: (frozen ?? current)?.hops?.length ?? 0,
    frozen: Boolean(frozen),
    next: next.plan ? { generation: next.plan.generation ?? null, diff: next.diff, hops: next.plan.hops.length } : null,
    ...(frozen && current ? { currentVsFrozen: diffPlans(frozen, current) } : {}),
  }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const lane = laneFor(String(body?.slug || ''));
  if (!lane) return NextResponse.json({ ok: false, error: 'no lane' }, { status: 404 });
  const action = String(body?.action || 'apply');
  if (action !== 'apply' && action !== 'discard') {
    return NextResponse.json({ ok: false, error: `unknown action: ${action}` }, { status: 400 });
  }
  const lock = readWalkLock(lane);
  if (lock.holder && lock.alive) {
    return NextResponse.json({
      ok: false, error: 'a walk is live on this lane — a generation applies only at a hop boundary',
      pid: lock.holder.pid, action,
    }, { status: 409 });
  }
  if (action === 'discard') return NextResponse.json({ ok: true, discarded: discardNextPlan(lane) }, { headers: NO_CACHE_HEADERS });
  const applied = applyNextPlan(lane);
  return NextResponse.json({ ok: applied.applied, ...applied }, { headers: NO_CACHE_HEADERS });
}
