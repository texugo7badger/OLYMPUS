/**
 * Olympus Vault Backend — Wikilink Utilities
 * =============================================
 *
 * Resolve `[[wikilinks]]` to vault-relative paths, compute backlinks,
 * find orphan notes. Backed by the `VaultIndex` SQLite tables
 * (`notes`, `links`).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { VaultIndex } from '../vault-index/indexer';

/** Result of resolving a single `[[target]]` to a path. */
export interface ResolvedLink {
  /** Raw target text inside the brackets. */
  target: string;
  /** Resolved path (or `null` if the link is broken). */
  targetPath: string | null;
  /** All candidate paths that matched (when ambiguous). */
  candidates: string[];
}

/**
 * Resolve a `[[target]]` to a vault-relative path.
 *
 * Resolution rules (Dataview-compatible):
 * 1. If `target` contains `/`, treat it as a relative path: append `.md`
 *    if no extension.
 * 2. Otherwise, search for any note whose basename (without .md) matches
 *    case-insensitively. If multiple, prefer the one in the same directory
 *    as the source note; otherwise return the first match.
 *
 * @param index Vault index for path lookup.
 * @param target Raw target text (alias/heading already stripped by parser).
 * @param sourcePath Path of the note containing the link (for disambiguation).
 */
export function resolveWikilink(
  index: VaultIndex,
  target: string,
  sourcePath?: string,
): ResolvedLink {
  // 1. Target with path separator.
  if (target.includes('/')) {
    let p = target.replace(/\.md$/i, '') + '.md';
    // Normalize — strip leading slash.
    p = p.replace(/^\/+/, '');
    if (index.noteExists(p)) {
      return { target, targetPath: p, candidates: [p] };
    }
    // Fall through to fuzzy match.
  }

  // 2. Basename match.
  const targetLower = target.toLowerCase();
  const candidates = index.findNotesByBasename(targetLower);
  if (candidates.length === 0) {
    return { target, targetPath: null, candidates: [] };
  }
  if (candidates.length === 1) {
    return { target, targetPath: candidates[0], candidates };
  }
  // Prefer same-directory as source.
  if (sourcePath) {
    const sourceDir = sourcePath.split('/').slice(0, -1).join('/');
    const sameDir = candidates.find((c) => c.startsWith(sourceDir + '/'));
    if (sameDir) {
      return { target, targetPath: sameDir, candidates };
    }
  }
  return { target, targetPath: candidates[0], candidates };
}

/**
 * Get all notes that link TO `notePath` (backlinks).
 * Uses the `links` table — instant.
 */
export function getBacklinks(
  index: VaultIndex,
  notePath: string,
): { sourcePath: string; line: number; target: string }[] {
  return index.getBacklinks(notePath);
}

/**
 * Get all notes that `notePath` links FROM (outlinks / forward links).
 * Uses the `links` table.
 */
export function getOutlinks(
  index: VaultIndex,
  notePath: string,
): { target: string; targetPath: string | null; line: number }[] {
  return index.getOutlinks(notePath);
}

/**
 * Find orphan notes — notes that have ZERO incoming links.
 * Surfaced by the vault index filesystem walk (no MCP tool required).
 */
export function getOrphans(index: VaultIndex): string[] {
  return index.getOrphanNotes();
}

/**
 * Find broken wikilinks — `[[target]]` references that don't resolve
 * to any note.
 */
export function getBrokenLinks(
  index: VaultIndex,
): { sourcePath: string; target: string; line: number }[] {
  return index.getBrokenLinks();
}
