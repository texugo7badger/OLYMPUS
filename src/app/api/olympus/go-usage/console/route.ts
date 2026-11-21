/**
 * /api/olympus/go-usage/console — v0.0.96: the console anchor.
 *
 * GET  → the stored anchor (or null) + whether the top line is exact.
 * POST → records the console's own numbers and the local ledger totals at the
 *        same instant, so the graph can interpolate between syncs without
 *        inventing history.
 *
 * The console is authoritative; this route never claims exact when the anchor
 * is absent. It stores only numbers (no credentials, no session).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { getUsageSnapshot, readGoPlan, writeGoPlan, type GoPlan } from '@/lib/go-usage';
import { normalizeAnchor, readGoConsoleAnchor, writeGoConsoleAnchor } from '@/lib/go-console';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isPlan(v: unknown): v is GoPlan {
  return v === 'go' || v === 'go-plus' || v === 'go-teams';
}

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const anchor = readGoConsoleAnchor();
  return NextResponse.json({
    ok: true,
    anchor,
    exact: Boolean(anchor),
    ageMs: anchor ? Math.max(0, Date.now() - Date.parse(anchor.capturedAt)) : null,
  }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const plan = isPlan(body?.plan) ? body.plan : readGoPlan();
  const monthlyPct = Number(body?.monthlyPct);
  const h5Pct = Number(body?.h5Pct);
  const weeklyPct = Number(body?.weeklyPct);
  const resetAt = Date.parse(String(body?.resetAt ?? ''));
  if (!Number.isFinite(monthlyPct) || !Number.isFinite(h5Pct) || !Number.isFinite(weeklyPct) || !Number.isFinite(resetAt)) {
    return NextResponse.json({
      ok: false,
      error: 'monthlyPct, h5Pct, weeklyPct and resetAt are required (percentages 0–999; resetAt ISO)',
    }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  // Capture the local attribution at the same instant as the console numbers.
  // The frame auto-sync runs every 30s. Use the shared 120s ledger snapshot;
  // scanning 57k rows on every post blocked the Next event loop long enough
  // for the app watchdog to declare the server silent (the v0.0.97 boot hang).
  const snap = await getUsageSnapshot(plan, false);
  const usage = snap.usage;
  const inferredCap = monthlyPct > 0 ? usage.account.spendMonthUsd / (monthlyPct / 100) : null;
  const anchor = normalizeAnchor({
    plan,
    monthlyPct,
    h5Pct,
    weeklyPct,
    resetAt: new Date(resetAt).toISOString(),
    capUsd: Number(body?.capUsd) > 0 ? Number(body.capUsd) : inferredCap,
    localSpendMonthUsd: usage.account.spendMonthUsd,
    localSpend5hUsd: usage.account.spend5hUsd,
    localSpend7dUsd: usage.account.spend7dUsd,
    localSpendWeekUsd: usage.account.spendWeekUsd,
    rollingResetAt: body?.rollingResetAt,
    weeklyResetAt: body?.weeklyResetAt,
    requests: body?.requests ?? usage.account.requests,
    tokens: body?.tokens ?? usage.account.tokens,
    modelMix: usage.account.modelMix,
    capturedAt: new Date().toISOString(),
    source: body?.source === 'browser' || body?.source === 'import' ? body.source : 'manual',
  });
  if (!anchor) {
    return NextResponse.json({ ok: false, error: 'the anchor was not valid' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  if (!writeGoConsoleAnchor(anchor)) {
    return NextResponse.json({ ok: false, error: 'could not persist the console anchor' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
  if (plan !== readGoPlan()) writeGoPlan(plan);
  return NextResponse.json({
    ok: true,
    anchor,
    exact: true,
    inferredCap: anchor.capUsd,
    local: {
      spendMonthUsd: usage.account.spendMonthUsd,
      spend5hUsd: usage.account.spend5hUsd,
      spend7dUsd: usage.account.spend7dUsd,
      spendWeekUsd: usage.account.spendWeekUsd,
    },
  }, { headers: NO_CACHE_HEADERS });
}
