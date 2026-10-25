/**
 * lane-health.ts — THE LIVE HEALTH OF EVERY MODEL LANE (2026-10-24).
 *
 * THE SPECIMEN (AIME, 2026-10-24): the applied strategy was `go-budget`, the
 * GO plan's MONTHLY quota was spent, and every hop failed with
 *
 *     {"type":"error","error":{"type":"provider.quota",
 *      "message":"Go usage limit exceeded","retryAfterMs":392658000}}
 *
 * Every lane was dead, nothing knew it, the roster kept dispatching into the
 * void, and each failure surfaced (wrongly) as `exit 1`. The plan had a
 * failover chain on PAPER (the free-hybrid roster order) but it was resolved
 * once at APPLY time — never at RUNTIME, where the failure actually happens.
 *
 * This module is the missing piece: a small, durable, side-effect-cheap
 * registry of what each lane can actually do RIGHT NOW.
 *
 *   - written by the dispatcher (success → alive, provider error → the class)
 *   - read by the dispatcher (skip a lane whose quota/route is dead)
 *   - read by the UI (/api/olympus/run-state → the honest lane banner)
 *
 * Persisted at ~/.olympus/lane-health.json so a restart does not re-learn a
 * monthly quota the hard way.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

export type LaneStatus = 'alive' | 'quota' | 'no-route' | 'rate-limit' | 'auth' | 'unknown';

export interface LaneHealthEntry {
  status: LaneStatus;
  /** Last time we learned anything about this lane (epoch ms). */
  at: number;
  /** The provider's own words (trimmed) — the honest cause. */
  error?: string;
  /** The provider error class (`provider.quota`, `provider.no-route`, …). */
  errorClass?: string;
  /** Epoch ms until which the lane is known-dead (from retryAfterMs). */
  retryUntil?: number;
  /** Last successful probe/dispatch latency, when known. */
  latencyMs?: number;
}

export interface LaneHealthFile {
  version: 1;
  lanes: Record<string, LaneHealthEntry>;
  updatedAt: string;
}

/** How long an `alive` reading is trusted before it is considered stale. */
export const ALIVE_TTL_MS = 5 * 60_000;
/** Retry hint used when the provider sends `retryAfterMs` but we cannot trust it. */
export const DEFAULT_DEAD_TTL_MS = 30 * 60_000;
/** Hard cap: never trust a "dead until" beyond this (a monthly quota is real). */
export const MAX_DEAD_TTL_MS = 31 * 24 * 60 * 60_000;

export function laneHealthPath(override?: string): string {
  return override ?? path.join(os.homedir(), '.olympus', 'lane-health.json');
}

/* ------------------------------------------------------------------ */
/* Load / save — failure is ALWAYS non-fatal (a corrupt file = no data). */
/* ------------------------------------------------------------------ */

export function readLaneHealth(filePath = laneHealthPath()): LaneHealthFile {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (raw && typeof raw === 'object' && raw.lanes && typeof raw.lanes === 'object') {
      return { version: 1, lanes: raw.lanes, updatedAt: String(raw.updatedAt ?? '') };
    }
  } catch { /* absent or corrupt — an empty registry is the honest answer */ }
  return { version: 1, lanes: {}, updatedAt: '' };
}

function writeLaneHealth(file: LaneHealthFile, filePath = laneHealthPath()): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch { /* telemetry must never break a dispatch */ }
}

/* ------------------------------------------------------------------ */
/* The classifier — a provider error class → a lane status.           */
/* ------------------------------------------------------------------ */

/**
 * The provider error classes that mean "this LANE is dead for now" —
 * retrying them is pure waste:
 *
 *   - `provider.quota`       — the plan's monthly/daily budget is spent (the
 *                              provider says WHEN it returns: retryAfterMs,
 *                              measured in DAYS for a monthly cap — the GO
 *                              specimen: 392,658,000 ms ≈ 4.5 days).
 *   - `provider.free-limit`  — the free window is spent (Zen free lanes).
 *   - `provider.no-route`    — the model id does not exist on that provider.
 *   - `provider.unauthorized`/`auth` — the key is missing/revoked.
 *
 * Lives here (not in the walker) so BOTH the hop dispatcher and the chat
 * session can classify without an import cycle.
 */
export function isLaneDeadClass(cls: string | null | undefined): boolean {
  if (!cls) return false;
  const c = cls.toLowerCase();
  return (
    c.includes('quota')
    || c.includes('free-limit')
    || c.includes('free_limit')
    || c.includes('no-route')
    || c.includes('no_route')
    || c.includes('model-not-found')
    || c.includes('unauthorized')
    || c.includes('auth')
    // 402 Payment Required — the model requires credits the account lacks
    // (e.g. opencode's muse-wonder-1.0). Treat as a dead lane so we failover
    // instead of retrying into the void.
    || c.includes('payment')
    || c.includes('402')
    || c.includes('muse-wonder')
  );
}

