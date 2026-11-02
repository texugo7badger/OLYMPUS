/**
 * /api/olympus/resources — v0.0.39 (R39-01).
 *
 * GET  → the host snapshot: memory, pressure verdict, OLYMPUS process census.
 * POST → { action: 'reclaim' } stops the app chat server (the largest
 *        optional fleet) and answers with the before/after memory truth.
 *
 * Local only: no provider, no cost, no secrets.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { sampleResources, resetResourceCache } from '@/lib/resource-governor';
import { cleanupServer } from '@/lib/opencode-session';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, resources: sampleResources() }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || '');
  if (action !== 'reclaim') {
    return NextResponse.json({ ok: false, error: "action must be 'reclaim'" }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const before = sampleResources();
  let reclaimed = false;
  let note = 'nothing had to be stopped';
  try {
    cleanupServer();
    reclaimed = true;
    note = 'the app chat server and its MCP fleet were stopped; the next prompt recreates them';
  } catch (e: any) {
    note = `reclaim failed: ${e?.message || String(e)}`;
  }
  // The census cache is stale the moment a fleet dies.
  resetResourceCache();
  const after = sampleResources();
  return NextResponse.json({ ok: true, reclaimed, note, before, after }, { headers: NO_CACHE_HEADERS });
}
