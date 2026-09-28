/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { arsenalRecon, computeTaskSignature } from '@/lib/symphony/arsenal-resolver';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/arsenal-recon?task=<task>&god=<god>
 *
 * Performs a Symphony Arsenal Recon — queries past dispatch outcomes
 * for the best-known arsenal (skills, MCPs, demigods) for this task type.
 *
 * Returns:
 *   {
 *     taskSignature: string,
 *     god: string,
 *     suggestedSkills: [{ skill, confidence, samples }],
 *     suggestedMcps: [{ mcp, confidence, samples }],
 *     suggestedDemigods: [{ demigod, confidence, samples }],
 *     quickCircuit: boolean,
 *     coherence: number
 *   }
 */
export async function GET(req: NextRequest) {
  const task = new URL(req.url).searchParams.get('task') || '';
  const god = new URL(req.url).searchParams.get('god') || 'apollo';

  if (!task) {
    return NextResponse.json({ ok: false, error: 'Missing ?task=' }, { status: 400, headers: NO_CACHE_HEADERS });
  }

  const result = arsenalRecon(task, god);
  return NextResponse.json({ ok: true, ...result }, { headers: NO_CACHE_HEADERS });
}
