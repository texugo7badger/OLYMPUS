/**
 * /api/olympus/burn — v0.1.0: the smart-burn policy and decision.
 *
 * GET  → policy + decision + account truth. The decision on disk is the FIRST
 *        paint: a cold ledger scan (25MB) must never leave the Smart Burn card
 *        "reading the account…" for minutes. The scan refreshes in the
 *        background and the next poll is exact.
 * POST → set { mode, targetPct, modelCeilingPct }; no opencode.json rewrite.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { getUsageSnapshot, readGoPlan } from '@/lib/go-usage';
import { BURN_GODS, chooseBurnRoster, type BurnModelUsage } from '@/lib/burn-policy';
import { readBurnPolicy, readBurnDecision, writeBurnDecision, writeBurnPolicy, burnDecisionAgeMs } from '@/lib/burn-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cache: { at: number; decision: any; usage: any } | null = null;
let refreshing = false;

function fallbackAccount(decision: any) {
  return {
    monthlyPct: typeof decision?.accountPct === 'number' ? decision.accountPct : null,
    h5Pct: null,
    weeklyPct: null,
    spendMonthUsd: 0, spend5hUsd: 0, spend7dUsd: 0,
    capUsd: null,
    source: 'local' as const,
    anchorAt: null,
    anchorAgeMs: null,
    weeklyResetAt: '',
    resetAt: typeof decision?.resumeAt === 'string' ? decision.resumeAt : null,
    requests: null,
    tokens: null,
    modelMix: [],
  };
}

function fallbackDecision(policy: any, reason: string) {
  return {
    active: policy?.mode && policy.mode !== 'off',
    mode: policy?.mode ?? 'off',
    targetPct: policy?.targetPct ?? 95,
    accountPct: null,
    dailyPct: 0,
    projectedPct: null,
    daysLeft: 0,
    step: 0,
    roster: {},
    reasons: [{ god: 'all', model: '—', tier: 'unknown', reason }],
    blocked: null,
    resumeAt: null,
    generatedAt: new Date().toISOString(),
  };
}

async function compute() {
  const snap = await getUsageSnapshot(readGoPlan(), false);
  const usage = snap.usage;
  const account = usage.account;
  const reset = account.resetAt ? Date.parse(account.resetAt) : NaN;
  const daysLeft = Number.isFinite(reset) ? Math.max(0, (reset - Date.now()) / 86400_000) : 0;
  const models: BurnModelUsage[] = usage.models.map((m) => ({ model: m.model, pctMonth: m.pctMonth, limitUsd: m.limit }));
  const decision = chooseBurnRoster({
    policy: readBurnPolicy(),
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
  return { decision, account };
}

function refreshInBackground() {
  if (refreshing || (cache && Date.now() - cache.at < 120_000)) return;
  refreshing = true;
  void compute()
    .catch(() => { /* the disk decision remains the honest fallback */ })
    .finally(() => { refreshing = false; });
}

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const force = req.nextUrl.searchParams.get('force') === '1';
  const policy = readBurnPolicy();

  if (!force && cache && Date.now() - cache.at < 120_000) {
    return NextResponse.json({ ok: true, policy, decision: cache.decision, account: cache.usage, cached: true, decisionAgeMs: burnDecisionAgeMs() }, { headers: NO_CACHE_HEADERS });
  }

  // v0.1.0 — FIRST PAINT FROM DISK. A cold scan can take 10s+; the user
  // must still see whether Smart Burn is active and which roster it chose.
  const disk = readBurnDecision();
  if (!force && disk) {
    const age = burnDecisionAgeMs();
    if (age == null || age > 120_000) refreshInBackground();
    return NextResponse.json({
      ok: true,
      policy,
      decision: disk,
      account: fallbackAccount(disk),
      cached: true,
      degraded: true,
      decisionAgeMs: age,
    }, { headers: NO_CACHE_HEADERS });
  }

  try {
    const result = await Promise.race([
      compute(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('account read timed out')), 20_000)),
    ]);
    return NextResponse.json({ ok: true, policy, decision: result.decision, account: result.account, cached: false, decisionAgeMs: 0 }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    const decision = fallbackDecision(policy, e?.message || 'account read unavailable');
    return NextResponse.json({
      ok: true,
      policy,
      decision,
      account: fallbackAccount(decision),
      cached: false,
      degraded: true,
      decisionAgeMs: burnDecisionAgeMs(),
      error: e?.message || 'account read unavailable',
    }, { headers: NO_CACHE_HEADERS });
  }
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
