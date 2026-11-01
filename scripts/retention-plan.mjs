/**
 * retention-plan.mjs — R31-05 (v0.0.31): the pure retention planner.
 *
 * THE SPECIMEN (2026-11-01): `~/.olympus` was 11 GB, of which 8.9 GB was one
 * stale `build-archive/dist-electron-0.0.6` from Oct 23 and 1.7 GB was a
 * single pre-v2 `opencode.db.bak` from Oct 25 — three newer DB backups
 * existed. Nothing was "broken"; nothing was ever collected.
 *
 * This module is deliberately PURE: it takes directory listings and returns
 * a plan (what to keep, what to remove, how much it reclaims). It performs no
 * I/O, so the doctor can dry-run it, the tests can pin it, and `--fix` only
 * deletes what a plan listed and `assertSafePath` approved.
 *
 * Safety rules (non-negotiable):
 *   1. Only known families under known roots are candidates.
 *   2. The newest N entries of a family are always kept.
 *   3. The live OpenCode DB (`opencode.db`, `-wal`, `-shm`) is NEVER a candidate.
 *   4. `.broken-*` archives belong to the DB health path (30-day floor) and are
 *      never touched here.
 *   5. A path outside the allowed roots is a hard error, never a deletion.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import path from 'node:path';

export const DEFAULT_POLICY = {
  /** Full Electron builds kept in ~/.olympus/build-archive (one per release). */
  buildArchiveKeep: 3,
  /** How many patches behind the running version a build may be and survive. */
  buildArchiveVersionWindow: 3,
  /** OpenCode DB backup sets kept in ~/.local/share/opencode. */
  dbBackupKeep: 3,
  /** opencode.json snapshots kept in ~/.olympus/backups. */
  configBackupKeep: 10,
};

/** Parse `0.0.30` / `dist-electron-0.0.6` into [major, minor, patch]. */
export function parseVersion(value) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(value ?? ''));
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * A build archive is a rollback artifact: it stays only while it belongs to
 * the running major.minor AND is within `buildArchiveVersionWindow` patches
 * of the running version. An unknown version is kept (conservative).
 */
export function isBuildWithinWindow(name, currentVersion, window) {
  const current = parseVersion(currentVersion);
  if (!current) return true; // no baseline — never guess
  const build = parseVersion(name);
  if (!build) return true; // unknown shape — keep for a human
  if (build[0] !== current[0] || build[1] !== current[1]) return false;
  return current[2] - build[2] <= window;
}

/** Human-readable bytes (binary units, 1 decimal). */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * A deletion candidate is safe only when it is strictly inside one of the
 * allowed roots. `..` traversal is resolved first; a relative path never
 * passes because roots are absolute.
 */
export function assertSafePath(target, roots) {
  const resolved = path.resolve(target);
  if (!path.isAbsolute(target)) {
    throw new Error(`retention: refusing relative path ${target}`);
  }
  const inside = roots.some((root) => {
    const base = path.resolve(root);
    return resolved !== base && resolved.startsWith(base + path.sep);
  });
  if (!inside) {
    throw new Error(`retention: refusing path outside allowed roots: ${resolved}`);
  }
  return resolved;
}

/**
 * Build archives: one directory per packaged release (`dist-electron-<ver>`).
 * A build survives only when it is among the newest `keep` AND within the
 * version window of the running app. Package artifacts are reproducible, so
 * a build 24 patches behind is a collector's item, not a rollback target.
 *
 * @param {Array<{name: string, path: string, mtimeMs: number, bytes: number}>} entries
 * @param {{currentVersion?: string}} context
 */
export function planBuildArchive(entries, policy = DEFAULT_POLICY, context = {}) {
  const keep = Math.max(1, policy.buildArchiveKeep ?? 3);
  const window = Math.max(0, policy.buildArchiveVersionWindow ?? 3);
  const dirs = entries
    .filter((e) => e && /^dist-electron-/.test(e.name))
    .slice()
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const eligible = dirs.filter((e) => isBuildWithinWindow(e.name, context.currentVersion, window));
  const keepSet = new Set(eligible.slice(0, keep).map((e) => e.path));
  // Out-of-window builds are pruned even when fewer than `keep` exist: a
  // 0.0.6 artifact next to a 0.0.30 app is not a rollback target.
  const doomed = dirs.filter((e) => !keepSet.has(e.path));
  return {
    family: 'build-archive',
    keep: [...keepSet],
    remove: doomed.map((e) => ({
      path: e.path,
      bytes: e.bytes ?? 0,
      reason: context.currentVersion
        ? `build more than ${window} patch(es) behind ${context.currentVersion}`
        : `build archive older than the newest ${keep}`,
    })),
    reclaimBytes: doomed.reduce((sum, e) => sum + (e.bytes ?? 0), 0),
  };
}

