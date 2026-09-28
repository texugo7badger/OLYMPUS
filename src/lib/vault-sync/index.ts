/**
 * Olympus Vault Sync — Public API (v2.0.0)
 * =============================================
 *
 * Git auto-commit + push via `isomorphic-git`. Replaces the v1 stub (which
 * threw `'Tier 2 — not implemented'`).
 *
 * Callers (e.g. Callimachus agent via /callimachus-heartbeat) invoke
 * `commit()` + `push()` directly. The scheduler auto-commits every
 * `OLYMPUS_VAULT_GIT_INTERVAL_MS` (default 5 min) when the working tree
 * is dirty.
 *
 * Public API signatures match the v1 stub EXACTLY so the Callimachus agent's
 * calls don't break. New v2 functions (`startScheduler`, `stopScheduler`,
 * `getSchedulerState`) are additive.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

export type {
  CommitResult,
  InitResult,
  PushResult,
  SchedulerState,
  StatusResult,
} from './types';
export { commit, push, status, init, setRemote, isGitRepo } from './git';
export {
  startScheduler,
  stopScheduler,
  getSchedulerState,
} from './scheduler';
