/**
 * project-briefing.ts — v0.0.85: the phone's living project document.
 *
 * The widget used to show counters. The user asked for a readable briefing:
 * what the project is, what is being built now, which hop just settled, what
 * parked and why, and which hops come next. This module composes that from
 * DISK TRUTH only — `dispatch-plan.json`, `.olympus-hop-state.json`, the hop
 * telemetry and the project note. No LLM, no tokens, no invented progress.
 *
 * The UI localizes the structured result; the server never guesses a
 * language. Screenshots are metadata here (the capture route owns the bytes).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getActiveProjectSlug, getProject, type ProjectNote } from './project-context';
import { computeProjectProgress, type ProjectProgress } from './project-progress';
import { readHopTelemetry, type HopTelemetryRow } from './hop-runtime/walker';
import { balancePlan } from './hop-runtime/plan-balance';
import { readWalkLock } from './hop-runtime/walk-lock';
import { workspaceLaneDir } from './opencode-spawn';

export type HopBriefStatus = 'completed' | 'running' | 'parked' | 'pending' | 'lost';

export interface BriefHop {
  id: string;
  god: string;
  label: string;
  status: HopBriefStatus;
  artifacts: string[];
}

export interface BriefEvent {
  hopId: string;
  god: string;
  status: 'completed' | 'parked';
  /** The raw telemetry status (`parked-dispatch-failed`, …). */
  rawStatus: string;
  ts: string;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  /** v0.0.87 — measured output tok/s for the settled hop. */
  tokensPerSec?: number | null;
}

export interface BriefScreenshot {
  viewport: 'mobile' | 'desktop';
  available: boolean;
  capturedAt: string | null;
  bytes: number | null;
}

export interface ProjectBriefing {
  ok: boolean;
  error?: string;
  slug: string;
  name: string;
  description: string;
  lane: string;
  updatedAt: string;
  progress: ProjectProgress | null;
  campaign: { state: string; verdict: string; campaignId: string | null; startedAt: string | null };
  current: BriefHop[];
  parked: { hopId: string; label: string; god: string; reason: string; error: string | null; ts: string } | null;
  recent: BriefEvent[];
  next: BriefHop[];
  plan: BriefHop[];
  screenshots: BriefScreenshot[];
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return fallback; }
}