/**
 * DB backup sets. A set is `opencode.db.bak` (legacy, no stamp) or
 * `opencode.db.bak-<stamp>` plus its `-shm`/`-wal` siblings. The newest
 * `keep` sets survive; older sets are removed whole.
 *
 * The live database and its WAL/SHM are never candidates; `.broken-*`
 * archives are owned by the DB-health retention and are ignored here.
 *
 * @param {Array<{name: string, path: string, mtimeMs: number, bytes: number}>} entries
 */
export function planDbBackups(entries, policy = DEFAULT_POLICY) {
  const keep = Math.max(1, policy.dbBackupKeep ?? 3);
  const bySet = new Map();
  for (const entry of entries) {
    const match = /^(opencode\.db\.bak(?:-(\d+))?)(?:-(?:shm|wal))?$/.exec(entry.name);
    if (!match) continue; // live db, -wal, -shm, .broken-* — never ours
    const setKey = match[1];
    const stamp = match[2] ? Number(match[2]) : 0;
    const set = bySet.get(setKey) ?? { setKey, stamp, files: [] };
    set.files.push(entry);
    // The set's age is its newest file; mtime is the fallback for legacy rows.
    set.stamp = Math.max(set.stamp, stamp, Number.isFinite(entry.mtimeMs) ? entry.mtimeMs : 0);
    bySet.set(setKey, set);
  }
  const sets = [...bySet.values()].sort((a, b) => b.stamp - a.stamp);
  const doomed = sets.slice(keep);
  // Never prune the only set that exists, even if `keep` were misconfigured.
  if (sets.length <= 1) doomed.length = 0;
  return {
    family: 'db-backups',
    keep: sets.slice(0, keep).map((s) => s.setKey),
    remove: doomed.flatMap((s) =>
      s.files.map((f) => ({
        path: f.path,
        bytes: f.bytes ?? 0,
        reason: `DB backup set older than the newest ${keep}`,
      })),
    ),
    reclaimBytes: doomed.reduce(
      (sum, s) => sum + s.files.reduce((n, f) => n + (f.bytes ?? 0), 0),
      0,
    ),
  };
}

/**
 * opencode.json snapshots written before a strategy/config rewrite.
 * Keep the newest `keep`; older snapshots are candidates.
 *
 * @param {Array<{name: string, path: string, mtimeMs: number, bytes: number}>} entries
 */
export function planConfigBackups(entries, policy = DEFAULT_POLICY) {
  const keep = Math.max(1, policy.configBackupKeep ?? 10);
  const snaps = entries
    .filter((e) => e && /^opencode\.json\..*\.bak$/.test(e.name))
    .slice()
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const doomed = snaps.slice(keep);
  return {
    family: 'config-backups',
    keep: snaps.slice(0, keep).map((e) => e.path),
    remove: doomed.map((e) => ({
      path: e.path,
      bytes: e.bytes ?? 0,
      reason: `config snapshot older than the newest ${keep}`,
    })),
    reclaimBytes: doomed.reduce((sum, e) => sum + (e.bytes ?? 0), 0),
  };
}

/** Combine family plans into one report. */
export function combinePlans(plans) {
  return {
    generatedAt: new Date().toISOString(),
    families: plans,
    remove: plans.flatMap((p) => p.remove),
    reclaimBytes: plans.reduce((sum, p) => sum + p.reclaimBytes, 0),
    reclaimHuman: formatBytes(plans.reduce((sum, p) => sum + p.reclaimBytes, 0)),
  };
}

/**
 * Apply a plan. Every path is re-validated against the allowed roots before
 * the callback runs, so a malformed plan can never delete outside them.
 *
 * @param {{remove: Array<{path: string}>}} plan
 * @param {{roots: string[], removePath: (target: string) => void}} io
 */
export function applyPlan(plan, io) {
  const removed = [];
  for (const item of plan.remove ?? []) {
    const safe = assertSafePath(item.path, io.roots);
    io.removePath(safe);
    removed.push({ path: safe, bytes: item.bytes ?? 0 });
  }
  return {
    removed,
    removedBytes: removed.reduce((sum, r) => sum + r.bytes, 0),
    removedHuman: formatBytes(removed.reduce((sum, r) => sum + r.bytes, 0)),
  };
}
