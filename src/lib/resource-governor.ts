/**
 * resource-governor.ts — v0.0.39 (R39-01): admission control for the machine.
 *
 * OLYMPUS can spawn a chat server, a lane hop server, MCP fleets, a dev server
 * per project and a browser preview. Two campaigns plus a dev server on a
 * 16 GB laptop is how the app starts swapping. The governor reads the HOST's
 * own memory (not a guess), classifies the pressure and refuses a new heavy
 * workload when it would leave the machine below a safe floor.
 *
 * Read-only except for the explicit `reclaim` action in the route. Linux uses
 * /proc/meminfo + /proc/<pid>; other platforms fall back to os.freemem() and
 * skip the process census.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import os from 'node:os';
import fs from 'node:fs';

export type ResourceVerdict = 'green' | 'amber' | 'red';

export interface ResourceSnapshot {
  /** Wall-clock sample time (ISO). */
  at: string;
  totalMb: number;
  availableMb: number;
  usedPct: number;
  load1: number;
  cores: number;
  /** OLYMPUS-owned processes (electron/node/opencode/next) and their RSS. */
  processCount: number;
  olympusRssMb: number;
  verdict: ResourceVerdict;
  /** The honest reason when amber/red; null when green. */
  reason: string | null;
}

export interface Admission {
  ok: boolean;
  snapshot: ResourceSnapshot;
  /** Present when refused: the human sentence the UI shows. */
  reason?: string;
}

/** Below this much available memory, a new heavy spawn is refused. */
export const MEMORY_FLOOR_MB = 1200;
/** At or above this used share, the machine is red even with free pages. */
const RED_USED_PCT = 94;
const AMBER_USED_PCT = 88;
const AMBER_AVAILABLE_MB = 2200;

function readMeminfo(): { totalMb: number; availableMb: number } | null {
  try {
    const text = fs.readFileSync('/proc/meminfo', 'utf-8');
    const total = Number((/^MemTotal:\s+(\d+)\s+kB/m.exec(text) ?? [])[1]);
    const avail = Number((/^MemAvailable:\s+(\d+)\s+kB/m.exec(text) ?? [])[1]);
    if (!Number.isFinite(total) || total <= 0) return null;
    return {
      totalMb: Math.round(total / 1024),
      availableMb: Number.isFinite(avail) && avail > 0 ? Math.round(avail / 1024) : Math.round(os.freemem() / 1024 / 1024),
    };
  } catch {
    return null;
  }
}

function isOlympusProcess(cmdline: string): boolean {
  return /(electron|opencode|next-server|olympus|node .*next|node .*runner)/i.test(cmdline);
}

/** A bounded process census: /proc only, no shell, no vendor calls. */
function processCensus(): { count: number; rssMb: number } {
  let count = 0;
  let rssKb = 0;
  try {
    for (const entry of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const cmd = fs.readFileSync(`/proc/${entry}/cmdline`, 'utf-8').replace(/\0/g, ' ').trim();
        if (!cmd || !isOlympusProcess(cmd)) continue;
        const status = fs.readFileSync(`/proc/${entry}/status`, 'utf-8');
        const rss = Number((/^VmRSS:\s+(\d+)\s+kB/m.exec(status) ?? [])[1]);
        count += 1;
        if (Number.isFinite(rss)) rssKb += rss;
      } catch { /* process vanished mid-census */ }
    }
  } catch { /* not Linux */ }
  return { count, rssMb: Math.round(rssKb / 1024) };
}

let cached: { at: number; snapshot: ResourceSnapshot } | null = null;

/**
 * One bounded sample (cached for 4s so a polling UI cannot turn the census
 * into a hot loop). The census is skipped when the cache is fresh.
 */
export function sampleResources(opts: { cacheMs?: number } = {}): ResourceSnapshot {
  const cacheMs = opts.cacheMs ?? 4_000;
  const now = Date.now();
  if (cached && now - cached.at < cacheMs) return cached.snapshot;

  const mem = readMeminfo() ?? {
    totalMb: Math.round(os.totalmem() / 1024 / 1024),
    availableMb: Math.round(os.freemem() / 1024 / 1024),
  };
  const census = processCensus();
  const usedPct = mem.totalMb > 0 ? Math.round(((mem.totalMb - mem.availableMb) / mem.totalMb) * 100) : 0;
  const load1 = os.loadavg()[0];
  const cores = Math.max(1, os.cpus().length);

  let verdict: ResourceVerdict = 'green';
  let reason: string | null = null;
  if (mem.availableMb < MEMORY_FLOOR_MB || usedPct >= RED_USED_PCT) {
    verdict = 'red';
    reason = mem.availableMb < MEMORY_FLOOR_MB
      ? `only ${mem.availableMb} MB available (floor ${MEMORY_FLOOR_MB} MB)`
      : `memory ${usedPct}% used (red at ${RED_USED_PCT}%)`;
  } else if (mem.availableMb < AMBER_AVAILABLE_MB || usedPct >= AMBER_USED_PCT) {
    verdict = 'amber';
    reason = `memory ${usedPct}% used, ${mem.availableMb} MB available`;
  }

  const snapshot: ResourceSnapshot = {
    at: new Date().toISOString(),
    totalMb: mem.totalMb,
    availableMb: mem.availableMb,
    usedPct,
    load1: Math.round(load1 * 100) / 100,
    cores,
    processCount: census.count,
    olympusRssMb: census.rssMb,
    verdict,
    reason,
  };
  cached = { at: now, snapshot };
  return snapshot;
}

/**
 * Admission control: may we add `estimatedMb` more? Refuses when the floor
 * would be crossed. The caller shows the snapshot in the refusal, so the
 * user sees the truth instead of a generic failure.
 */
export function admitWorkload(estimatedMb: number, kind = 'workload'): Admission {
  const snapshot = sampleResources();
  const projected = snapshot.availableMb - Math.max(0, estimatedMb);
  if (projected < MEMORY_FLOOR_MB) {
    return {
      ok: false,
      snapshot,
      reason: `refusing ${kind}: it needs ~${estimatedMb} MB and would leave ${Math.max(0, projected)} MB available (floor ${MEMORY_FLOOR_MB} MB; ${snapshot.usedPct}% used). Close a preview or run reclaim first.`,
    };
  }
  if (snapshot.verdict === 'red') {
    return {
      ok: false,
      snapshot,
      reason: `refusing ${kind}: the machine is under red memory pressure (${snapshot.reason}). Do not start another heavy process.`,
    };
  }
  return { ok: true, snapshot };
}

/** Test seam — the cache must not leak between assertions. */
export function resetResourceCache(): void {
  cached = null;
}
