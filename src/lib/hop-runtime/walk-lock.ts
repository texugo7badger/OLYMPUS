/**
 * walk-lock.ts — ONE CAMPAIGN PER LANE, ENFORCED ON DISK (2026-10-24).
 *
 * THE SPECIMEN (AIME): five concurrent walks of the SAME hop `f0-1` inside
 * ninety seconds. The activity feed narrated "324s" and "56s" for the same
 * hop in the same second, `.olympus-hop-telemetry.jsonl` recorded five parked
 * rows with five different durations, and `.olympus-hop-state.json` was
 * rewritten by whichever walker happened to finish last — the user's "nunca
 * sabemos ao certo se está trabalhando" and "se embola para dar dispatch".
 *
 * Every one of those walks was a legitimate post-turn invocation: the user
 * resent, the overnight resume fired, and nothing in the runtime ever asked
 * "is a campaign already walking here?".
 *
 * This lock is the answer. It is:
 *   - per LANE (two different projects may walk at the same time),
 *   - pid-aware (a dead holder is stolen immediately, never waited on),
 *   - heartbeat-based (a live holder keeps its mtime fresh; a zombie whose
 *     pid was recycled cannot squat forever),
 *   - failure-tolerant (a lock file that cannot be written never blocks the
 *     walk — the platform must degrade to today's behaviour, not to a halt).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';

export const WALK_LOCK_FILENAME = '.olympus-walk.lock';

/** A holder that has not heartbeat'd in this long is presumed dead. */
export const WALK_LOCK_STALE_MS = 5 * 60_000;

export interface WalkLockHolder {
  pid: number;
  /** Identifies the boot, so a recycled pid is not mistaken for the holder. */
  bootId: string;
  campaignId: string;
  slug: string;
  sessionId?: string;
  startedAt: string;
}

export interface WalkLockHandle {
  ok: true;
  path: string;
  holder: WalkLockHolder;
  release: () => void;
  heartbeat: () => void;
}

export interface WalkLockRefusal {
  ok: false;
  /** Who holds it — the honest line the UI renders. */
  holder: WalkLockHolder | null;
  reason: 'held' | 'unavailable';
}

export type WalkLockResult = WalkLockHandle | WalkLockRefusal;

function bootIdOf(): string {
  // /proc/sys/kernel/random/boot_id is Linux; elsewhere fall back to the
  // process start second (good enough to distinguish a recycled pid).
  try {
    return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf-8').trim();
  } catch {
    return `proc-${Math.floor(Date.now() / 1000) - Math.floor(process.uptime())}`;
  }
}

function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    // EPERM = alive but not ours (still alive).
    return e?.code === 'EPERM';
  }
}

export function walkLockPath(laneRoot: string): string {
  return path.join(laneRoot, WALK_LOCK_FILENAME);
}

function readHolder(lockPath: string): { holder: WalkLockHolder | null; ageMs: number } {
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    const holder = JSON.parse(raw) as WalkLockHolder;
    const st = fs.statSync(lockPath);
    return { holder, ageMs: Date.now() - st.mtimeMs };
  } catch {
    return { holder: null, ageMs: Number.POSITIVE_INFINITY };
  }
}

/**
 * Try to take the walk lock for a lane.
 *
 * Returns a handle when acquired (with `release` and `heartbeat`), or a
 * refusal naming the holder. A `held` refusal is the ONLY case where the
 * caller must skip the walk — `unavailable` (permissions, weird FS) means
 * "could not lock", and the walk proceeds unlocked rather than stopping the
 * product.
 */
export function acquireWalkLock(
  laneRoot: string,
  info: { slug: string; sessionId?: string; campaignId?: string },
): WalkLockResult {
  const lockPath = walkLockPath(laneRoot);
  const holder: WalkLockHolder = {
    pid: process.pid,
    bootId: bootIdOf(),
    campaignId: info.campaignId ?? `cmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    slug: info.slug,
    sessionId: info.sessionId,
    startedAt: new Date().toISOString(),
  };

  const tryWrite = (): boolean => {
    try {
      fs.mkdirSync(laneRoot, { recursive: true });
      // 'wx' = atomic create-or-fail: two walkers can never both win.
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, JSON.stringify(holder, null, 2));
      fs.closeSync(fd);
      return true;
    } catch (e: any) {
      if (e?.code === 'EEXIST') return false;
      // Any other failure (read-only FS, missing dir we cannot create): the
      // lock is unavailable — never a reason to stop the campaign.
      return false;
    }
  };

  if (!tryWrite()) {
    const { holder: existing, ageMs } = readHolder(lockPath);
    const holderGone =
      !existing
      || existing.bootId !== holder.bootId
      || !pidAlive(existing.pid)
      || ageMs > WALK_LOCK_STALE_MS;

    if (!holderGone) {
      return { ok: false, holder: existing, reason: 'held' };
    }
    // Steal: the holder is dead, from another boot, or silent past the TTL.
    try {
      fs.unlinkSync(lockPath);
    } catch { /* someone else stole it first — the retry decides */ }
    if (!tryWrite()) {
      const again = readHolder(lockPath);
      // A genuine race: report whoever won, and only refuse if it is alive.
      if (again.holder && again.holder.bootId === holder.bootId && pidAlive(again.holder.pid) && again.ageMs <= WALK_LOCK_STALE_MS) {
        return { ok: false, holder: again.holder, reason: 'held' };
      }
      return { ok: false, holder: again.holder, reason: 'unavailable' };
    }
  }

  const heartbeat = () => {
    try {
      const now = new Date();
      fs.utimesSync(lockPath, now, now);
    } catch { /* a lost heartbeat only risks a steal after the TTL */ }
  };

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      const current = readHolder(lockPath).holder;
      // Never remove somebody else's lock (we may have been stolen from).
      if (!current || (current.pid === holder.pid && current.campaignId === holder.campaignId)) {
        fs.unlinkSync(lockPath);
      }
    } catch { /* already gone */ }
  };

  return { ok: true, path: lockPath, holder, release, heartbeat };
}

/** A read-only peek — the run-state API and the UI use this to answer
 *  "is a campaign walking this lane right now?" without ever taking the lock. */
export function readWalkLock(laneRoot: string): { holder: WalkLockHolder | null; alive: boolean; ageMs: number } {
  const lockPath = walkLockPath(laneRoot);
  const { holder, ageMs } = readHolder(lockPath);
  const alive = Boolean(
    holder
    && holder.bootId === bootIdOf()
    && pidAlive(holder.pid)
    && ageMs <= WALK_LOCK_STALE_MS,
  );
  return { holder, alive, ageMs };
}
