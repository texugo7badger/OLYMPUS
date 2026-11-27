/**
 * /api/olympus/resonance — v0.1.4 Symphony Resonance Index.
 *
 * GET  → stats + the most-sampled signatures (quick circuits first)
 * POST → { action: 'backfill' } | { action: 'query', task, god }
 *
 * The index is machine-local (`~/.olympus/resonance.db`); the vault log stays
 * the source of truth. Backfill is deterministic and safe to repeat.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import {
  backfillResonanceIndex,
  listResonanceSignatures,
  queryResonance,
  resonanceStats,
} from '@/lib/symphony/resonance-index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const limit = Number(req.nextUrl.searchParams.get('limit') || 20);
  const god = String(req.nextUrl.searchParams.get('god') || '').trim().toLowerCase();
  const rows = listResonanceSignatures(Number.isFinite(limit) ? limit : 20);
  return NextResponse.json({
    ok: true,
    ...resonanceStats(),
    signatures: god ? rows.filter((r) => r.god === god || r.god === 'all') : rows,
  }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch { /* action defaults to status */ }
  const action = String(body?.action || 'backfill');
  if (action === 'query') {
    const task = String(body?.task || '').trim();
    const god = String(body?.god || '').trim().toLowerCase();
    if (!task || !god) {
      return NextResponse.json({ ok: false, error: 'task and god are required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const match = queryResonance({ task, god });
    return NextResponse.json({ ok: true, match }, { headers: NO_CACHE_HEADERS });
  }
  if (action !== 'backfill') {
    return NextResponse.json({ ok: false, error: `unknown action: ${action}` }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const result = backfillResonanceIndex();
  return NextResponse.json({ ok: true, ...result }, { headers: NO_CACHE_HEADERS });
}
