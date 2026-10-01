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
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Resolve the safe root for fs operations. Used by every route in this
 * directory. Order of preference:
 *   1. The `root` query param — accepted only if it points to a real
 *      directory AND is inside one of the known-safe roots below. This
 *      prevents the renderer from browsing arbitrary disk locations.
 *   2. The Olympus app root (process.cwd() in dev / resourcesPath when
 *      packaged).
 *
 * Note: an earlier version of this doc claimed the active project's `path`
 * was read from ~/.olympus/projects.json and used as a fallback root. The
 * code has never done that — projects.json is not read here. Corrected in
 * issue #29.
 *
 * The known-safe roots are the app root, the ACTIVE vault (via the canonical
 * getVaultRoot(), so a Settings-switched or custom vault is covered), and
 * ~/.olympus/projects.
 *
 * Issue #29: this list previously ended with a bare `os.homedir()` entry,
 * which admitted EVERY descendant of $HOME (~/.ssh, ~/.aws, ~/.config, …)
 * to a family that includes write/delete/mkdir/rename. That entry is gone.
 * It is not merely deleted either: Fix D (issue #26, see resolveSafePath
 * below) made that function accept absolute vault paths, and several server
 * routes hand the renderer absolute paths inside the vault, so the vault
 * itself must stay reachable — hence getVaultRoot() instead of deletion.
 */
export function resolveSafeRoot(rootHint?: string | null): string {
  const olympusRoot = process.cwd();
  const vaultRoot = getVaultRoot();
  const projectsRoot = path.join(os.homedir(), '.olympus', 'projects');

  if (rootHint && typeof rootHint === 'string') {
    try {
      const resolved = path.resolve(rootHint);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        // Allow if the hint is under one of the known-safe roots.
        for (const safe of [olympusRoot, vaultRoot, projectsRoot]) {
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
 * Resolve a caller-supplied path against the safe root, rejecting any attempt
 * to escape via `..` or absolute paths outside the safe root.
 *
 * Accepts BOTH relative and absolute inputs:
 *   • relative — resolved against safeRoot (the historical behaviour).
 *   • absolute — resolved directly, then held to the SAME sandbox check.
 *
 * Why absolute matters (Fix D, issue #26): several server routes hand the
 * renderer a list of absolute paths (e.g. god/references reads
 * 04_Knowledge/references/<dir>/*.md and returns `path.join(...)` results),
 * and the detail modals forward that path verbatim to /api/olympus/fs/read.
 * The old code stripped the leading "/" and re-resolved the remainder INSIDE
 * safeRoot, doubling the path:
 *   /home/<u>/OLYMPUS-VAULT + "home/<u>/OLYMPUS-VAULT/04_Knowledge/x.md"
 *   → /home/<u>/OLYMPUS-VAULT/home/<u>/OLYMPUS-VAULT/04_Knowledge/x.md
 * The doubled path still passes the sandbox check (it is inside safeRoot) but
 * does not exist, so every Knowledge and instinct row 404'd. Note this was
 * never a usable behaviour: the only possible outcome of an absolute input
 * was a non-existent doubled path.
 *
 * SECURITY: resolving an absolute path does NOT widen access. path.resolve()
 * collapses ".." first, so "/vault/../etc/passwd" normalizes to
 * "/etc/passwd" and is then rejected by the identical boundary check used for
 * relative input. An absolute path outside safeRoot is still refused (null →
 * the route returns 403).
 *
 * Returns the resolved absolute path on success, or null if the path is unsafe
 * (escape attempt).
 */
export function resolveSafePath(safeRoot: string, relative: string | undefined | null): string | null {
  if (!relative) return safeRoot;
  // Absolute input: resolve it as-is and apply the SAME sandbox check.
  if (path.isAbsolute(relative)) {
    const resolved = path.resolve(relative);
    if (resolved !== safeRoot && !resolved.startsWith(safeRoot + path.sep)) {
      return null;
    }
    return resolved;
  }
  // Relative input: normalize then resolve against the safe root. A leading
  // "./" or redundant separator is fine; ".." escapes are caught below.
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
