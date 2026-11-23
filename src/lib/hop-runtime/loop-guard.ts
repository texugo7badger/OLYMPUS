/**
 * loop-guard.ts — v0.0.98-9.1: the same-hop loop breaker.
 *
 * THE SPECIMEN (AIME qa-glow-local, 2026-11-22): the QA correctly failed 16
 * times between 03:52 and 16:15 across 9 campaign ids. Every new walk reset
 * the per-campaign recovery budget, so the warden kept re-running the same
 * hop all night and all morning. A campaign id is not a hop's memory.
 *
 * The guard is per lane + plan generation + hop: after TWO failed attempts
 * with no new generation, the hop is BLOCKED; the post-run/warden must not
 * start another walk for it. A new plan generation (a fix hop) starts a
 * fresh count; the user's explicit Continue on an unchanged plan is refused.
 *
 * It also seeds from the telemetry when the state predates the guard, so the
 * live qa-glow-local specimen is blocked immediately after this update.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { classifyParkReason } from './failure-class';

export interface LoopEntry {
  generation: number;
  failures: number;
  lastClass: string | null;
  lastAt: string;
  blockedAt: string | null;
  /** v0.0.98-10 — the one notification/decision for this block. */
  notifiedAt: string | null;
}

interface LoopFile {
  version: 1;
  hops: Record<string, LoopEntry>;
  updatedAt: string;
}

export const LOOP_GUARD_FILENAME = '.olympus-loop-guard.json';
export const LOOP_FAILURE_LIMIT = 2;

/**
 * Classes that describe a HOP/PLAN defect, not a transient lane event.
 * A transport disconnect or a timeout is recovered by the lane failover and
 * bounded by the recovery ledger; counting it here would block a healthy hop
 * on two unlucky network drops. The classes below are the ones a blind retry
 * reproduces byte-for-byte — the qa-glow-local specimen (tool-budget +
 * verify-failed) is the reference.
 */
export const LOOP_CLASSES = new Set([
  'tool-budget',
  'verify-failed',
  'script',
  'retry-exhausted',
  'design-evidence-missing',
  'unknown',
]);

export function isLoopClass(failureClass: string | null | undefined): boolean {
  return LOOP_CLASSES.has(String(failureClass ?? '').trim());
}

export function loopGuardPath(laneRoot: string): string {
  return path.join(laneRoot, LOOP_GUARD_FILENAME);
}

function read(laneRoot: string): LoopFile {
  try {
    const raw = JSON.parse(fs.readFileSync(loopGuardPath(laneRoot), 'utf-8'));
    return {
      version: 1,
      hops: raw && typeof raw.hops === 'object' ? raw.hops : {},
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    };
  } catch {
    return { version: 1, hops: {}, updatedAt: new Date().toISOString() };
  }
}

