/**
 * GET /api/olympus/go-usage/meter — v0.0.98: the terminal's always-visible
 * 5h/weekly/monthly meter.
 *
 * The Cost panel is exact but cold-scanning the 57k-row ledger is expensive;
 * the terminal needs a cheap answer every 10s. This route reads ONLY the
 * console anchor and the already-resolved shared snapshot (if any). It never
 * starts a ledger scan and never invents a number: no anchor → null windows.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { withTtl } from '@/lib/ttl-cache';
import { accountWindows, readGoConsoleAnchor } from '@/lib/go-console';
import { peekUsageSnapshot, readGoPlan } from '@/lib/go-usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const body = await withTtl('go-usage-meter', () => {
    const plan = readGoPlan();
    const anchor = readGoConsoleAnchor();
    const snap = peekUsageSnapshot(plan);
    const usage = snap?.usage ?? null;
    const aw = accountWindows({
      anchor,
      spendMonthUsd: usage?.account.spendMonthUsd ?? 0,
      spend5hUsd: usage?.account.spend5hUsd ?? 0,
      spend7dUsd: usage?.account.spend7dUsd ?? 0,
      spendWeekUsd: usage?.account.spendWeekUsd ?? 0,
    });
    return {
      ok: true,
      exact: Boolean(anchor),
      source: aw.source,
      anchorAt: aw.anchorAt,
      anchorAgeMs: aw.anchorAgeMs,
      plan,
      windows: {
        h5: { pct: aw.h5Pct, resetAt: aw.rollingResetAt },
        weekly: { pct: aw.weeklyPct, resetAt: aw.weeklyResetAt },
        monthly: { pct: aw.monthlyPct, resetAt: aw.monthlyResetAt },
      },
      spend: usage ? {
        monthUsd: usage.account.spendMonthUsd,
        h5Usd: usage.account.spend5hUsd,
        weekUsd: usage.account.spendWeekUsd,
        capUsd: usage.account.capUsd,
      } : null,
      quota: { hit: (aw.h5Pct ?? 0) >= 100, resumeAt: aw.rollingResetAt },
    };
  }, { ttlMs: 5_000 });
  return NextResponse.json(body, { headers: NO_CACHE_HEADERS });
}
