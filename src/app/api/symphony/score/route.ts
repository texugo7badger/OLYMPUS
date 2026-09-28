/**
 * ════════════════════════════════════════════════════════════════════════════
 *  GET /api/symphony/score
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The Master Score endpoint. Returns a snapshot of the Vault's resonance
 *  registry — recent entries, harmonic templates, aggregate metrics.
 *
 *  This is the dashboard's data source. The UI renders the Symphony's
 *  "sheet music" view from this snapshot.
 *
 *  Query params:
 *    ?limit=50        — max recent entries (default 50)
 *    ?kind=signature-source — filter by entry kind
 *    ?godId=apollo    — filter by god/demigod ID
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  readRecentEntries,
  readMetrics,
  listTemplates,
  templateStats,
  REGISTRY_PATHS,
  type ResonanceKind,
} from '@/lib/symphony';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const kind = url.searchParams.get('kind') as ResonanceKind | null;
    const godId = url.searchParams.get('godId') ?? undefined;

    const recentEntries = readRecentEntries({
      kind: kind ?? undefined,
      godId,
      limit,
    });
    const metrics = readMetrics();
    const templates = listTemplates();
    const tStats = templateStats();

    return NextResponse.json({
      ok: true,
      protocol: 'symphony/1.0',
      vaultRoot: REGISTRY_PATHS.vaultRoot,
      metrics,
      templateStats: tStats,
      recentEntries,
      templates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
