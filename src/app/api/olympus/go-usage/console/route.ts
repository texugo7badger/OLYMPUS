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
import { peekUsageSnapshot, readGoPlan, writeGoPlan, type GoPlan } from '@/lib/go-usage';
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
  // v0.0.97 — NEVER start a cold ledger scan here. The frame sync runs every
  // 30s from boot; the first post used to scan 57k rows and block the event
  // loop for ~2 min (the burn route timed out). Use a resolved shared
  // snapshot when one exists, otherwise the previous anchor's attribution —
  // the console percentages are the graph, and the next sync picks up the
  // fresh spend once the Cost/usage route has warmed the cache.
  const snap = peekUsageSnapshot(plan);
  const prev = readGoConsoleAnchor();
  const account = snap?.usage.account;
  const spendMonthUsd = account?.spendMonthUsd ?? prev?.localSpendMonthUsd ?? 0;
  const spend5hUsd = account?.spend5hUsd ?? prev?.localSpend5hUsd ?? 0;
  const spend7dUsd = account?.spend7dUsd ?? prev?.localSpend7dUsd ?? 0;
  const spendWeekUsd = account?.spendWeekUsd ?? prev?.localSpendWeekUsd ?? 0;
  const inferredCap = monthlyPct > 0 && spendMonthUsd > 0
    ? spendMonthUsd / (monthlyPct / 100)
    : (prev?.capUsd ?? null);
  const anchor = normalizeAnchor({
    plan,
    monthlyPct,
    h5Pct,
    weeklyPct,
    resetAt: new Date(resetAt).toISOString(),
    capUsd: Number(body?.capUsd) > 0 ? Number(body.capUsd) : inferredCap,
    localSpendMonthUsd: spendMonthUsd,
    localSpend5hUsd: spend5hUsd,
    localSpend7dUsd: spend7dUsd,
    localSpendWeekUsd: spendWeekUsd,
    rollingResetAt: body?.rollingResetAt,
    weeklyResetAt: body?.weeklyResetAt,
    requests: body?.requests ?? account?.requests ?? prev?.requests ?? null,
    tokens: body?.tokens ?? account?.tokens ?? prev?.tokens ?? null,
    modelMix: account?.modelMix ?? prev?.modelMix ?? [],
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
      spendMonthUsd,
      spend5hUsd,
      spend7dUsd,
      spendWeekUsd,
    },
  }, { headers: NO_CACHE_HEADERS });
}
