/**
 * GET /api/olympus/tasks — the TASK SHEET route (v0.0.4 W1; W-D2+D3 the
 * v0.0.6 premium pass). A thin shell: the join lives in
 * src/lib/tasks-sheet.ts (buildTasksSheet) so a fixture lane can test the
 * running-hop ground truth (inFlight) + the whole-project projection.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse, NextRequest } from 'next/server';
import { buildTasksSheet } from '@/lib/tasks-sheet';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const lane = req.nextUrl.searchParams.get('lane');
  return NextResponse.json(buildTasksSheet({ lane }), { headers: NO_CACHE_HEADERS });
}
