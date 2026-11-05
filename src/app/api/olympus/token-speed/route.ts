/**
 * GET /api/olympus/token-speed — v0.0.81: measured output tok/s.
 *
 * `last`   the latest assistant turn (generation window, TTFT);
 * `byModel`  p50/p95 across the recent ledger (model averages);
 * `hops`   the active project's hop telemetry (wall-clock, includes tools).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { groupByModel, readHopSpeeds, readTurnSpeeds, stat } from '@/lib/token-speed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const project = (req.nextUrl.searchParams.get('project') || '').trim();
  const agentFilter = (req.nextUrl.searchParams.get('agent') || '').trim().toLowerCase();
  const allTurns = readTurnSpeeds(240);
  const turns = agentFilter
    ? allTurns.filter((t) => (t.agent || '').toLowerCase() === agentFilter || (t.agent || '').toLowerCase().startsWith(`${agentFilter}-`))
    : allTurns;
  const byModel = groupByModel(turns);

  const byAgentMap = new Map<string, number[]>();
  for (const t of turns) {
    const k = t.agent || 'unknown';
    if (!byAgentMap.has(k)) byAgentMap.set(k, []);
    byAgentMap.get(k)!.push(t.outTokPerSec);
  }
  const byAgent = [...byAgentMap.entries()].map(([agent, values]) => {
    const s = stat(values)!;
    return { agent, n: s.n, avg: s.avg, p50: s.p50, p95: s.p95 };
  }).sort((a, b) => b.n - a.n).slice(0, 12);

  const hops = project ? readHopSpeeds(project) : [];
  const hopStat = hops.length > 0 ? stat(hops.map((h) => h.outTokPerSec)) : null;

  return NextResponse.json({
    ok: true,
    last: turns[0] ?? null,
    agent: agentFilter || null,
    byModel,
    byAgent,
    hops: { stat: hopStat, recent: hops.slice(-8).reverse() },
    updatedAt: new Date().toISOString(),
  }, { headers: NO_CACHE_HEADERS });
}
