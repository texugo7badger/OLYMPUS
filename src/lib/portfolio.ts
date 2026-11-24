/**
 * portfolio.ts — v0.0.98-16: the multi-project MVP dashboard.
 *
 * One read over every project lane (plan + state + telemetry + profile) so
 * the user can compare campaigns without opening each one. The metrics are
 * measured, never inferred: first-green is the first completed telemetry row
 * relative to the plan's createdAt; hops-to-done is completed/total; park
 * rate is parked rows/rows. `timeToFirstGreenMs` is labelled a proxy because
 * it measures the first green hop, not a browser paint.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getVaultRoot } from './vault-root';
import { readFrozenPlan, readPlanFile, planPath } from './hop-runtime/plan-generation';
import { loadHopState } from './hop-runtime/hop-state';
import { readWalkLock } from './hop-runtime/walk-lock';
import { resolveLaneProfile } from './delivery-profile-store';
import { profilePlanCheck, resolveProfile, type DeliveryProfileId, type DeliveryPlanCheck } from './delivery-profiles';

export interface PortfolioProject {
  slug: string;
  laneRoot: string;
  generation: number;
  campaignId: string | null;
  status: 'RUNNING' | 'PARKED' | 'DONE' | 'IDLE';
  completed: number;
  total: number;
  hopsToDonePct: number;
  parkedHop: string | null;
  profile: DeliveryProfileId | null;
  profileLabel: string | null;
  profileCheck: DeliveryPlanCheck | null;
  liveWalk: boolean;
  firstGreenMs: number | null;
  doneMs: number | null;
  parkRatePct: number | null;
  attempts: number;
  tokensOut: number;
  lastActivity: string | null;
}

export interface Portfolio {
  ok: true;
  generatedAt: string;
  projects: PortfolioProject[];
  totals: {
    projects: number;
    running: number;
    parked: number;
    done: number;
    hops: number;
    completed: number;
    firstGreenMs: number | null;
    parkRatePct: number | null;
  };
}

function readRows(laneRoot: string, max = 500): any[] {
  try {
    const text = fs.readFileSync(path.join(laneRoot, '.olympus-hop-telemetry.jsonl'), 'utf-8');
    return text.trim().split('\n').slice(-max).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function dirs(): string[] {
  const projects = path.join(getVaultRoot(), '02_Projects');
  try {
    return fs.readdirSync(projects, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
      .map((d) => path.join(projects, d.name))
      .filter((lane) => fs.existsSync(planPath(lane)) || fs.existsSync(path.join(lane, 'project.md')));
  } catch { return []; }
}

export function buildPortfolio(now = Date.now()): Portfolio {
  const projects: PortfolioProject[] = [];
  for (const laneRoot of dirs()) {
    const plan = readFrozenPlan(laneRoot) ?? readPlanFile(planPath(laneRoot));
    if (!plan || !Array.isArray(plan.hops) || plan.hops.length === 0) continue;
    const state = loadHopState(laneRoot);
    const rows = readRows(laneRoot);
    const total = plan.hops.length;
    const completed = (state?.completed ?? []).filter((id) => plan.hops.some((h) => h.id === id)).length;
    const parkedHop = state?.parked?.hopId ?? null;
    const liveWalk = Boolean(readWalkLock(laneRoot).holder && readWalkLock(laneRoot).alive);
    const status: PortfolioProject['status'] = liveWalk ? 'RUNNING'
      : parkedHop ? 'PARKED'
        : total > 0 && completed >= total ? 'DONE' : 'IDLE';
    const profileId = resolveLaneProfile(laneRoot, plan);
    const profile = profileId ? resolveProfile(profileId) : null;
    const check = profileId ? profilePlanCheck(plan, profileId) : null;
    const completedRows = rows.filter((r) => String(r?.status ?? '') === 'completed')
      .map((r) => ({ ts: Date.parse(String(r?.ts ?? '')), tokensOut: Number(r?.tokensOut ?? 0) }))
      .filter((r) => Number.isFinite(r.ts))
      .sort((a, b) => a.ts - b.ts);
    const planCreated = Date.parse(String((plan as any)?.createdAt ?? ''));
    const firstGreenMs = completedRows.length && Number.isFinite(planCreated)
      ? Math.max(0, completedRows[0].ts - planCreated)
      : null;
    const lastDone = completedRows.length ? completedRows[completedRows.length - 1].ts : 0;
    const doneMs = status === 'DONE' && Number.isFinite(planCreated) && lastDone
      ? Math.max(0, lastDone - planCreated)
      : null;
    const attempts = rows.length;
    const parks = rows.filter((r) => String(r?.status ?? '').startsWith('parked')).length;
    const parkRatePct = attempts ? Math.round((parks / attempts) * 1000) / 10 : null;
    const tokensOut = completedRows.reduce((n, r) => n + (Number.isFinite(r.tokensOut) ? r.tokensOut : 0), 0);
    const lastRow = rows.reduce((max, r) => Math.max(max, Date.parse(String(r?.ts ?? '')) || 0), 0);
    const lastActivity = lastRow ? new Date(lastRow).toISOString() : (state?.updatedAt ?? null);
    projects.push({
      slug: path.basename(laneRoot),
      laneRoot,
      generation: Number(state?.generation ?? (plan as any)?.generation ?? 0),
      campaignId: typeof state?.campaignId === 'string' ? state.campaignId : null,
      status,
      completed,
      total,
      hopsToDonePct: total ? Math.round((completed / total) * 1000) / 10 : 0,
      parkedHop,
      profile: profileId,
      profileLabel: profile?.label ?? null,
      profileCheck: check,
      liveWalk,
      firstGreenMs,
      doneMs,
      parkRatePct,
      attempts,
      tokensOut,
      lastActivity,
    });
  }
  projects.sort((a, b) => String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? '')));
  const running = projects.filter((p) => p.status === 'RUNNING').length;
  const parked = projects.filter((p) => p.status === 'PARKED').length;
  const done = projects.filter((p) => p.status === 'DONE').length;
  const hops = projects.reduce((n, p) => n + p.total, 0);
  const completed = projects.reduce((n, p) => n + p.completed, 0);
  const firstGreens = projects.map((p) => p.firstGreenMs).filter((n): n is number => n != null);
  const parkRates = projects.map((p) => p.parkRatePct).filter((n): n is number => n != null);
  return {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    projects,
    totals: {
      projects: projects.length,
      running, parked, done, hops, completed,
      firstGreenMs: firstGreens.length ? Math.round(firstGreens.reduce((n, v) => n + v, 0) / firstGreens.length) : null,
      parkRatePct: parkRates.length ? Math.round((parkRates.reduce((n, v) => n + v, 0) / parkRates.length) * 10) / 10 : null,
    },
  };
}
