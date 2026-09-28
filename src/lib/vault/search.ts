/**
 * Olympus Vault Backend — Search Facade
 * =======================================
 *
 * Thin facade over `VaultIndex.search()`. The actual FTS5 + fuzzy logic
 * lives in `vault-index/search.ts`; this file just exposes a stable API
 * to MCP tools and API routes.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type { VaultIndex } from '../vault-index/indexer';
import type { SearchResult } from './types';

/**
 * Full-text search across note bodies. Combines SQLite FTS5 (porter
 * stemmer + unicode61) with a prefix fallback so short queries still hit.
 */
export function searchNotes(
  index: VaultIndex,
  query: string,
  limit: number = 20,
): SearchResult[] {
  return index.searchNotes(query, limit);
}

/** Search by `#tag`. */
export function searchByTag(
  index: VaultIndex,
  tag: string,
  limit: number = 50,
): SearchResult[] {
  return index.searchByTag(tag, limit);
}

/** Search by a frontmatter key/value pair. */
export function searchByFrontmatter(
  index: VaultIndex,
  key: string,
  value: unknown,
  limit: number = 50,
): SearchResult[] {
  return index.searchByFrontmatter(key, value, limit);
}
