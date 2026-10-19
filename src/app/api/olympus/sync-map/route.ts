/**
 * GET /api/olympus/sync-map — #85 (v0.0.6 MISSION-CONTROL-TRUE): the sync-map
 * read surface. The atlas sync-map (~/.olympus/sync-map.json — the
 * hash-chained session ledger, 386+ live entries at audit time) had NO
 * reader since it shipped: the "who is doing what" panel the map was built
 * for never existed. This route serves the recent rows + the chain
 * integrity header so the panel can show both the work AND the ledger's
 * own health (count + chain head — tamper-evident by design).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYNC_MAP_PATH = path.join(process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'sync-map.json');

interface SyncEntry {
  id: string;
  ts: string;
  updatedTs?: string;
  updatedReason?: string;
  origin: string;
  source: string;
  intent: string;
  status: string;
  meta?: Record<string, unknown>;
  seq?: number;
}

export async function GET(req: NextRequest) {
  const limit = Math.min(200, Math.max(10, Number(req.nextUrl.searchParams.get('limit')) || 50));
  try {
    const raw = fs.readFileSync(SYNC_MAP_PATH, 'utf-8');
    const map = JSON.parse(raw);
    const entries: Record<string, SyncEntry> = map.entries ?? {};
    const rows = Object.values(entries)
      .sort((a, b) => (b.updatedTs || b.ts).localeCompare(a.updatedTs || a.ts))
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        seq: e.seq ?? null,
        ts: e.ts,
        updatedTs: e.updatedTs ?? null,
        updatedReason: e.updatedReason ?? null,
        origin: e.origin,
        // The WHO: dispatch entries carry godId + demigod; chat entries the agent.
        god: String(e.meta?.godId ?? e.meta?.parentGod ?? e.meta?.agent ?? 'apollo').toLowerCase(),
        demigod: typeof e.meta?.demigod === 'string' ? e.meta.demigod : null,
        intent: String(e.intent ?? '').replace(/\s+/g, ' ').slice(0, 160),
        status: String(e.status ?? 'unknown'),
        error: typeof e.meta?.error === 'string' ? e.meta.error.slice(0, 160) : null,
      }));
    return NextResponse.json({
      ok: true,
      rows,
      integrity: {
        count: Object.keys(entries).length,
        chainHead: map.chainHead ?? null,
        lastUpdated: map.lastUpdated ?? null,
      },
    }, { headers: NO_CACHE_HEADERS });
  } catch {
    // No map yet (or unreadable): the honest empty — never a fabricated row.
    return NextResponse.json({
      ok: true,
      rows: [],
      integrity: { count: 0, chainHead: null, lastUpdated: null },
    }, { headers: NO_CACHE_HEADERS });
  }
}
