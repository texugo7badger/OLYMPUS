/**
 * Olympus Vault Query — Executor (v2.0.0)
 * =========================================
 *
 * Runs a DQL query against the `VaultIndex` SQLite database and returns
 * structured rows. The pipeline is:
 *
 *   DQL string
 *     → parser.parseDql()        → AST
 *     → transpiler.transpileDql() → SQL + params
 *     → better-sqlite3.prepare().all()
 *     → rows
 *
 * v2.0.0 optimizations:
 *   - LRU cache on the parse+transpile step (keyed by DQL string).
 *     The cache is invalidated on any vault change (the watcher calls
 *     `invalidateQueryCache()` on `add`/`change`/`unlink` events).
 *   - `PRAGMA optimize` is called on the db handle periodically (every
 *     100 queries) to keep the query planner sharp.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { parseDql } from './parser';
import { transpileDql } from './transpiler';
import type { VaultIndex } from '../vault-index/indexer';
import type { QueryResult } from '../vault/types';

// ─────────────────────────────────────────────────────────────────────
// LRU cache for parsed+transpiled DQL queries.
//
// Keyed by the raw DQL string. The cache stores `{ sql, params }` — the
// parsed AST is not cached (it's cheap to re-derive from sql+params).
// Max size: 256 entries (enough for typical god workflows).
// ─────────────────────────────────────────────────────────────────────

const CACHE_MAX = 256;
const queryCache = new Map<string, { sql: string; params: unknown[] }>();

/** Look up a cached transpiled query. */
function cacheGet(dql: string): { sql: string; params: unknown[] } | undefined {
  const entry = queryCache.get(dql);
  if (entry) {
    // Move to end (most-recently-used) by re-inserting.
    queryCache.delete(dql);
    queryCache.set(dql, entry);
  }
  return entry;
}

/** Insert a transpiled query into the cache, evicting the LRU if needed. */
function cacheSet(dql: string, value: { sql: string; params: unknown[] }): void {
  if (queryCache.size >= CACHE_MAX) {
    // Evict the oldest entry (first key in insertion order).
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
  queryCache.set(dql, value);
}

/**
 * Invalidate the entire query cache. Called by the VaultIndex watcher on
 * any file change. We invalidate all entries because any note change could
 * affect any query result (we don't track per-note query dependencies).
 */
export function invalidateQueryCache(): void {
  queryCache.clear();
}

/** Track how many queries have been run since the last `PRAGMA optimize`. */
let queriesSinceOptimize = 0;
const OPTIMIZE_EVERY_N_QUERIES = 100;

/**
 * Run a DQL query. Throws on parse or execution errors.
 *
 * @example
 *   const result = runDql(index, 'TABLE god, count(*) AS events FROM "06_Activity_Feed" GROUP BY god SORT events DESC LIMIT 10');
 */
export function runDql(
  index: VaultIndex,
  dql: string,
  _params: Record<string, unknown> = {},
): QueryResult {
  const t0 = Date.now();

  // Cache lookup.
  let compiled = cacheGet(dql);
  if (!compiled) {
    const ast = parseDql(dql);
    compiled = transpileDql(ast);
    cacheSet(dql, compiled);
  }
  const { sql, params } = compiled;

  // Run the query.
  const rows = index.db.prepare(sql).all(...params) as Record<string, unknown>[];

  // Periodically run PRAGMA optimize to keep the query planner sharp.
  queriesSinceOptimize++;
  if (queriesSinceOptimize >= OPTIMIZE_EVERY_N_QUERIES) {
    try {
      index.db.pragma('optimize');
    } catch {
      // ignore — PRAGMA optimize can fail on read-only DBs.
    }
    queriesSinceOptimize = 0;
  }

  return {
    rows,
    query: dql,
    sql,
    params,
    durationMs: Date.now() - t0,
  };
}

/**
 * Try to run a DQL query. Returns `{ ok: true, result }` or `{ ok: false, error }`.
 * Useful for HTTP routes where we want to return 400 on parse errors.
 */
export function tryRunDql(
  index: VaultIndex,
  dql: string,
  params: Record<string, unknown> = {},
): { ok: true; result: QueryResult } | { ok: true; result: QueryResult; error?: never } | { ok: false; error: string; result?: never } {
  try {
    const result = runDql(index, dql, params);
    return { ok: true, result };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}
