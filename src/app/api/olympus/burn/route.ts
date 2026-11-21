/**
 * /api/olympus/burn — v0.0.96: the smart-burn policy and decision.
 *
 * GET  → policy + account truth + the roster the next hop/message will use.
 * POST → set { mode, targetPct, modelCeilingPct }; the next GET refreshes the
 *        decision. No opencode.json rewrite, no warm-server kill.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { getUsageSnapshot, readGoPlan } from '@/lib/go-usage';
import { BURN_GODS, chooseBurnRoster, type BurnModelUsage } from '@/lib/burn-policy';
import { readBurnPolicy, writeBurnDecision, writeBurnPolicy, burnDecisionAgeMs } from '@/lib/burn-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cache: { at: number; decision: any; usage: any } | null = null;

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const force = req.nextUrl.searchParams.get('force') === '1';
  const policy = readBurnPolicy();
  if (!force && cache && Date.now() - cache.at < 120_000) {
    return NextResponse.json({ ok: true, policy, decision: cache.decision, account: cache.usage, cached: true, decisionAgeMs: burnDecisionAgeMs() }, { headers: NO_CACHE_HEADERS });
  }
  const snap = await getUsageSnapshot(readGoPlan(), false);
  const usage = snap.usage;
  const account = usage.account;
  const reset = account.resetAt ? Date.parse(account.resetAt) : NaN;
  const daysLeft = Number.isFinite(reset) ? Math.max(0, (reset - Date.now()) / 86400_000) : 0;
  const models: BurnModelUsage[] = usage.models.map((m) => ({ model: m.model, pctMonth: m.pctMonth, limitUsd: m.limit }));
  const decision = chooseBurnRoster({
    policy,
    accountPct: account.monthlyPct,
    dailyPct: account.forecast?.dailyPct ?? 0,
    daysLeft,
    h5Pct: account.h5Pct,
    weeklyPct: account.weeklyPct,
    anchorAgeMs: account.anchorAgeMs,
    rollingResetAt: account.rollingResetAt,
    models,
    enabledModels: [],
  });
  writeBurnDecision(decision);
  cache = { at: Date.now(), decision, usage: account };
  return NextResponse.json({ ok: true, policy, decision, account, cached: false, decisionAgeMs: 0 }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const policy = writeBurnPolicy(body);
  cache = null;
  return NextResponse.json({ ok: true, policy, gods: BURN_GODS }, { headers: NO_CACHE_HEADERS });
}
