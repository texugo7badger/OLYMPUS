/**
 * retrieval/store.ts — v0.1.3: the local retrieval index (FTS5 + sqlite-vec).
 *
 * One SQLite file holds:
 *   - retrieval_docs   (metadata/citations)
 *   - retrieval_fts    (BM25)
 *   - retrieval_vec    (768d KNN)
 *   - retrieval_map    (vec rowid -> doc id)
 *
 * The index is additive: deleting it never touches the vault or the app.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import type { RetrievalChunk, RetrievalDocument, RetrievalHit, RetrievalKind } from './types';
import { EMBED_DIM } from './embedding';

const HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
export const RETRIEVAL_DB = () => process.env.OLYMPUS_RETRIEVAL_DB || path.join(HOME(), 'retrieval.db');

export interface RetrievalStore {
  db: Database.Database;
  close: () => void;
}

export function openRetrievalStore(dbPath = RETRIEVAL_DB()): RetrievalStore {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  try {
    // eval keeps Turbopack from statically tracing the native sqlite-vec load.
    // ESM (.mjs scripts / Turbopack) has no `require` in eval; fall back to
    // createRequire. The package name is split so no bundler traces it.
    let req: NodeRequire | null = null;
    try { const r = eval('require'); if (typeof r === 'function') req = r; } catch { /* ESM */ }
    if (!req) req = createRequire(import.meta.url);
    const sqliteVec = req(['sqlite', 'vec'].join('-'));
    sqliteVec.load(db);
  } catch {
    // Without sqlite-vec the FTS5 half still works; dense calls will fail.
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS retrieval_docs (
      doc_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      source_path TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      project TEXT,
      stacks TEXT NOT NULL DEFAULT '[]',
      god TEXT NOT NULL DEFAULT 'all',
      hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT,
      stale INTEGER NOT NULL DEFAULT 0,
      embedded INTEGER NOT NULL DEFAULT 0
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS retrieval_fts USING fts5(
      doc_id UNINDEXED,
      title,
      text,
      tokenize='porter unicode61'
    );
    CREATE TABLE IF NOT EXISTS retrieval_map (
      vec_rowid INTEGER PRIMARY KEY,
      doc_id TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS retrieval_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS retrieval_docs_kind ON retrieval_docs(kind);
    CREATE INDEX IF NOT EXISTS retrieval_docs_project ON retrieval_docs(project);
    CREATE INDEX IF NOT EXISTS retrieval_docs_god ON retrieval_docs(god);
  `);
  // Additive migration for a DB created by an earlier preview build.
  try { db.exec('ALTER TABLE retrieval_docs ADD COLUMN embedded INTEGER NOT NULL DEFAULT 0'); } catch { /* already present */ }
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS retrieval_vec USING vec0(embedding float[${EMBED_DIM}])`);
  } catch {
    // sqlite-vec unavailable — dense search degrades to empty.
  }
  return { db, close: () => db.close() };
}

/** Process-wide store. sqlite-vec is loaded once per connection; sharing it
 *  avoids the "no such module: vec0" reload failure on rapid opens. */
let sharedStore: RetrievalStore | null = null;
export function getRetrievalStore(dbPath = RETRIEVAL_DB()): RetrievalStore {
  if (!sharedStore) sharedStore = openRetrievalStore(dbPath);
  return sharedStore;
}
export function closeRetrievalStore(): void {
  try { sharedStore?.close(); } catch { /* gone */ }
  sharedStore = null;
}

export function hasChunkWithHash(store: RetrievalStore, docId: string, hash: string, requireVector = false): boolean {
  try {
    const row = store.db.prepare('SELECT hash, embedded FROM retrieval_docs WHERE doc_id = ?').get(docId) as { hash?: string; embedded?: number } | undefined;
    return Boolean(row && row.hash === hash && (!requireVector || Number(row.embedded) === 1));
  } catch {
    return false;
  }
}

