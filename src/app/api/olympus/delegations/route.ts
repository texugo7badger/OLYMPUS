/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GODS = ['apollo', 'hephaestus', 'athena', 'hermes', 'artemis', 'dionysus', 'persephone', 'prometheus'];

/**
 * GET /api/olympus/delegations
 * Returns god-to-god delegation frequency matrix + recent delegation events.
 *
 * v0.0.1: Returns empty arrays with a `note` field. Real delegation data will
 * be read from `~/OLYMPUS-VAULT/06_Activity_Feed/live.jsonl` (filter
 * `action: 'delegation'`) once the activity feed has real events. This is
 * consistent with the v0.0.1 "no fake data" discipline (same approach as
 * activity, episodes, costs routes).
 *
 * The matrix is pre-seeded with zero counts for every from→to pair so the
 * UI's delegation chart renders an empty grid rather than NaN.
 */
export async function GET() {
  // Pre-seed the matrix with zeros so the UI's chart can render axes + grid.
  const matrix: Record<string, Record<string, number>> = {};
  for (const from of GODS) {
    matrix[from] = {};
    for (const to of GODS) {
      matrix[from][to] = 0;
    }
  }

  return NextResponse.json({
    matrix,
    events: [],
    note: 'No real delegation data yet. Delegation events will appear here once Apollo starts dispatching to specialist gods.',
    totalDelegations: 0,
    timespan: 'last-30d',
  });
}
