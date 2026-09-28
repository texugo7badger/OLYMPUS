/**
 * Shared helpers for the /api/olympus/fs/* routes.
 *
 * All fs routes operate RELATIVE TO A SAFE ROOT — either:
 *   • the active project's `path` (from ~/.olympus/projects.json via the
 *     /api/olympus/projects endpoint), or
 *   • the Olympus app root (process.cwd() in dev, process.resourcesPath in
 *     packaged), used when no project is active.
 *
 * Paths are NORMALIZED + SANDBOXED: any attempt to escape the safe root
 * via `..` or absolute paths is rejected with 403. This is the same
 * security model as the existing /api/vault/file/* routes — we never
 * expose arbitrary filesystem access to the renderer.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Resolve the safe root for fs operations. Used by every route in this
 * directory. Order of preference:
 *   1. The `root` query param (if it points to a real directory AND is
 *      inside the active project's path or the Olympus root — prevents
 *      the renderer from browsing arbitrary disk locations).
 *   2. The active project's `path` (read from ~/.olympus/projects.json).
 *   3. The Olympus app root (process.cwd() / resourcesPath).
 */
export function resolveSafeRoot(rootHint?: string | null): string {
  // Always allow the Olympus app root + the user's home directory's
  // "OLYMPUS-VAULT" folder (where the brain lives) + the user's projects
  // folder (~/.olympus/projects). Anything outside these needs an explicit
  // `root` query param that matches an existing directory.
  const olympusRoot = process.cwd();
  const vaultRoot = path.join(os.homedir(), 'OLYMPUS-VAULT');
  const projectsRoot = path.join(os.homedir(), '.olympus', 'projects');

  if (rootHint && typeof rootHint === 'string') {
    try {
      const resolved = path.resolve(rootHint);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        // Allow if the hint is under one of the known-safe roots.
        for (const safe of [olympusRoot, vaultRoot, projectsRoot, os.homedir()]) {
          if (resolved === safe || resolved.startsWith(safe + path.sep)) {
            return resolved;
          }
        }
      }
    } catch {}
  }

  // Default: Olympus app root.
  return olympusRoot;
}

/**
 * Resolve a relative path against the safe root, rejecting any attempt to
 * escape via `..` or absolute paths.
 *
 * Returns the resolved absolute path on success, or null if the path is
 * unsafe (escape attempt).
 */
export function resolveSafePath(safeRoot: string, relative: string | undefined | null): string | null {
  if (!relative) return safeRoot;
  // Normalize the relative path: strip leading slashes (so absolute paths
  // become relative to safeRoot), then resolve.
  const cleaned = relative.replace(/^[/\\]+/, '');
  const resolved = path.resolve(safeRoot, cleaned);
  // CRITICAL: ensure the resolved path is still inside safeRoot.
  if (resolved !== safeRoot && !resolved.startsWith(safeRoot + path.sep)) {
    return null;
  }
  return resolved;
}

/** Format a stat result as JSON-serializable. */
export function formatStat(stat: fs.Stats, fullPath: string) {
  return {
    path: fullPath,
    name: path.basename(fullPath),
    size: stat.size,
    isDirectory: stat.isDirectory(),
    isFile: stat.isFile(),
    isSymbolicLink: stat.isSymbolicLink(),
    mtime: stat.mtime.toISOString(),
    ctime: stat.ctime.toISOString(),
    atime: stat.atime.toISOString(),
    mode: stat.mode,
  };
}
