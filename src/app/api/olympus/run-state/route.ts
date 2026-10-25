/**
 * GET /api/olympus/run-state — "IS IT WORKING?" WITH PROCESS EVIDENCE.
 *
 * THE SPECIMEN (2026-10-24): the user could never tell whether OLYMPUS was
 * working. Every surface answered from the ACTIVITY FEED (a 3-minute window,
 * `useWorkingGods`), so a HEALTHY 8-minute hop read as "idle" after 3 minutes,
 * and five concurrent walkers read as one very confused god.
 *
 * The house law (#105, AGENTS.md) is explicit: a claim about live state
 * carries PROBE evidence or it is not made. This route is that probe:
 *
 *   - `campaign`  — the walk lock on the lane (pid + heartbeat, READ-ONLY peek)
 *   - `hops`      — the hop state on disk (completed / parked / inFlight)
 *   - `laneHealth`— which model lanes are dead right now, and until when
 *   - `verdict`   — one honest word, computed from the above, never guessed
 *
 * The verdict vocabulary:
 *   RUNNING         a live campaign holds the lane AND its pid answers
 *   PARKED          the last campaign stopped on a named cause
 *   IDLE            nothing running, nothing parked
 *   UNVERIFIED      state exists but no process could be confirmed
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { readWalkLock } from '@/lib/hop-runtime/walk-lock';
import { loadHopState, hopStatePath } from '@/lib/hop-runtime/hop-state';
import { readHopTelemetry } from '@/lib/hop-runtime/walker';
import { readLaneHealth, blockedLanes } from '@/lib/lane-health';
import { workspaceLaneDir } from '@/lib/opencode-spawn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// #V0.0.20: reconcile llm-providers.json with active-strategy.json on every
// run-state check so the panel and the config never disagree.
function reconcileStrategy() {
  try {
    const home = os.homedir();
    const activePath = path.join(home, '.olympus', 'active-strategy.json');
    const providersPath = path.join(home, '.olympus', 'llm-providers.json');
    if (fs.existsSync(activePath)) {
      const active = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
      const cfg = fs.existsSync(providersPath) ? JSON.parse(fs.readFileSync(providersPath, 'utf-8')) : {};
      if (cfg.strategy !== active.strategy) {
        cfg.strategy = active.strategy;
        cfg.per_god_overrides = cfg.per_god_overrides || {};
        fs.writeFileSync(providersPath, JSON.stringify(cfg, null, 2));
      }
    }
  } catch { /* non-fatal */ }
}

const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return null; }
}

/** The active project slug — the same pointer the Project Switcher writes. */
function activeSlug(): string | null {
  const p = readJson<{ slug?: string }>(path.join(OLYMPUS_HOME, 'active-project.json'));
  return typeof p?.slug === 'string' && p.slug ? p.slug : null;
}

/**
 * The lane roots that may carry a campaign, most specific first:
 *   1. the workspace lane for the active project (~/.local/share/olympus/workspace/<slug>)
 *   2. that lane's note home in the vault (02_Projects/<slug>) — the intake path
 * We PEEK only; a lane without a lock simply reports no campaign.
 */
function candidateLanes(slug: string | null): string[] {
  const out: string[] = [];
  if (!slug) return out;
  try { out.push(path.join(workspaceLaneDir(), slug)); } catch { /* no workspace yet */ }
  out.push(path.join(os.homedir(), 'OLYMPUS-VAULT', '02_Projects', slug));
  return [...new Set(out)];
}

export async function GET() {
  reconcileStrategy();
  const slug = activeSlug();
  const lanes = candidateLanes(slug);

  // The lane the campaign actually holds — first one with a lock, else the
  // first candidate that has any runtime state at all.
  const peeks = lanes.map((lane) => ({ lane, ...readWalkLock(lane) }));
  const held = peeks.find((p) => p.alive);
  const laneWithState = lanes.find((lane) => fs.existsSync(hopStatePath(lane)));
  const lane = held?.lane ?? laneWithState ?? lanes[0] ?? null;

  const hopState = lane ? loadHopState(lane) : null;
  let telemetry: Array<Record<string, unknown>> = [];
  try { telemetry = lane ? (readHopTelemetry(lane) as unknown as Array<Record<string, unknown>>).slice(-10) : []; } catch { /* optional */ }

  const health = readLaneHealth();
  const blocked = blockedLanes(health.lanes);

  const campaign = held?.holder
    ? {
      state: 'running' as const,
      pid: held.holder.pid,
      campaignId: held.holder.campaignId,
      slug: held.holder.slug,
      sessionId: held.holder.sessionId ?? null,
      startedAt: held.holder.startedAt,
      lane,
      heartbeatAgeMs: Math.round(held.ageMs),
    }
    : peeks.find((p) => p.holder)
      ? { state: 'unverified' as const, lane, heartbeatAgeMs: Math.round(peeks.find((p) => p.holder)!.ageMs), holder: peeks.find((p) => p.holder)!.holder }
      : { state: 'none' as const, lane };

  const inFlight = hopState?.inFlight?.length ?? 0;
  const completed = hopState?.completed?.length ?? 0;
  const parked = hopState?.parked ?? null;

  const verdict =
    campaign.state === 'running' ? 'RUNNING'
    : parked ? 'PARKED'
    : campaign.state === 'unverified' ? 'UNVERIFIED'
    : inFlight > 0 ? 'UNVERIFIED'
    : 'IDLE';

  // The single human line — the StatusBar renders exactly this.
  const line =
    verdict === 'RUNNING'
      ? `RUNNING · ${campaign.state === 'running' ? campaign.campaignId : 'campaign'} · pid ${campaign.state === 'running' ? campaign.pid : '?'} · ${completed} hop(s) ok`
      : verdict === 'PARKED'
        ? `PARKED · ${parked?.hopId ?? '?'} · ${parked?.reason ?? 'sem causa registrada'}`
        : verdict === 'UNVERIFIED'
          ? 'UNVERIFIED — state on disk, but no process could be confirmed'
          : 'IDLE';

  return NextResponse.json({
    slug,
    lane,
    verdict,
    line,
    campaign,
    hops: {
      completed,
      inFlight,
      parked: parked ? { hopId: parked.hopId, reason: parked.reason, error: parked.error ?? null, ts: parked.ts } : null,
      updatedAt: hopState?.updatedAt ?? null,
    },
    telemetry,
    laneHealth: {
      blocked,
      // Never leak the whole registry to the client — the blocked ones are
      // the only actionable truth (a healthy lane is uninteresting).
      blockedCount: blocked.length,
      checkedAt: health.updatedAt || null,
    },
    // #105: the refusal is explicit when there is no evidence.
    evidence: campaign.state === 'running' ? 'process-alive + lock-heartbeat' : campaign.state === 'unverified' ? 'disk-only' : 'none',
  }, { headers: NO_CACHE_HEADERS });
}
