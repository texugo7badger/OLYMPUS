/**
 * /api/olympus/portfolio — v0.0.98-16.
 *
 * One bounded read for the multi-project dashboard. No process is started;
 * the metrics come from the lane's own plan/state/telemetry/profile files.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { buildPortfolio } from '@/lib/portfolio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = requireReadAuth(req as any);
  if (denied) return denied;
  return NextResponse.json(buildPortfolio(), { headers: NO_CACHE_HEADERS });
}
