/**
 * project-progress.ts — v0.0.64: the honest 0–100% of a project.
 *
 * The denominator is the CURRENT plan's hops, not a wish. A new prompt that
 * adds hops makes the plan bigger and the % can go DOWN — that is the truth,
 * and the UI says "of the current plan". Per-god bars use that god's own hops.
 * The size strip (delivered artifacts) is how the project visibly grows.
 *
 * Pure + deterministic: no LLM, no tokens, no guesses. A running hop is
 * reported as `running`, never as completed.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { readWalkLock } from './hop-runtime/walk-lock';

export interface GodProgress {
  god: string;
  completed: number;
  total: number;
  running: number;
  parked: number;
  pct: number;
}

export interface ProjectProgress {
  ok: boolean;
  slug: string;
  lane: string;
  overall: { pct: number; completed: number; total: number; running: number; interrupted: number; parked: number };
  perGod: GodProgress[];
  size: { artifacts: number; plannedArtifacts: number; hops: number };
  updatedAt: string;
  note?: string;
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return fallback; }
}

export function computeProjectProgress(laneRoot: string, slug = path.basename(laneRoot)): ProjectProgress {
  const plan = readJson<any>(path.join(laneRoot, 'dispatch-plan.json'), { hops: [] });
  const state = readJson<any>(path.join(laneRoot, '.olympus-hop-state.json'), { completed: [], inFlight: [], parked: null });
  const hops: any[] = Array.isArray(plan?.hops) ? plan.hops : [];
  const completed = new Set<string>(Array.isArray(state?.completed) ? state.completed.map(String) : []);
  const inFlight = new Set<string>(Array.isArray(state?.inFlight) ? state.inFlight.map((f: any) => String(f?.hopId)) : []);
  const parkedId = state?.parked?.hopId ? String(state.parked.hopId) : null;
  // v0.0.64 — a dead walker is NOT running: the lock is the liveness proof.
  const lock = readWalkLock(laneRoot);
  const live = Boolean(lock.holder && lock.alive);

  const byGod = new Map<string, { completed: number; total: number; running: number; parked: number }>();
  let plannedArtifacts = 0;
  let artifacts = 0;
  for (const h of hops) {
    const god = String(h?.god || 'apollo').toLowerCase();
    const row = byGod.get(god) ?? { completed: 0, total: 0, running: 0, parked: 0 };
    row.total += 1;
    if (completed.has(String(h?.id))) row.completed += 1;
    else if (inFlight.has(String(h?.id))) { if (live) row.running += 1; }
    if (parkedId && parkedId === String(h?.id)) row.parked += 1;
    byGod.set(god, row);
    for (const a of Array.isArray(h?.artifacts) ? h.artifacts : []) {
      plannedArtifacts += 1;
      try { if (fs.existsSync(path.join(laneRoot, String(a)))) artifacts += 1; } catch { /* unreadable */ }
    }
  }

  const total = hops.length;
  const done = hops.filter((h) => completed.has(String(h?.id))).length;
  const inFlightCount = hops.filter((h) => !completed.has(String(h?.id)) && inFlight.has(String(h?.id))).length;
  const running = live ? inFlightCount : 0;
  const interrupted = live ? 0 : inFlightCount;
  const parked = parkedId ? 1 : 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const perGod: GodProgress[] = [...byGod.entries()]
    .map(([god, r]) => ({ god, ...r, pct: r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total || a.god.localeCompare(b.god));

  return {
    ok: true,
    slug,
    lane: laneRoot,
    overall: { pct, completed: done, total, running, interrupted, parked },
    perGod,
    size: { artifacts, plannedArtifacts, hops: total },
    updatedAt: new Date().toISOString(),
    ...(total === 0 ? { note: 'no dispatch plan on disk — the project has no campaign yet' } : {}),
  };
}
