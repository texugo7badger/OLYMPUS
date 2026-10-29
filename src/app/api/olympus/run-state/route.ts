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

// v0.0.22 (W2): the old reconcileStrategy() band-aid is GONE. strategy.json
// is the single source of truth and readStrategyState() migrates the legacy
// files once; the run-state route no longer patches drift on every poll.
import { readStrategyState } from '@/lib/strategy-state';

const OLYMPUS_HOME = path.join(os.homedir(), '.olympus');

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return null; }
}

/**
 * v0.0.22 — PROVENANCE. The StatusBar line must name WHO is working and on
 * WHICH lane, not just "campaign running". Reads the last hop_start event
 * from the telemetry tail and the god→model map from the applied config.
 * Missing data is reported as null (never guessed) — the UI renders "—".
 */
function readProvenance(telemetry: Array<Record<string, unknown>>): {
  god: string | null;
  hopId: string | null;
  skill: string | null;
  elapsedMs: number | null;
} {
  for (let i = telemetry.length - 1; i >= 0; i--) {
    const ev = telemetry[i];
    if (ev?.type === 'hop_start' || ev?.event === 'hop_start') {
      const god = typeof ev.god === 'string' ? ev.god : null;
      const hopId = typeof ev.hopId === 'string' ? ev.hopId : (typeof ev.hop === 'string' ? ev.hop : null);
      const skill = typeof ev.skill === 'string' ? ev.skill : null;
      const started = typeof ev.ts === 'string' ? Date.parse(ev.ts) : NaN;
      const elapsedMs = Number.isFinite(started) ? Math.max(0, Date.now() - started) : null;
      return { god, hopId, skill, elapsedMs };
    }
  }
  return { god: null, hopId: null, skill: null, elapsedMs: null };
}

/** The god → model map from the APPLIED config (what is actually running). */
function readAppliedModels(root: string): Record<string, string> {
  const cfg = readJson<{ agent?: Record<string, { model?: string }> }>(path.join(root, 'opencode.json'));
  const out: Record<string, string> = {};
  for (const [id, agent] of Object.entries(cfg?.agent ?? {})) {
    if (agent?.model) out[id] = agent.model;
  }
  return out;
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
  // v0.0.22 (W2) — reading the state also performs the one-time migration
  // from the legacy files; no reconcile writes on every poll.
  const strategyState = readStrategyState();
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

  // v0.0.22 PROVENANCE — god + model + hop + elapsed, so the strip never
  // says "something is running" without naming it.
  const provenance = readProvenance(telemetry);
  const models = readAppliedModels(process.cwd());
  const model = provenance.god ? (models[provenance.god] ?? null) : null;
  const elapsedLabel = provenance.elapsedMs != null
    ? (provenance.elapsedMs >= 60_000
      ? `${Math.floor(provenance.elapsedMs / 60_000)}m${Math.round((provenance.elapsedMs % 60_000) / 1000)}s`
      : `${Math.round(provenance.elapsedMs / 1000)}s`)
    : null;

  const verdict =
    campaign.state === 'running' ? 'RUNNING'
    : parked ? 'PARKED'
    : campaign.state === 'unverified' ? 'UNVERIFIED'
    : inFlight > 0 ? 'UNVERIFIED'
    : 'IDLE';

  // The single human line — the StatusBar renders exactly this. RUNNING now
  // names the god, the lane/model, the hop and the elapsed time (the
  // no-black-box rule); anything unknown stays "—", never invented.
  const who = [provenance.god, model, provenance.hopId].filter(Boolean).join(' · ');
  const line =
    verdict === 'RUNNING'
      ? `RUNNING · ${who || (campaign.state === 'running' ? campaign.campaignId : 'campaign')}${elapsedLabel ? ` · ${elapsedLabel}` : ''} · ${completed} hop(s) ok`
      : verdict === 'PARKED'
        ? `PARKED · ${parked?.hopId ?? '?'} · ${parked?.reason ?? 'no recorded cause'}`
        : verdict === 'UNVERIFIED'
          ? 'UNVERIFIED — state on disk, but no process could be confirmed'
          : 'IDLE';

  return NextResponse.json({
    slug,
    lane,
    verdict,
    line,
    strategy: {
      id: strategyState.strategy,
      appliedAt: strategyState.appliedAt,
      agentCount: strategyState.agentCount,
      demigodsLoaded: strategyState.demigodsLoaded,
      noOp: strategyState.noOp,
    },
    campaign,
    provenance: {
      god: provenance.god,
      model,
      hopId: provenance.hopId,
      skill: provenance.skill,
      elapsedMs: provenance.elapsedMs,
      elapsedLabel,
    },
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
