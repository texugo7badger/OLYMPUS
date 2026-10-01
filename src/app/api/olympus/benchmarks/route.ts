/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getBenchmarkStats,
  loadBenchmarkConfig,
  saveBenchmarkConfig,
  type BenchmarkConfig,
} from '@/lib/benchmarks';
import { flushBenchmarkWindows } from '@/lib/opencode-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/benchmarks
 *
 * Returns aggregate benchmark stats from
 * ~/OLYMPUS-VAULT/07_Reviews/benchmarks/dispatches.jsonl + the current
 * recording config. Polled by the Benchmarks panel every 30 seconds.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const maxLinesParam = url.searchParams.get('maxLines');
    const maxLines = maxLinesParam ? parseInt(maxLinesParam, 10) : 100_000;
    const stats = getBenchmarkStats(Number.isFinite(maxLines) ? maxLines : 100_000);
    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Vary': '*',
        'X-Olympus-Benchmarks-Refresh': '30s',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/olympus/benchmarks
 *
 * Body: { recordingEnabled?: boolean, sessionLabel?: string }
 * Updates the benchmark recording config at ~/.olympus/benchmark-config.json.
 * Returns the new config.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const current = loadBenchmarkConfig();
    const updated: BenchmarkConfig = {
      recordingEnabled: typeof body.recordingEnabled === 'boolean' ? body.recordingEnabled : current.recordingEnabled,
      sessionLabel: typeof body.sessionLabel === 'string' ? (body.sessionLabel.trim() || undefined) : current.sessionLabel,
    };
    // Toggle-off must land the in-flight conversation's counters rather than
    // discarding them (R-D).
    //
    // ORDER MATTERS: flushBenchmarkAccumulator (opencode-session.ts:834)
    // re-reads the config via loadBenchmarkConfig() — a fresh synchronous disk
    // read (benchmarks.ts:102) — and DELETES the accumulator without writing
    // when recording is off. Since saveBenchmarkConfig is a synchronous
    // writeFileSync (benchmarks.ts:117), flushing after the save would always
    // observe OFF and silently drop the window. Flush first, while the config
    // on disk still says ON, then persist OFF.
    const turnedOff = current.recordingEnabled && !updated.recordingEnabled;
    if (turnedOff) {
      try {
        flushBenchmarkWindows();
      } catch {}
    }
    saveBenchmarkConfig(updated);
    return NextResponse.json({ ok: true, config: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
