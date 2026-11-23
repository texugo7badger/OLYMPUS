/**
 * /api/olympus/delivery-profile — v0.0.98-15.
 *
 * GET  ?slug=aime → current profile, definitions, plan check, live state
 * POST { slug, profile } → select a profile for the lane
 *
 * The selection is read at the walk boundary. A live walk keeps its profile;
 * the next walk uses the new one. The route never rewrites the plan.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from '@/lib/vault-root';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { readWalkLock } from '@/lib/hop-runtime/walk-lock';
import { readFrozenPlan, readPlanFile, planPath } from '@/lib/hop-runtime/plan-generation';
import { DELIVERY_PROFILES, DELIVERY_PROFILE_IDS, isDeliveryProfileId, profilePlanCheck, resolveProfile } from '@/lib/delivery-profiles';
import { laneProfileState, writeDeliveryProfile } from '@/lib/delivery-profile-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function laneFor(slug: string): string | null {
  const safe = String(slug || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return null;
  const lane = path.join(getVaultRoot(), '02_Projects', safe);
  return fs.existsSync(lane) ? lane : null;
}

function stateFor(lane: string) {
  const plan = readFrozenPlan(lane) ?? readPlanFile(planPath(lane));
  const state = laneProfileState(lane, plan);
  const check = state.id ? profilePlanCheck(plan, state.id) : null;
  const lock = readWalkLock(lane);
  return {
    ok: true,
    profiles: DELIVERY_PROFILE_IDS.map((id) => DELIVERY_PROFILES[id]),
    current: state.id,
    source: (plan as any)?.profile ? 'plan' : state.file ? 'lane' : null,
    selectedAt: state.file?.updatedAt ?? null,
    updatedBy: state.file?.updatedBy ?? null,
    planHops: Array.isArray(plan?.hops) ? plan.hops.length : 0,
    check,
    liveWalk: Boolean(lock.holder && lock.alive),
    budgetMinutes: state.profile ? Math.round(state.profile.budgetMs / 60_000) : null,
    doD: state.profile?.doD ?? [],
  };
}

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const lane = laneFor(String(req.nextUrl.searchParams.get('slug') || ''));
  if (!lane) return NextResponse.json({ ok: false, error: 'no lane' }, { status: 404 });
  return NextResponse.json(stateFor(lane), { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const lane = laneFor(String(body?.slug || ''));
  if (!lane) return NextResponse.json({ ok: false, error: 'no lane' }, { status: 404 });
  const profile = body?.profile;
  if (!isDeliveryProfileId(profile)) {
    return NextResponse.json({ ok: false, error: `profile must be one of ${DELIVERY_PROFILE_IDS.join(', ')}` }, { status: 400 });
  }
  const lock = readWalkLock(lane);
  if (lock.holder && lock.alive) {
    return NextResponse.json({
      ok: false, error: 'a walk is live on this lane — the profile applies at the next walk boundary',
      pid: lock.holder.pid,
    }, { status: 409 });
  }
  writeDeliveryProfile(lane, profile, 'user');
  const next = stateFor(lane);
  const chosen = resolveProfile(profile);
  return NextResponse.json({
    ...next,
    ok: true,
    saved: true,
    message: `${chosen.label} selected — max ${chosen.maxHops} hops, ${Math.round(chosen.budgetMs / 60_000)} min, design ${chosen.designScore || '—'}.`,
  }, { headers: NO_CACHE_HEADERS });
}
