/**
 * Olympus Vault Sync — Type Definitions
 * =========================================
 *
 * Public types for the Git auto-commit + push layer.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

/** Result of a `commit()`. */
export interface CommitResult {
  /** Commit SHA. */
  sha: string;
  /** Number of files changed in this commit. */
  files: number;
  /** Commit duration in milliseconds. */
  durationMs: number;
}

/** Result of a `push()`. */
export interface PushResult {
  /** True if push succeeded. */
  ok: boolean;
  /** Remote URL pushed to. */
  remote: string;
  /** Error message (if any). */
  error?: string;
}

/** Result of a `status()`. */
export interface StatusResult {
  /** Files staged for commit (modified + added). */
  staged: string[];
  /** Files modified but not staged. */
  modified: string[];
  /** Files not tracked by git. */
  untracked: string[];
  /** True if the working tree is clean (no staged, modified, or untracked). */
  clean: boolean;
}

/** Result of an `init()`. */
export interface InitResult {
  /** True if git was newly initialized; false if it already existed. */
  initialized: boolean;
  /** Remote URL configured (or null if none). */
  remote: string | null;
}

/** Scheduler state. */
export interface SchedulerState {
  /** True if the scheduler is currently running. */
  running: boolean;
  /** Interval in milliseconds. */
  intervalMs: number;
  /** Number of commits made since the scheduler started. */
  commitsMade: number;
  /** Last commit timestamp (ISO string) or null. */
  lastCommitAt: string | null;
  /** Last error (if any). */
  lastError: string | null;
}
