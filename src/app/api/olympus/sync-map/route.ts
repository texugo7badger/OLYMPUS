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
import { withTtl } from '@/lib/ttl-cache';
import { isAppVisibleEntry } from '@/lib/sync-map-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLYMPUS_HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const SYNC_MAP_PATH = path.join(OLYMPUS_HOME, 'sync-map.json');
const OPERATOR_SESSIONS_PATH = path.join(OLYMPUS_HOME, 'operator-sessions.json');

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

/**
 * The lifecycle contract is received → routed → done | failed | lost.
 * `lost` means the process ended before the turn settled: the outcome is
 * unknown, the work may have finished. Legacy rows spelled it `unknown` or
 * mislabeled a process exit as `failed`; both normalize here, so the API
 * NEVER emits a status outside the contract.
 */
function isLostEntry(e: SyncEntry): boolean {
  const status = String(e.status ?? '').toLowerCase();
  if (status === 'lost' || status === 'unknown') return true;
  return status === 'failed'
    && /(process exit|died mid-flight)/i.test(String(e.updatedReason ?? ''));
}

function resolveSyncStatus(e: SyncEntry): 'received' | 'routed' | 'done' | 'failed' | 'lost' {
  if (isLostEntry(e)) return 'lost';
  const status = String(e.status ?? '').toLowerCase();
  if (status === 'done' || status === 'failed' || status === 'routed') return status;
  // An entry exists because a prompt/dispatch was received; never fabricate.
  return 'received';
}

export async function GET(req: NextRequest) {
  const limit = Math.min(200, Math.max(10, Number(req.nextUrl.searchParams.get('limit')) || 50));
  // v0.0.85 — the default view is the APP's ledger, not the operator/assistant
  // session or the walker's hop prompts. `?scope=all` is the audit view.
  const scope = req.nextUrl.searchParams.get('scope') === 'all' ? 'all' : 'app';
  try {
    // v0.0.25 — the map file is the heavy read; a 5s cache keeps re-opens instant.
    const map: any = await withTtl('sync-map:file', () => JSON.parse(fs.readFileSync(SYNC_MAP_PATH, 'utf-8')), { ttlMs: 5_000 });
    const entries: Record<string, SyncEntry> = map.entries ?? {};
    const operatorFile = scope === 'app'
      ? await withTtl('sync-map:operators', () => JSON.parse(fs.readFileSync(OPERATOR_SESSIONS_PATH, 'utf-8')), { ttlMs: 5_000 }).catch(() => ({ sessions: [] }))
      : { sessions: [] };
    const operatorSessions = new Set<string>(
      Array.isArray(operatorFile?.sessions) ? operatorFile.sessions.filter((s: unknown) => typeof s === 'string') : [],
    );
    const scoped = Object.values(entries).filter((e) => scope === 'all' || isAppVisibleEntry(e, operatorSessions));
    const rows = scoped
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
        // v0.0.31 (R31-13) — THE 775 FALSE FAILURES.
        // The old exit path marked every still-open prompt "failed" (process
        // exit ≠ the work failed). The writer now lands `lost` (a distinct
        // terminal state, never red); legacy `unknown` rows normalize to it.
        // The status ALWAYS stays inside the contract set.
        status: resolveSyncStatus(e),
        lost: isLostEntry(e),
        error: typeof e.meta?.error === 'string' ? e.meta.error.slice(0, 160) : null,
      }));
    return NextResponse.json({
      ok: true,
      rows,
      integrity: {
        count: Object.keys(entries).length,
        filtered: scoped.length,
        scope,
        chainHead: map.chainHead ?? null,
        lastUpdated: map.lastUpdated ?? null,
      },
    }, { headers: NO_CACHE_HEADERS });
  } catch {
    // No map yet (or unreadable): the honest empty — never a fabricated row.
    return NextResponse.json({
      ok: true,
      rows: [],
      integrity: { count: 0, filtered: 0, scope, chainHead: null, lastUpdated: null },
    }, { headers: NO_CACHE_HEADERS });
  }
}
