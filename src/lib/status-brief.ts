/**
 * status-brief.ts — v0.1.0: "WHERE IS MY PROJECT?" in one honest block.
 *
 * The user had to read a 100-line hop log to know the project, generation,
 * current hop, park, files and next action. This composes the same disk truth
 * the Logs/Parthenon read into one compact brief used by:
 *   - /api/olympus/status-brief (the UI card),
 *   - the Apollo prompt marker (so his reply starts with the brief).
 *
 * Disk is truth; missing data is null/"—", never invented.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getProject } from './project-context';
import { getVaultRoot } from './vault-root';
import { loadHopState } from './hop-runtime/hop-state';
import { readPlanFile, planPath } from './hop-runtime/plan-generation';
import { buildCampaignHealth } from './campaign-health';
import { readWalkLock } from './hop-runtime/walk-lock';

export interface StatusBrief {
  project: string | null;
  lane: string | null;
  generation: number | null;
  completed: number;
  total: number;
  verdict: string;
  line: string;
  current: { hop: string; god?: string | null } | null;
  inFlight: string[];
  parked: { hopId: string; reason: string } | null;
  nextAction: string;
  previewUrl: string | null;
  design: { score: number | null; floor: number | null; target: number | null; source: string | null } | null;
  liveWalk: boolean;
  updatedAt: string;
}

const CACHE_MS = 8_000;
let cache: { at: number; key: string; brief: StatusBrief } | null = null;

function activeSlug(): string | null {
  try {
    const file = path.join(process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'active-project.json');
    const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return typeof d?.slug === 'string' && d.slug ? d.slug : null;
  } catch { return null; }
}

function readDesign(lane: string) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(lane, 'design-review.json'), 'utf-8'));
    return {
      score: typeof raw?.overall === 'number' ? raw.overall : null,
      floor: typeof raw?.floor === 'number' ? raw.floor : null,
      target: typeof raw?.target === 'number' ? raw.target : null,
      source: 'design-review.json',
    };
  } catch {
    return { score: null, floor: null, target: null, source: null };
  }
}

export function buildStatusBrief(slugArg?: string | null): StatusBrief {
  const slug = String(slugArg || activeSlug() || '').trim() || null;
  const project = slug ? getProject(slug) : null;
  const lane = project?.path || (slug ? path.join(getVaultRoot(), '02_Projects', slug) : null);
  const key = `${slug || '-'}|${lane || '-'}`;
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.brief;

  let plan: any = null;
  let state: any = null;
  let health: any = null;
  let lockAlive = false;
  if (lane) {
    try { plan = readPlanFile(planPath(lane)); } catch { plan = null; }
    try { state = loadHopState(lane); } catch { state = null; }
    try { health = buildCampaignHealth(lane); } catch { health = null; }
    try { lockAlive = Boolean(readWalkLock(lane).alive); } catch { lockAlive = false; }
  }
  const planIds = new Set<string>(Array.isArray(plan?.hops) ? plan.hops.map((h: any) => String(h?.id ?? '')).filter(Boolean) : []);
  const completed = (Array.isArray(state?.completed) ? state.completed : []).filter((id: string) => planIds.size === 0 || planIds.has(id)).length;
  const total = planIds.size;
  const inFlightRows = Array.isArray(state?.inFlight) ? state.inFlight : [];
  const inFlight = inFlightRows.map((h: any) => String(h?.hopId ?? '')).filter(Boolean);
  const parked = state?.parked ? { hopId: String(state.parked.hopId ?? '?'), reason: String(state.parked.reason ?? 'unknown') } : null;
  const current = inFlight.length
    ? { hop: inFlight[0], god: inFlightRows[0]?.god ? String(inFlightRows[0].god) : null }
    : parked
      ? { hop: parked.hopId, god: null }
      : null;
  const generation = Number.isFinite(Number(plan?.generation)) ? Number(plan.generation) : null;
  const previewUrl = project?.livePreviewPort ? `http://127.0.0.1:${project.livePreviewPort}` : null;
  const design = lane ? readDesign(lane) : null;
  const verdict = health?.verdict || (parked ? 'BLOCKED' : lockAlive ? 'RUNNING' : total > 0 && completed >= total ? 'DONE' : 'IDLE');
  const nextAction = parked
    ? `Resume/replan at ${parked.hopId} (${parked.reason})`
    : inFlight.length
      ? `Watch ${inFlight[0]} — the walker owns the lane`
      : total > 0 && completed >= total
        ? 'Generation complete — stage/apply the next generation'
        : total === 0
          ? 'No plan — ask Apollo to plan the project'
          : 'Start/resume the walk';
  const line = [
    slug ? `Project ${slug}` : 'No project',
    generation != null ? `gen ${generation}` : 'gen —',
    total > 0 ? `${completed}/${total} hops` : 'no plan',
    current ? `now ${current.hop}${current.god ? ` (${current.god})` : ''}` : 'no hop in flight',
    parked ? `PARKED ${parked.hopId}: ${parked.reason}` : 'no park',
    design?.score != null ? `design ${design.score}${design.target != null ? `/${design.target}` : ''}` : null,
  ].filter(Boolean).join(' · ');
  const brief: StatusBrief = {
    project: slug,
    lane,
    generation,
    completed,
    total,
    verdict,
    line,
    current,
    inFlight,
    parked,
    nextAction,
    previewUrl,
    design,
    liveWalk: lockAlive || inFlight.length > 0,
    updatedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), key, brief };
  return brief;
}

/** The marker Apollo receives at the top of his next turn. */
export function statusBriefMarker(slugArg?: string | null): string {
  const b = buildStatusBrief(slugArg);
  if (!b.project && !b.lane) return '';
  return [
    '[OLYMPUS-PROJECT STATUS — authoritative; read from disk]',
    `Project: ${b.project ?? '—'} · generation ${b.generation ?? '—'} · ${b.completed}/${b.total || '—'} hops · verdict ${b.verdict}`,
    `Current: ${b.current ? `${b.current.hop}${b.current.god ? ` (${b.current.god})` : ''}` : '—'}`,
    `Parked: ${b.parked ? `${b.parked.hopId} — ${b.parked.reason}` : 'none'}`,
    `Next: ${b.nextAction}`,
    `Files: lane ${b.lane ?? '—'} · preview ${b.previewUrl ?? '—'}${b.design?.score != null ? ` · design ${b.design.score}${b.design.floor != null ? ` (floor ${b.design.floor}` : ''}${b.design.target != null ? `, target ${b.design.target})` : b.design.floor != null ? ')' : ''}` : ''}`,
    'Answer with a short WHERE / WHAT HAPPENED / NEXT / NEED YOU / FILES block first, then continue the task. Never make the user read the hop log to find the project.',
    '',
  ].join('\n');
}
