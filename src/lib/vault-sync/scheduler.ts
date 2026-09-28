/**
 * Olympus Vault Sync — Auto-Commit Scheduler
 * ==============================================
 *
 * A `setInterval` that calls `commit()` every `OLYMPUS_VAULT_GIT_INTERVAL_MS`
 * (default 300000 = 5 min). Only commits if the working tree is dirty.
 * Push is NOT auto-triggered — it is an explicit action callers take by
 * invoking `push()` directly (e.g. Callimachus via /callimachus-heartbeat).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { commit, status } from './git';
import type { SchedulerState } from './types';

let timer: NodeJS.Timeout | null = null;
let state: SchedulerState = {
  running: false,
  intervalMs: 300000,
  commitsMade: 0,
  lastCommitAt: null,
  lastError: null,
};

/**
 * Start the auto-commit scheduler. If already running, this is a no-op.
 *
 * @param intervalMs Override the interval (default: `OLYMPUS_VAULT_GIT_INTERVAL_MS` env or 300000).
 */
export function startScheduler(intervalMs?: number): void {
  if (timer) return;
  const interval = intervalMs || Number(process.env.OLYMPUS_VAULT_GIT_INTERVAL_MS) || 300000;
  if (!Number.isFinite(interval) || interval < 60000) {
    throw new Error(
      `vault-sync.startScheduler: interval must be >= 60000ms (got ${interval}). Set OLYMPUS_VAULT_GIT_INTERVAL_MS to a sane value.`,
    );
  }
  state = { ...state, running: true, intervalMs: interval, lastError: null };
  timer = setInterval(async () => {
    try {
      const s = await status();
      if (s.clean) return;
      const result = await commit();
      if (result.sha) {
        state.commitsMade++;
        state.lastCommitAt = new Date().toISOString();
        state.lastError = null;
      }
    } catch (err) {
      state.lastError = (err as Error).message;
      // Don't re-throw — the scheduler must keep running.
    }
  }, interval);

  // Allow the process to exit even if the timer is still running.
  if (typeof timer.unref === 'function') timer.unref();
}

/**
 * Stop the auto-commit scheduler.
 */
export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  state.running = false;
}

/**
 * Get the current scheduler state.
 */
export function getSchedulerState(): SchedulerState {
  return { ...state };
}