/** A human label derived from the hop id; the id itself stays visible. */
export function hopLabel(id: string): string {
  return String(id || '')
    .replace(/^[a-z]\d+[a-z]?[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase()) || String(id || '');
}

function laneCandidates(project: ProjectNote | null, slug: string): string[] {
  const out: string[] = [];
  if (project?.path) out.push(project.path);
  try { out.push(path.join(workspaceLaneDir(), slug)); } catch { /* no workspace */ }
  out.push(path.join(os.homedir(), 'OLYMPUS-VAULT', '02_Projects', slug));
  return [...new Set(out.filter(Boolean))];
}

function screenshotMeta(slug: string): BriefScreenshot[] {
  const dir = path.join(process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'screenshots', slug);
  return (['mobile', 'desktop'] as const).map((viewport) => {
    const file = path.join(dir, `${viewport}.png`);
    try {
      const stat = fs.statSync(file);
      return { viewport, available: stat.size > 0, capturedAt: stat.mtime.toISOString(), bytes: stat.size };
    } catch {
      return { viewport, available: false, capturedAt: null, bytes: null };
    }
  });
}

function telemetryEvents(rows: HopTelemetryRow[]): BriefEvent[] {
  return rows
    .filter((row) => row && typeof row.hop === 'string' && typeof row.ts === 'string')
    .slice(-30)
    .reverse()
    .map((row) => ({
      hopId: row.hop,
      god: String(row.god || 'apollo').toLowerCase(),
      status: String(row.status || '').startsWith('parked') ? 'parked' as const : 'completed' as const,
      rawStatus: String(row.status || 'completed'),
      ts: row.ts,
      durationMs: Number(row.durationMs) || 0,
      tokensIn: Number.isFinite(Number(row.tokensIn)) ? Number(row.tokensIn) : null,
      tokensOut: Number.isFinite(Number(row.tokensOut)) ? Number(row.tokensOut) : null,
      tokensPerSec: (() => {
        const out = Number(row.tokensOut) || 0;
        const ms = Number(row.durationMs) || 0;
        return out > 0 && ms > 0 ? out / (ms / 1000) : null;
      })(),
    }));
}

/** Pick the lane that actually carries the plan/state, never a dead note path. */
export function briefingLane(project: ProjectNote | null, slug: string): string {
  for (const lane of laneCandidates(project, slug)) {
    if (fs.existsSync(path.join(lane, 'dispatch-plan.json')) || fs.existsSync(path.join(lane, '.olympus-hop-state.json'))) {
      return lane;
    }
  }
  return project?.path || laneCandidates(project, slug)[0] || '';
}

export function computeProjectBriefing(slugInput?: string | null): ProjectBriefing {
  const slug = String(slugInput || getActiveProjectSlug() || '').trim();
  const empty: ProjectBriefing = {
    ok: false,
    slug,
    name: slug || 'OLYMPUS',
    description: '',
    lane: '',
    updatedAt: new Date().toISOString(),
    progress: null,
    campaign: { state: 'none', verdict: 'IDLE', campaignId: null, startedAt: null },
    current: [],
    parked: null,
    recent: [],
    next: [],
    plan: [],
    screenshots: [],
  };
  if (!slug) return { ...empty, error: 'no active project' };
  const project = getProject(slug);
  if (!project) return { ...empty, error: `project '${slug}' not found` };

  const lane = briefingLane(project, slug);
  if (!lane) return { ...empty, name: project.name, description: project.description || '', error: 'project has no lane on disk' };

  const planRaw = readJson<any>(path.join(lane, 'dispatch-plan.json'), { hops: [] });
  const state = readJson<any>(path.join(lane, '.olympus-hop-state.json'), { completed: [], inFlight: [], parked: null });
  const telemetry = (() => { try { return readHopTelemetry(lane); } catch { return []; } })();
  const progress = (() => { try { return computeProjectProgress(lane, slug); } catch { return null; } })();
  const lock = (() => { try { return readWalkLock(lane); } catch { return { holder: null, alive: false }; } })();
  const live = Boolean(lock.holder && lock.alive);
  const completed = new Set<string>(Array.isArray(state?.completed) ? state.completed.map(String) : []);
  const inFlightRows = Array.isArray(state?.inFlight) ? state.inFlight : [];
  const inFlight = new Map<string, any>(inFlightRows.map((row: any) => [String(row?.hopId), row]));
  const parkedId = state?.parked?.hopId ? String(state.parked.hopId) : null;
  // v0.0.86 — the executing god, not the declared one (the walker rebalances
  // in memory; the phone's briefing must name the god actually running).
  const balancedPlan = Array.isArray(planRaw?.hops) ? balancePlan(planRaw as any).plan : planRaw;
  const planHops: any[] = Array.isArray(balancedPlan?.hops) ? balancedPlan.hops : [];

  const plan: BriefHop[] = planHops.map((h) => {
    const id = String(h?.id || '');
    const status: HopBriefStatus = completed.has(id)
      ? 'completed'
      // v0.0.86 — a live retry outranks the stale park (the phone must not
      // say 'parked' while the god is running the hop).
      : inFlight.has(id) && live
        ? 'running'
        : parkedId === id
          ? 'parked'
          : inFlight.has(id)
            ? 'lost'
            : 'pending';
    return {
      id,
      god: String(h?.god || 'apollo').toLowerCase(),
      label: hopLabel(id),
      status,
      artifacts: Array.isArray(h?.artifacts) ? h.artifacts.map(String) : [],
    };
  });

  const planById = new Map(plan.map((h) => [h.id, h]));
  const current = plan.filter((h) => h.status === 'running' || h.status === 'lost').map((h) => {
    const row = inFlight.get(h.id);
    return {
      ...h,
      artifacts: Array.isArray(row?.artifacts) && row.artifacts.length > 0 ? row.artifacts.map(String) : h.artifacts,
    };
  });
  const parked = state?.parked?.hopId
    ? {
      hopId: String(state.parked.hopId),
      label: planById.get(String(state.parked.hopId))?.label || hopLabel(String(state.parked.hopId)),
      god: planById.get(String(state.parked.hopId))?.god || 'apollo',
      reason: String(state.parked.reason || 'parked'),
      error: typeof state.parked.error === 'string' ? state.parked.error.slice(0, 400) : null,
      ts: String(state.parked.ts || new Date().toISOString()),
    }
    : null;
  const next = plan.filter((h) => h.status === 'pending').slice(0, 6);
  const campaign = {
    state: live ? 'running' : parked ? 'parked' : current.length > 0 ? 'interrupted' : 'idle',
    verdict: live ? 'RUNNING' : parked ? 'PARKED' : current.length > 0 ? 'INTERRUPTED' : progress && progress.overall.total > 0 && progress.overall.completed >= progress.overall.total ? 'DONE' : 'IDLE',
    campaignId: state?.campaignId || lock.holder?.campaignId || null,
    startedAt: lock.holder?.startedAt || null,
  };

  return {
    ok: true,
    slug,
    name: project.name || slug,
    description: String(project.description || '').slice(0, 600),
    lane,
    updatedAt: new Date().toISOString(),
    progress,
    campaign,
    current,
    parked,
    recent: telemetryEvents(telemetry),
    next,
    plan,
    screenshots: screenshotMeta(slug),
  };
}
