/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
// Shared no-cache headers for live API routes.
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/metrics
 *
 * Returns metrics summaries for the Olympus UI Metrics Dashboard.
 * Reads from ~/.olympus/metrics/*.jsonl (Phase 7 telemetry).
 *
 * Query params:
 *   ?range=24       — hours (default 24)
 *   ?category=router — single category (default: all)
 *   ?detail=true    — include last 100 events per category
 */

const CATEGORIES = ['router', 'provider', 'mcp', 'vault', 'plugin', 'brain', 'ui', 'cost'];

function readJsonlTail(filePath: string, maxLines = 100): any[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.slice(-maxLines).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function getSummary(category: string, rangeHours: number) {
  const events = readJsonlTail(path.join(os.homedir(), '.olympus', 'metrics', `${category}.jsonl`), 10000);
  const cutoff = Date.now() - rangeHours * 60 * 60 * 1000;
  const filtered = events.filter(e => new Date(e.ts).getTime() >= cutoff);

  const byEvent: Record<string, number> = {};
  const byGod: Record<string, number> = {};
  let latencySum = 0;
  let latencyCount = 0;
  let errorCount = 0;

  for (const e of filtered) {
    const evt = e.event || 'unknown';
    byEvent[evt] = (byEvent[evt] || 0) + 1;
    if (e.god) byGod[e.god] = (byGod[e.god] || 0) + 1;
    if (e.latency_ms != null) { latencySum += e.latency_ms; latencyCount++; }
    if (e.success === false || e.error || e.event?.includes('error') || e.event?.includes('failed')) errorCount++;
  }

  return {
    category,
    range_hours: rangeHours,
    total: filtered.length,
    by_event: byEvent,
    by_god: byGod,
    avg_latency_ms: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
    error_rate: filtered.length > 0 ? (errorCount / filtered.length * 100).toFixed(1) + '%' : '0%',
  };
}

export async function GET(req: NextRequest) {
  const rangeHours = parseInt(req.nextUrl.searchParams.get('range') || '24', 10);
  const category = req.nextUrl.searchParams.get('category');
  const detail = req.nextUrl.searchParams.get('detail') === 'true';

  // Single category
  if (category && CATEGORIES.includes(category)) {
    const summary = getSummary(category, rangeHours);
    const events = detail ? readJsonlTail(
      path.join(os.homedir(), '.olympus', 'metrics', `${category}.jsonl`), 100
    ) : [];
    return NextResponse.json({ ...summary, events }, { headers: NO_CACHE_HEADERS });
  }

  // All categories
  const summaries: Record<string, any> = {};
  for (const cat of CATEGORIES) {
    summaries[cat] = getSummary(cat, rangeHours);
  }

  // Cost by god
  const costEvents = readJsonlTail(path.join(os.homedir(), '.olympus', 'metrics', 'cost.jsonl'), 10000);
  const costByGod: Record<string, any> = {};
  const costCutoff = Date.now() - rangeHours * 60 * 60 * 1000;
  for (const e of costEvents) {
    if (new Date(e.ts).getTime() < costCutoff) continue;
    if (!e.god) continue;
    if (!costByGod[e.god]) costByGod[e.god] = { tokens: 0, cost_usd: 0, calls: 0 };
    costByGod[e.god].tokens += e.tokens || 0;
    costByGod[e.god].cost_usd += e.cost_usd || 0;
    costByGod[e.god].calls++;
  }

  // File stats
  const fileStats: Record<string, any> = {};
  for (const cat of CATEGORIES) {
    const filePath = path.join(os.homedir(), '.olympus', 'metrics', `${cat}.jsonl`);
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        fileStats[cat] = { size_kb: Math.round(stat.size / 1024 * 10) / 10, lines: content.trim().split('\n').filter(Boolean).length };
      } else {
        fileStats[cat] = { size_kb: 0, lines: 0 };
      }
    } catch {
      fileStats[cat] = { size_kb: 0, lines: 0 };
    }
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    range_hours: rangeHours,
    summaries,
    cost_by_god: costByGod,
    file_stats: fileStats,
    metrics_enabled: process.env.OLYMPUS_METRICS_ENABLED !== '0',
  }, { headers: NO_CACHE_HEADERS });
}