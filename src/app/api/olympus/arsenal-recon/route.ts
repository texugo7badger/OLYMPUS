/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { arsenalRecon, arsenalResonanceByGod, computeTaskSignature } from '@/lib/symphony/arsenal-resolver';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { withTtl } from '@/lib/ttl-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/arsenal-recon?task=<task>&god=<god>
 *
 * Performs a Symphony Arsenal Recon — queries past dispatch outcomes
 * for the best-known arsenal (skills, MCPs, demigods) for this task type.
 *
 * W-D8: with NO task but a god, returns the god's AGGREGATE resonance
 * (arsenalResonanceByGod — the proven arsenal across all dispatch classes;
 * the god-detail panel's visibility half of the feedback loop).
 *
 * Returns:
 *   { taskSignature, god, suggestedSkills, suggestedMcps, suggestedDemigods,
 *     quickCircuit, coherence }
 * — or (no task): { god, dispatches, skills, mcps, demigods }
 */
export async function GET(req: NextRequest) {
  const task = new URL(req.url).searchParams.get('task') || '';
  const god = new URL(req.url).searchParams.get('god') || 'apollo';

  if (!task) {
    const godParam = new URL(req.url).searchParams.get('god');
    if (!godParam) {
      return NextResponse.json({ ok: false, error: 'Missing ?task= (or ?god= for the aggregate)' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    // v0.0.25 — the resonance log grows; the aggregate is cached per god.
    const agg = await withTtl(`arsenal-recon:${god}`, () => arsenalResonanceByGod(god), { ttlMs: 15_000 });
    return NextResponse.json({ ok: true, aggregate: true, ...agg }, { headers: NO_CACHE_HEADERS });
  }

  const result = arsenalRecon(task, god);
  return NextResponse.json({ ok: true, ...result }, { headers: NO_CACHE_HEADERS });
}
