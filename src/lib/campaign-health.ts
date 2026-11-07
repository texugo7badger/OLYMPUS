/**
 * campaign-health.ts — v0.0.88: one honest answer to "está indo bem?".
 *
 * The user had to read a 100-line log to discover that a tool-budget park on
 * one Athena hop had blocked a 21-hop chain. This module turns the same disk
 * truth into one verdict + one sentence + the three reasons that matter:
 *
 *   HEALTHY     running, no park, no dead lane, no plan drift
 *   DEGRADED    running but a park/lane/definition issue is being recovered
 *   BLOCKED     parked with a retry available (Atlas is on it) or dependencies
 *   NEEDS-YOU   parked and Atlas's policy says ask the user (key/route/unknown)
 *   PAUSED      no live walk, no park, pending hops (waiting for a resume)
 *   DONE        every hop in this generation completed
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { readWalkLock } from './hop-runtime/walk-lock';
import { loadHopState } from './hop-runtime/hop-state';
import { readPlanFile, planPath, readFrozenPlan, readNextPlan, computeHopHashes } from './hop-runtime/plan-generation';
import { patrolLane } from './atlas-patrol';
import { readRecoveries } from './hop-runtime/recovery';
import { blockedLanes } from './lane-health';

export type CampaignVerdict = 'HEALTHY' | 'DEGRADED' | 'BLOCKED' | 'NEEDS-YOU' | 'PAUSED' | 'DONE';

export interface CampaignHealth {
  verdict: CampaignVerdict;
  line: string;
  generation: number;
  completed: number;
  total: number;
  lifetimeCompleted: number;
  running: number;
  parked: { hopId: string; reason: string; errorClass?: string | null } | null;
  parks: number;
  lanesDead: number;
  nextPlan: { added: number; removed: number; changed: number } | null;
  lastRecovery: string | null;
  etaMs: number | null;
  reasons: string[];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length / 2))];
}

export function buildCampaignHealth(laneRoot: string, opts: { etaMs?: number | null } = {}): CampaignHealth {
  try {
    const plan = readFrozenPlan(laneRoot) ?? readPlanFile(planPath(laneRoot));
    if (!plan || !Array.isArray(plan.hops)) {
      return { verdict: 'PAUSED', line: 'No plan on this lane.', generation: 0, completed: 0, total: 0, lifetimeCompleted: 0, running: 0, parked: null, parks: 0, lanesDead: blockedLanes().length, nextPlan: null, lastRecovery: null, etaMs: null, reasons: ['no-plan'] };
    }
    const lock = readWalkLock(laneRoot);
    const state = loadHopState(laneRoot);
    const ids = new Set(plan.hops.map((h) => h.id));
    const completed = (state?.completed ?? []).filter((id) => ids.has(id));
    const pending = plan.hops.filter((h) => !completed.includes(h.id));
    const liveWalk = Boolean(lock.holder && lock.alive);
    const running = liveWalk ? (state?.inFlight?.length ?? 0) : 0;
    const parked = state?.parked ?? null;
    // v0.0.88 — a live inFlight record outranks a stale park (the tasks-sheet
    // rule, now shared): a retried hop is running, not blocked. A live walk
    // with a park and NO in-flight hop stays BLOCKED/NEEDS-YOU.
    const stalePark = Boolean(parked && liveWalk && running > 0);
    const activePark = stalePark ? null : parked;
    const patrol = (() => { try { return patrolLane(laneRoot); } catch { return null; } })();
    const finding = patrol?.parked[0] ?? patrol?.stuck[0] ?? null;
    const lanesDead = blockedLanes().length;
    const next = readNextPlan(laneRoot);
    const recs = readRecoveries(laneRoot);
    const lastRecovery = recs.length ? `${recs[recs.length - 1].hopId}: ${recs[recs.length - 1].kind}` : null;
    let etaMs = opts.etaMs ?? null;
    if (etaMs == null) {
      const byGod = new Map<string, number[]>();
      try {
        const rows = fs.readFileSync(path.join(laneRoot, '.olympus-hop-telemetry.jsonl'), 'utf-8').trim().split('\n')
          .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
          .filter((r) => r.status === 'completed' && typeof r.durationMs === 'number' && r.god);
        for (const r of rows) {
          if (!byGod.has(r.god)) byGod.set(r.god, []);
          byGod.get(r.god)!.push(r.durationMs);
        }
      } catch { /* no telemetry */ }
      const perGod = new Map<string, number>();
      for (const h of pending) perGod.set(String(h.god), (perGod.get(String(h.god)) ?? 0) + median(byGod.get(String(h.god)) ?? []));
      etaMs = Math.max(0, ...perGod.values());
    }
    const reasons: string[] = [];
    let verdict: CampaignVerdict = 'HEALTHY';
    if (pending.length === 0) {
      verdict = 'DONE';
      reasons.push('all hops completed in this generation');
    } else if (activePark) {
      reasons.push(`${activePark.hopId} parked (${activePark.reason}${activePark.errorClass ? `:${activePark.errorClass}` : ''})`);
      const decision = finding?.verdict ?? 'ask-user';
      verdict = decision === 'retry' || decision === 'replan' ? 'BLOCKED' : 'NEEDS-YOU';
      if (finding) reasons.push(`Atlas: ${finding.verdict} — ${finding.recommendation}`);
    } else if (stalePark) {
      // The walk is alive and a hop is running: the recorded park is from an
      // earlier attempt. DEGRADED, never BLOCKED — the user must see motion.
      verdict = 'DEGRADED';
      reasons.push(`${parked!.hopId} parked (${parked!.reason}${parked!.errorClass ? `:${parked!.errorClass}` : ''}) — a live walk is running; Atlas is recovering`);
      if (finding) reasons.push(`Atlas: ${finding.verdict} — ${finding.recommendation}`);
    } else if (lanesDead > 0) {
      verdict = 'DEGRADED';
      reasons.push(`${lanesDead} dead lane(s)`);
    } else if (next.plan && next.diff && (next.diff.added.length + next.diff.removed.length + next.diff.changed.length) > 0) {
      verdict = 'DEGRADED';
      reasons.push(`next generation staged: +${next.diff.added.length}/-${next.diff.removed.length}/~${next.diff.changed.length}`);
    } else if (!lock.holder || !lock.alive) {
      verdict = 'PAUSED';
      reasons.push(`${pending.length} hop(s) pending — no live walk; resume to continue`);
    } else {
      reasons.push(`${pending.length} hop(s) pending, ${running} running`);
    }
    if (recs.length) reasons.push(`last recovery: ${lastRecovery}`);
    const eta = etaMs && etaMs > 0 ? ` · ~${Math.round(etaMs / 60_000)} min left` : '';
    const line = `${verdict} · gen ${plan.generation ?? 1} · ${completed.length}/${plan.hops.length} hops${running ? ` · ${running} running` : ''}${parked ? ` · parked ${parked.hopId}` : ''}${eta}`;
    return {
      verdict, line, generation: plan.generation ?? 1,
      completed: completed.length, total: plan.hops.length,
      lifetimeCompleted: state?.completed?.length ?? 0,
      running,
      parked: parked ? { hopId: parked.hopId, reason: parked.reason, errorClass: parked.errorClass ?? null } : null,
      parks: patrol?.parked.length ?? 0,
      lanesDead,
      nextPlan: next.diff ? { added: next.diff.added.length, removed: next.diff.removed.length, changed: next.diff.changed.length } : null,
      lastRecovery, etaMs, reasons,
    };
  } catch {
    return { verdict: 'PAUSED', line: 'Campaign state unreadable.', generation: 0, completed: 0, total: 0, lifetimeCompleted: 0, running: 0, parked: null, parks: 0, lanesDead: 0, nextPlan: null, lastRecovery: null, etaMs: null, reasons: ['unreadable'] };
  }
}

/** The version/status line used by the phone and the status bar. */
export function campaignHealthLine(laneRoot: string, opts: { etaMs?: number | null } = {}): string {
  return buildCampaignHealth(laneRoot, opts).line;
}
