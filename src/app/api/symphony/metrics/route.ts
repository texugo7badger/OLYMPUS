/**
 * ════════════════════════════════════════════════════════════════════════════
 *  GET /api/symphony/metrics
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Lightweight metrics endpoint for the cost dashboard. Returns just the
 *  SymphonyMetrics + templateStats — no entry list. Used for polling.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import {
  readMetrics,
  templateStats,
  choirHealth,
  REFERENCE_GAINS,
  SYMPHONY_TARGET_BAND,
} from '@/lib/symphony';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const metrics = readMetrics();
    const tStats = templateStats();
    const choir = choirHealth();

    return NextResponse.json({
      ok: true,
      protocol: 'symphony/1.0',
      metrics,
      templateStats: tStats,
      choir,
      referenceGains: REFERENCE_GAINS,
      targetBand: SYMPHONY_TARGET_BAND,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