export function statusFromErrorClass(cls: string | null | undefined): LaneStatus {
  const c = String(cls ?? '').toLowerCase();
  if (!c) return 'unknown';
  if (c.includes('quota') || c.includes('free-limit') || c.includes('free_limit') || c.includes('limit')
    || c.includes('payment') || c.includes('402') || c.includes('muse-wonder')) return 'quota';
  if (c.includes('no-route') || c.includes('no_route') || c.includes('not-found') || c.includes('model-not-found')) return 'no-route';
  if (c.includes('auth') || c.includes('unauthorized') || c.includes('forbidden')) return 'auth';
  if (c.includes('rate')) return 'rate-limit';
  return 'unknown';
}

/* ------------------------------------------------------------------ */
/* Writers                                                            */
/* ------------------------------------------------------------------ */

export function markLaneAlive(lane: string, latencyMs?: number, filePath = laneHealthPath()): void {
  if (!lane) return;
  const file = readLaneHealth(filePath);
  file.lanes[lane] = { status: 'alive', at: Date.now(), ...(latencyMs ? { latencyMs } : {}) };
  file.updatedAt = new Date().toISOString();
  writeLaneHealth(file, filePath);
}

export function markLaneDead(
  lane: string,
  errorClass: string | null | undefined,
  retryAfterMs?: number | null,
  error?: string,
  filePath = laneHealthPath(),
): LaneHealthEntry | null {
  if (!lane) return null;
  const status = statusFromErrorClass(errorClass);
  if (status === 'unknown') return null; // an unknown class is not proof of death
  const now = Date.now();
  const ttl = Math.min(
    Math.max(Number(retryAfterMs ?? 0) || DEFAULT_DEAD_TTL_MS, 60_000),
    MAX_DEAD_TTL_MS,
  );
  const entry: LaneHealthEntry = {
    status,
    at: now,
    errorClass: errorClass ?? undefined,
    error: error ? error.slice(0, 500) : undefined,
    retryUntil: now + ttl,
  };
  const file = readLaneHealth(filePath);
  file.lanes[lane] = entry;
  file.updatedAt = new Date().toISOString();
  writeLaneHealth(file, filePath);
  return entry;
}

/* ------------------------------------------------------------------ */
/* Readers                                                            */
/* ------------------------------------------------------------------ */

/** Is this lane worth trying? `unknown` and stale-`alive` are both YES —
 *  optimism is correct when we have no recent evidence. Only a live
 *  `retryUntil` in the future, or a route/auth death, blocks a lane. */
export function isLaneAvailable(
  lane: string,
  entries: Record<string, LaneHealthEntry> = readLaneHealth().lanes,
  now = Date.now(),
): boolean {
  const e = entries[lane];
  if (!e) return true;
  if (e.status === 'alive') return true; // even if old: an old success is not a failure
  if (e.retryUntil && e.retryUntil > now) return false;
  // A route/auth death has no natural expiry — it needs a config change.
  // Failing over forever on it would hide a typo; allow a retry after the
  // default dead TTL so a fixed id recovers without a restart.
  if (e.status === 'no-route' || e.status === 'auth') {
    return now - e.at > DEFAULT_DEAD_TTL_MS;
  }
  return true;
}

/** Every lane currently blocked, with the honest cause — the banner data. */
export function blockedLanes(
  entries: Record<string, LaneHealthEntry> = readLaneHealth().lanes,
  now = Date.now(),
): Array<{ lane: string } & LaneHealthEntry> {
  return Object.entries(entries)
    .filter(([lane, e]) => !isLaneAvailable(lane, entries, now) && e)
    .map(([lane, e]) => ({ lane, ...e }));
}

/**
 * The fallback chain for a god: the applied lane FIRST (the one opencode.json
 * carries — the user's strategy), then every healthier lane from that god's
 * roster in task-fit order. Deduped, dead lanes skipped.
 *
 * `roster` is injected (the caller passes FREE_HYBRID_ROSTER[god]) so this
 * module stays dependency-free and fixture-friendly.
 */
export function laneChain(
  appliedLane: string,
  roster: string[] = [],
  entries: Record<string, LaneHealthEntry> = readLaneHealth().lanes,
  now = Date.now(),
): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  for (const lane of [appliedLane, ...roster]) {
    if (!lane || seen.has(lane)) continue;
    seen.add(lane);
    if (!isLaneAvailable(lane, entries, now)) continue;
    chain.push(lane);
  }
  // Never return an empty chain: if EVERY lane is marked dead, try the
  // applied lane anyway (a stale "dead" must not become a permanent outage —
  // the provider may have restored the quota).
  if (chain.length === 0 && appliedLane) chain.push(appliedLane);
  return chain;
}
