/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTtl } from '@/lib/ttl-cache';
import { costSummary } from '@/lib/olympus';
import { loadBenchmarkConfig } from '@/lib/benchmarks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/costs
 *
 * Returns ALL ZEROS on first load (no real telemetry). The
 * costSummary() in lib/olympus.ts reads ~/.olympus/metrics/cost.jsonl
 * — if the file doesn't exist (or is empty), every god shows $0.00 / 0
 * requests. NO fake budget display.
 *
 * Real-time cost updates:
 *   - `Cache-Control: no-store, max-age=0` so the browser NEVER caches
 *     this endpoint. Without it, the dashboard's 10s poll showed stale
 *     data because the browser served the previous response from cache.
 *   - `Vary: *` so any client-side cache proxy revalidates on every request.
 *   - The dashboard client also passes `cache: 'no-store'` on its fetch.
 */
export async function GET(req: NextRequest) {
  // v0.0.32 — a benchmark session boundary filters the aggregate; a "new
  // session" starts from zero without deleting the lifetime ledger.
  const cfg = loadBenchmarkConfig();
  const windowId = req.nextUrl.searchParams.get('window') || 'session';
  const now = Date.now();
  const WINDOW_MS: Record<string, number> = { '5h': 5 * 3600_000, '24h': 24 * 3600_000, '7d': 7 * 24 * 3600_000, '30d': 30 * 24 * 3600_000 };
  // v0.0.53 — a real cost window. `session` keeps the benchmark boundary;
  // the rolling windows are host-clock based and never pretend to know the
  // provider invoice (cap5h stays null unless the provider reports it).
  const sinceMs = windowId === 'session'
    ? (cfg.sessionStartedAt ? Date.parse(cfg.sessionStartedAt) : 0)
    : windowId === 'all' ? 0 : now - (WINDOW_MS[windowId] ?? WINDOW_MS['5h']);
  // v0.0.25 — the status bar polls this every 10s; a 5s cache absorbs the
  // pane-open burst without serving the UI a stale minute.
  const body = await withTtl(`costs:${windowId}:${Number.isFinite(sinceMs) ? sinceMs : 0}`, () => costSummary({ sinceMs }), { ttlMs: 5_000 });
  return NextResponse.json({
    ...body,
    window: { id: windowId, sinceMs, now, label: windowId },
    ...(cfg.sessionStartedAt ? { session: { label: cfg.sessionLabel ?? null, startedAt: cfg.sessionStartedAt } } : {}),
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'Vary': '*',
      'X-Olympus-Cost-Refresh': '10s',
    },
  });
}