export function deleteChunk(store: RetrievalStore, docId: string): void {
  try {
    const map = store.db.prepare('SELECT vec_rowid FROM retrieval_map WHERE doc_id = ?').get(docId) as { vec_rowid?: number } | undefined;
    if (map?.vec_rowid != null) {
      try { store.db.prepare('DELETE FROM retrieval_vec WHERE rowid = ?').run(map.vec_rowid); } catch { /* no vec */ }
      store.db.prepare('DELETE FROM retrieval_map WHERE doc_id = ?').run(docId);
    }
    store.db.prepare('DELETE FROM retrieval_fts WHERE doc_id = ?').run(docId);
    store.db.prepare('DELETE FROM retrieval_docs WHERE doc_id = ?').run(docId);
  } catch { /* idempotent */ }
}

export function upsertChunk(
  store: RetrievalStore,
  chunk: RetrievalChunk,
  embedding: number[] | null,
): void {
  deleteChunk(store, chunk.docId);
  store.db.prepare(`
    INSERT INTO retrieval_docs
      (doc_id, kind, source_path, title, text, project, stacks, god, hash, updated_at, expires_at, stale, embedded)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    chunk.docId,
    chunk.kind,
    chunk.sourcePath,
    chunk.title,
    chunk.text,
    chunk.project,
    JSON.stringify(chunk.stacks || []),
    chunk.god || 'all',
    chunk.hash,
    chunk.updatedAt,
    chunk.expiresAt,
    chunk.stale ? 1 : 0,
    embedding && embedding.length === EMBED_DIM ? 1 : 0,
  );
  store.db.prepare('INSERT INTO retrieval_fts (doc_id, title, text) VALUES (?, ?, ?)')
    .run(chunk.docId, chunk.title, chunk.text);

  if (embedding && embedding.length === EMBED_DIM) {
    try {
      const info = store.db.prepare('INSERT INTO retrieval_vec (embedding) VALUES (?)')
        .run(Buffer.from(new Float32Array(embedding).buffer));
      store.db.prepare('INSERT OR REPLACE INTO retrieval_map (vec_rowid, doc_id) VALUES (?, ?)')
        .run(Number(info.lastInsertRowid), chunk.docId);
    } catch { /* keep the lexical row even if the vector insert fails */ }
  }
}

export function setMeta(store: RetrievalStore, key: string, value: unknown): void {
  try {
    store.db.prepare('INSERT OR REPLACE INTO retrieval_meta (key, value) VALUES (?, ?)')
      .run(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch { /* best effort */ }
}

export function getMeta(store: RetrievalStore, key: string): string | null {
  try {
    const row = store.db.prepare('SELECT value FROM retrieval_meta WHERE key = ?').get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export function storeStats(store: RetrievalStore) {
  const docs = (store.db.prepare('SELECT COUNT(*) AS n FROM retrieval_docs').get() as { n: number }).n;
  const embedded = (store.db.prepare('SELECT COUNT(*) AS n FROM retrieval_docs WHERE embedded = 1').get() as { n: number }).n;
  const byKind = store.db.prepare('SELECT kind, COUNT(*) AS n FROM retrieval_docs GROUP BY kind').all() as Array<{ kind: RetrievalKind; n: number }>;
  return {
    docs,
    embedded,
    byKind: Object.fromEntries(byKind.map((r) => [r.kind, r.n])),
    dbPath: RETRIEVAL_DB(),
    lastIndexedAt: getMeta(store, 'lastIndexedAt'),
    model: getMeta(store, 'model'),
  };
}

function parseDoc(row: any): RetrievalDocument {
  let stacks: string[] = [];
  try { stacks = JSON.parse(row.stacks || '[]'); } catch { /* ignore */ }
  return {
    docId: row.doc_id,
    kind: row.kind,
    sourcePath: row.source_path,
    title: row.title,
    text: row.text,
    project: row.project ?? null,
    stacks,
    god: row.god || 'all',
    hash: row.hash,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at ?? null,
    stale: Number(row.stale) === 1,
  };
}

export function searchFts(store: RetrievalStore, query: string, limit = 40): Array<{ docId: string; rank: number; snippet: string }> {
  const sanitized = String(query || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(' ');
  if (!sanitized) return [];
  try {
    const rows = store.db.prepare(`
      SELECT doc_id, snippet(retrieval_fts, 2, '«', '»', '…', 24) AS snippet, bm25(retrieval_fts) AS score
      FROM retrieval_fts
      WHERE retrieval_fts MATCH ?
      ORDER BY score
      LIMIT ?
    `).all(sanitized, limit) as Array<{ doc_id: string; snippet: string; score: number }>;
    return rows.map((r, i) => ({ docId: r.doc_id, rank: i + 1, snippet: r.snippet }));
  } catch {
    try {
      const rows = store.db.prepare(`
        SELECT doc_id, substr(text, 1, 240) AS snippet FROM retrieval_docs
        WHERE text LIKE ? LIMIT ?
      `).all(`%${query}%`, limit) as Array<{ doc_id: string; snippet: string }>;
      return rows.map((r, i) => ({ docId: r.doc_id, rank: i + 1, snippet: r.snippet }));
    } catch {
      return [];
    }
  }
}

export function searchDense(store: RetrievalStore, embedding: number[], limit = 40): Array<{ docId: string; rank: number; distance: number }> {
  if (!embedding || embedding.length !== EMBED_DIM) return [];
  try {
    const rows = store.db.prepare(`
      SELECT rowid, distance FROM retrieval_vec
      WHERE embedding MATCH ? ORDER BY distance LIMIT ?
    `).all(Buffer.from(new Float32Array(embedding).buffer), limit) as Array<{ rowid: number; distance: number }>;
    if (rows.length === 0) return [];
    const map = store.db.prepare(
      `SELECT vec_rowid, doc_id FROM retrieval_map WHERE vec_rowid IN (${rows.map(() => '?').join(',')})`,
    ).all(...rows.map((r) => r.rowid)) as Array<{ vec_rowid: number; doc_id: string }>;
    const byRow = new Map(map.map((r) => [r.vec_rowid, r.doc_id]));
    return rows
      .map((r, i) => ({ docId: byRow.get(r.rowid), rank: i + 1, distance: r.distance }))
      .filter((r): r is { docId: string; rank: number; distance: number } => Boolean(r.docId));
  } catch (err: any) {
    return [];
  }
}

export function getDocsByIds(store: RetrievalStore, ids: string[]): Map<string, RetrievalDocument> {
  if (ids.length === 0) return new Map();
  try {
    const rows = store.db.prepare(
      `SELECT * FROM retrieval_docs WHERE doc_id IN (${ids.map(() => '?').join(',')})`,
    ).all(...ids) as any[];
    return new Map(rows.map((r) => [r.doc_id, parseDoc(r)]));
  } catch {
    return new Map();
  }
}

export function filterHit(doc: RetrievalDocument, opts: {
  kinds?: RetrievalKind[]; god?: string | null; project?: string | null; stacks?: string[] | null; includeStale?: boolean;
}): boolean {
  if (doc.stale && !opts.includeStale) return false;
  if (doc.expiresAt && Date.parse(doc.expiresAt) < Date.now() && !opts.includeStale) return false;
  if (opts.kinds && opts.kinds.length > 0 && !opts.kinds.includes(doc.kind)) return false;
  if (opts.god && doc.god !== 'all' && doc.god !== opts.god) return false;
  if (doc.project) {
    if (!opts.project || doc.project !== opts.project) return false;
  }
  if (doc.stacks.length > 0) {
    const stacks = opts.stacks ?? [];
    // Browsing mode (no active stacks) keeps stack-tagged knowledge visible;
    // an active project must intersect. Project-bound docs were already
    // gated above, so the leak surface stays closed.
    if (stacks.length > 0 && !doc.stacks.some((s) => stacks.includes(s))) return false;
  }
  return true;
}

export function toHit(doc: RetrievalDocument, score: number, ftsRank: number | null, denseRank: number | null, snippet?: string): RetrievalHit {
  return {
    ...doc,
    score,
    ftsRank,
    denseRank,
    snippet: snippet || doc.text.slice(0, 260).replace(/\s+/g, ' '),
  };
}
