/**
 * GET /api/olympus/go-usage — v0.0.81: the GO Plus consumption ledger.
 *
 * Returns the per-model 5h / 7d / month usage priced from the local OpenCode
 * ledger with the public Go catalog. The console is authoritative; this is
 * the in-app instrument, never a fake 0%.
 *
 * POST { plan: 'go' | 'go-plus' | 'go-teams' } — persist the declared plan.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { aggregate, loadCatalog, readGoPlan, readGoPlanStart, readSpendRows, writeGoPlan, type GoPlan } from '@/lib/go-usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// v0.0.83 — the ledger scan reads the chat DB + the hop DB and prices every
// turn; the first call on a cold process takes seconds. The bar polls every
// 30s, so a 20s cache turns every later call into ~0.02s and the UI shows a
// skeleton on the cold one.
let usageCache: { at: number; plan: GoPlan; data: any } | null = null;

function isPlan(v: unknown): v is GoPlan {
  return v === 'go' || v === 'go-plus' || v === 'go-teams';
}

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const requested = req.nextUrl.searchParams.get('plan');
  const plan = isPlan(requested) ? requested : readGoPlan();
  if (usageCache && usageCache.plan === plan && Date.now() - usageCache.at < 20_000) {
    return NextResponse.json({ ...usageCache.data, cached: true }, { headers: NO_CACHE_HEADERS });
  }
  const catalog = await loadCatalog();
  const rows = readSpendRows(catalog.models);
  const usage = aggregate(rows, plan, Date.now(), readGoPlanStart());
  const payload = {
    ok: true,
    ...usage,
    catalogSource: catalog.source,
    catalogModels: catalog.models.size,
    ledgerRows: rows.length,
  };
  usageCache = { at: Date.now(), plan, data: payload };
  return NextResponse.json(payload, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!isPlan(body?.plan)) {
    return NextResponse.json({ ok: false, error: "plan must be 'go' | 'go-plus' | 'go-teams'" }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  writeGoPlan(body.plan);
  return NextResponse.json({ ok: true, plan: body.plan }, { headers: NO_CACHE_HEADERS });
}
