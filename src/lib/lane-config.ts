import { copyFileSync, existsSync, readFileSync } from 'node:fs';

/**
 * #LANE-DRIFT (2026-10-16 specimen): the lane copies of opencode.json were
 * CREATED-IF-MISSING and NEVER refreshed — the #99 workspace lane kept a
 * 9-day-old fossil pinning Apollo to the banned nemotron pool while the
 * repo config had been rotated twice. The interactive dispatch rode the
 * fossil: 180s stream stalls, transport failures, a 15-minute max-runtime
 * kill — zero tokens out. The doctrine is now REFRESH-ON-DRIFT: a lane
 * copy that differs from its source is overwritten, loudly. Operator edits
 * belong in the ROOT config — the lane is a mirror, never a fork.
 *
 * The verdicts:
 *   'created'  — dst absent, copied fresh;
 *   'refreshed' — dst drifted from src, OVERWRITTEN (the loud line);
 *   'in-sync'  — byte-identical, no-op;
 *   'missing-source' — src absent (the caller decides; never a crash).
 */
export type LaneFileSyncVerdict = 'created' | 'refreshed' | 'in-sync' | 'missing-source';

export function syncLaneFile(src: string, dst: string): LaneFileSyncVerdict {
  if (!existsSync(src)) return 'missing-source';
  if (!existsSync(dst)) {
    copyFileSync(src, dst);
    return 'created';
  }
  try {
    if (readFileSync(src).equals(readFileSync(dst))) return 'in-sync';
  } catch {
    // unreadable dst (or src changed mid-read) — fall through to refresh
  }
  copyFileSync(src, dst);
  return 'refreshed';
}
