/**
 * /api/olympus/power — v0.0.32 (Epic N): suspend/resume truth.
 *
 * The Electron main writes the suspend marker directly (it must land before
 * the freeze) and calls this route on resume. The route reconciles the
 * campaign view, appends the activity entry and returns the summary the tray
 * notification shows.
 *
 * GET  → {state, recentlyResumed, campaign}
 * POST → {action: 'suspend'|'resume'}
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { isRecentlyResumed, markResume, markSuspend, readSuspendState } from '@/lib/power-suspend';
import { appendActivity } from '@/lib/activity-feed';
import { getActiveProject, getActiveProjectSlug } from '@/lib/project-context';
import { loadHopState } from '@/lib/hop-runtime/hop-state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CampaignSummary {
  project: string;
  completed: number;
  total: number;
  parked: string | null;
}

function campaignSummary(): CampaignSummary | null {
  const slug = getActiveProjectSlug();
  if (!slug) return null;
  const project = getActiveProject();
  if (!project?.path) return null;
  let total = 0;
  try {
    const plan = JSON.parse(fs.readFileSync(path.join(project.path, 'dispatch-plan.json'), 'utf-8'));
    total = Array.isArray(plan?.hops) ? plan.hops.length : 0;
  } catch { /* no plan */ }
  let completed = 0;
  let parked: string | null = null;
  try {
    const state = loadHopState(project.path);
    completed = state?.completed?.length ?? 0;
    parked = state?.parked?.hopId ?? null;
  } catch { /* corrupt state — reported as zero, never a crash */ }
  if (total === 0 && completed === 0) return null;
  return { project: slug, completed, total, parked };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    state: readSuspendState(),
    recentlyResumed: isRecentlyResumed(),
    campaign: campaignSummary(),
  }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '');
  if (action === 'suspend') {
    const state = markSuspend();
    try {
      appendActivity({
        god: 'system',
        action: 'power-suspend',
        msg: 'OS suspend observed — the hop timers will treat the freeze as a suspend, not a provider stall.',
        meta: { at: state.suspendedAt },
      });
    } catch { /* the feed never blocks */ }
    return NextResponse.json({ ok: true, state, campaign: campaignSummary() }, { headers: NO_CACHE_HEADERS });
  }
  if (action === 'resume') {
    const state = markResume();
    const campaign = campaignSummary();
    try {
      appendActivity({
        god: 'system',
        action: 'power-resume',
        msg: campaign
          ? `OS resume — campaign ${campaign.project} at ${campaign.completed}/${campaign.total}${campaign.parked ? ` (parked at ${campaign.parked})` : ''}.`
          : 'OS resume — no campaign running.',
        meta: { at: state.resumedAt, campaign },
      });
    } catch { /* the feed never blocks */ }
    return NextResponse.json({ ok: true, state, campaign, recentlyResumed: true }, { headers: NO_CACHE_HEADERS });
  }
  return NextResponse.json({ ok: false, error: "action must be 'suspend' or 'resume'" }, { status: 400, headers: NO_CACHE_HEADERS });
}