function write(laneRoot: string, file: LoopFile): void {
  try {
    fs.mkdirSync(path.dirname(loopGuardPath(laneRoot)), { recursive: true });
    fs.writeFileSync(loopGuardPath(laneRoot), JSON.stringify({ ...file, updatedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  } catch { /* evidence, never a walk blocker */ }
}

/** Record one failed attempt; the second one blocks the hop for this generation. */
export function noteLoopFailure(laneRoot: string, hopId: string, generation: number, failureClass: string | null): LoopEntry {
  const file = read(laneRoot);
  const now = new Date().toISOString();
  const prev = file.hops[hopId];
  const sameGen = prev && prev.generation === generation ? prev : null;
  const entry: LoopEntry = {
    generation: Number(generation) || 0,
    failures: (sameGen?.failures ?? 0) + 1,
    lastClass: failureClass ?? 'unknown',
    lastAt: now,
    blockedAt: sameGen?.blockedAt ?? null,
    notifiedAt: sameGen?.notifiedAt ?? null,
  };
  if (entry.failures >= LOOP_FAILURE_LIMIT) entry.blockedAt = now;
  file.hops[hopId] = entry;
  // Keep at most 40 entries (oldest by lastAt) so the file never grows.
  const entries = Object.entries(file.hops).sort((a, b) => String(a[1].lastAt).localeCompare(String(b[1].lastAt)));
  for (const [id] of entries.slice(0, Math.max(0, entries.length - 40))) delete file.hops[id];
  write(laneRoot, file);
  return entry;
}

/**
 * Block a hop immediately (the QA repair cap, or a caller that already has
 * the evidence). Idempotent: the latest timestamp wins, the count never
 * resets by accident.
 */
export function blockLoopHop(laneRoot: string, hopId: string, generation: number, failureClass: string | null, failures = LOOP_FAILURE_LIMIT): LoopEntry {
  const file = read(laneRoot);
  const now = new Date().toISOString();
  const prev = file.hops[hopId];
  const sameGen = prev && prev.generation === generation ? prev : null;
  const entry: LoopEntry = {
    generation: Number(generation) || 0,
    failures: Math.max(failures, sameGen?.failures ?? 0, LOOP_FAILURE_LIMIT),
    lastClass: failureClass ?? sameGen?.lastClass ?? 'unknown',
    lastAt: now,
    blockedAt: now,
    notifiedAt: sameGen?.notifiedAt ?? null,
  };
  file.hops[hopId] = entry;
  write(laneRoot, file);
  return entry;
}

/** A hop completed after a retry: it is no longer a loop risk. */
export function clearLoopHop(laneRoot: string, hopId: string): void {
  const file = read(laneRoot);
  if (!file.hops[hopId]) return;
  delete file.hops[hopId];
  write(laneRoot, file);
}

/**
 * Claim the one notification/decision for a blocked hop in this generation.
 * Returns true only for the caller that wins the claim; repeated walks/ticks
 * see `false` and stay silent. The state itself is still updated every time.
 */
export function markLoopNotified(laneRoot: string, hopId: string, generation: number): boolean {
  const file = read(laneRoot);
  const entry = file.hops[hopId];
  if (!entry || Number(entry.generation) !== Number(generation) || !entry.blockedAt) return false;
  if (entry.notifiedAt) return false;
  entry.notifiedAt = new Date().toISOString();
  write(laneRoot, file);
  return true;
}

/** Blocked hops for the CURRENT plan generation. Old generations are ignored. */
export function blockedLoopHops(laneRoot: string, generation: number): Array<{ hopId: string; entry: LoopEntry }> {
  const file = read(laneRoot);
  return Object.entries(file.hops)
    .filter(([, e]) => e && Number(e.generation) === Number(generation) && Boolean(e.blockedAt))
    .map(([hopId, entry]) => ({ hopId, entry }))
    .sort((a, b) => String(b.entry.lastAt).localeCompare(String(a.entry.lastAt)));
}

/**
 * Seed from the telemetry when the state predates the guard. Counts parked
 * rows for each hop since the current plan was created; if the latest row is
 * parked and there are >=2, writes a blocked entry. This blocks the live
 * qa-glow-local (16 attempts) on the first boot after the update.
 */
export function seedLoopGuardFromTelemetry(laneRoot: string, generation: number, planCreatedAt: string | null | undefined): Array<{ hopId: string; entry: LoopEntry }> {
  const since = Date.parse(String(planCreatedAt ?? ''));
  if (!Number.isFinite(since)) return [];
  let rows: any[] = [];
  try {
    const file = path.join(laneRoot, '.olympus-hop-telemetry.jsonl');
    rows = fs.readFileSync(file, 'utf-8').trim().split('\n')
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
  const byHop = new Map<string, any[]>();
  for (const r of rows) {
    const ts = Date.parse(String(r?.ts ?? ''));
    if (!Number.isFinite(ts) || ts < since) continue;
    const hop = String(r?.hop ?? '');
    if (!hop) continue;
    const list = byHop.get(hop) ?? [];
    list.push(r);
    byHop.set(hop, list);
  }
  const file = read(laneRoot);
  let changed = false;
  for (const [hopId, list] of byHop) {
    const parked = list.filter((r) => {
      if (!String(r?.status ?? '').startsWith('parked')) return false;
      const cls = classifyParkReason(String(r?.status ?? ''), String(r?.error ?? ''), r?.errorClass ?? r?.failureClass ?? null);
      return isLoopClass(cls);
    });
    if (parked.length < LOOP_FAILURE_LIMIT) continue;
    const latest = [...list].sort((a, b) => String(a.ts).localeCompare(String(b.ts))).at(-1);
    if (!String(latest?.status ?? '').startsWith('parked')) continue;
    if (file.hops[hopId]?.generation === generation && file.hops[hopId]?.blockedAt) continue;
    const latestClass = classifyParkReason(
      String(latest?.status ?? ''),
      String(latest?.error ?? ''),
      latest?.errorClass ?? latest?.failureClass ?? null,
    );
    file.hops[hopId] = {
      generation: Number(generation) || 0,
      failures: parked.length,
      lastClass: latestClass,
      lastAt: String(latest?.ts ?? new Date().toISOString()),
      blockedAt: String(latest?.ts ?? new Date().toISOString()),
      notifiedAt: null,
    };
    changed = true;
  }
  if (changed) write(laneRoot, file);
  return blockedLoopHops(laneRoot, generation);
}

/** The human fixed the plan/QA and explicitly wants a fresh count. */
export function clearLoopGuard(laneRoot: string, hopId?: string): void {
  const file = read(laneRoot);
  if (hopId) delete file.hops[hopId];
  else file.hops = {};
  write(laneRoot, file);
}
