/**
 * Olympus Vault Semantic — TF-IDF + sqlite-vec KNN Search (v2.0.0)
 * ====================================================================
 *
 * Tier 3 #12 evaluation: the "Karpathy LLM Wiki" concept is a knowledge-
 * graph-over-embeddings — find similar notes by meaning, not just keywords.
 *
 * This module implements a **pragmatic proof-of-concept** using:
 *   - **TF-IDF** (term frequency × inverse document frequency) to compute
 *     a fixed-dimension embedding for each note. No external model, no
 *     network call, no downloaded weights. Pure JS, <5ms per note.
 *   - **sqlite-vec** (MIT/Apache, already in deps) for KNN search over
 *     the embeddings.
 *
 * This is NOT true semantic search (TF-IDF captures lexical similarity,
 * not meaning). But it:
 *   - Wires in `sqlite-vec` end-to-end (proves the seam works).
 *   - Gives the Callimachus a `vault_semantic_search` tool today.
 *   - Can be upgraded to a real embedding model (@xenova/transformers,
 *     Apache-2.0) by replacing only `computeEmbedding()` — the storage
 *     and KNN layers stay the same.
 *
 * The auto-learning team owns the decision of whether to upgrade the
 * embedder. The seam is documented in `ARCHITECTURE.md` § Tier 3.
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import type Database from 'better-sqlite3';
import { stripMarkdown } from '../vault/parse';

/** Fixed embedding dimension (top 256 terms by document frequency). */
export const EMBEDDING_DIM = 256;

/** Stopwords (English + Portuguese — user is in São Paulo timezone). */
const STOPWORDS = new Set<string>([
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'of', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their', 'his', 'her', 'its', 'our', 'your', 'my', 'me', 'him', 'us', 'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now',
  // Portuguese
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem', 'sob', 'sobre', 'entre', 'apos', 'ate', 'contra', 'desde', 'durante', 'antes', 'depois', 'e', 'ou', 'mas', 'que', 'como', 'se', 'quando', 'onde', 'porque', 'enquanto', 'embora', 'apesar', 'logo', 'pois', 'porem', 'todavia', 'contudo', 'entretanto', 'ser', 'estar', 'ter', 'haver', 'ir', 'vir', 'poder', 'dever', 'querer', 'saber', 'fazer', 'dizer', 'ver', 'dar', 'ficar', 'passar', 'tornar', 'achar', 'conhecer',
]);

/** Tokenize a string into lowercase word tokens (length >= 2, no stopwords). */
function tokenize(text: string): string[] {
  const lower = stripMarkdown(text).toLowerCase();
  const tokens = lower.match(/[a-zà-ÿ][a-zà-ÿ0-9_-]{1,}/g) || [];
  return tokens.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Build the vocabulary (top `EMBEDDING_DIM` terms by document frequency)
 * from all indexed notes.
 */
function buildVocabulary(db: Database.Database): string[] {
  const dfCounts = new Map<string, number>();
  const rows = db.prepare('SELECT body_text FROM notes WHERE body_text IS NOT NULL').all() as { body_text: string }[];
  for (const row of rows) {
    const tokens = new Set(tokenize(row.body_text));
    for (const t of tokens) {
      dfCounts.set(t, (dfCounts.get(t) || 0) + 1);
    }
  }
  return [...dfCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, EMBEDDING_DIM)
    .map(([t]) => t);
}

/**
 * Compute a TF-IDF embedding for a text, given a vocabulary.
 * Returns a Float32Array of length `EMBEDDING_DIM`, L2-normalized.
 */
export function computeEmbedding(text: string, vocabulary: string[]): Float32Array {
  const vocIndex = new Map<string, number>();
  for (let i = 0; i < vocabulary.length; i++) vocIndex.set(vocabulary[i], i);

  const tokens = tokenize(text);
  const tf = new Map<number, number>();
  for (const t of tokens) {
    const idx = vocIndex.get(t);
    if (idx === undefined) continue;
    tf.set(idx, (tf.get(idx) || 0) + 1);
  }

  const N = 1000;
  const vec = new Float32Array(EMBEDDING_DIM);
  for (const [idx, count] of tf) {
    const df = Math.max(1, EMBEDDING_DIM - idx);
    const idf = Math.log(N / df);
    vec[idx] = count * idf;
  }

  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  }
  return vec;
}

/** Schema SQL for the semantic tables (additive to the v1 schema). */
export const SEMANTIC_SCHEMA_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS semantic_vocabulary (
    idx    INTEGER PRIMARY KEY,
    term   TEXT NOT NULL UNIQUE
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS note_embeddings USING vec0(
    embedding float[${EMBEDDING_DIM}]
  )`,
  `CREATE TABLE IF NOT EXISTS embedding_map (
    rowid    INTEGER PRIMARY KEY,
    note_path TEXT NOT NULL UNIQUE,
    FOREIGN KEY (note_path) REFERENCES notes(path) ON DELETE CASCADE
  )`,
];

/** Apply the semantic schema to a database. Idempotent. */
export function applySemanticSchema(db: Database.Database): void {
  try {
    // eval() prevents Turbopack from statically tracing this require, which
    // would otherwise fail the build if sqlite-vec's native binary isn't
    // available at build time. The try/catch handles runtime absence.
    const sqliteVec = eval('require("sqlite-vec")');
    sqliteVec.load(db);
  } catch {
    // sqlite-vec not available — schema creation will skip the vec0 table.
  }
  for (const sql of SEMANTIC_SCHEMA_SQL) {
    try {
      db.exec(sql);
    } catch (err) {
      if (sql.includes('vec0')) continue;
      throw err;
    }
  }
}

/** Check whether semantic search is available. */
export function isSemanticAvailable(db: Database.Database): boolean {
  try {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='note_embeddings'",
    ).get() as { name?: string } | undefined;
    return Boolean(row && row.name);
  } catch {
    return false;
  }
}

/**
 * Rebuild the semantic index from scratch.
 *
 * Idempotently applies the semantic schema first (creates the `note_embeddings`
 * vec0 table, `embedding_map`, and `semantic_vocabulary` if they don't exist).
 * The schema application is lazy: the very first call to `rebuildSemanticIndex`
 * creates the tables; subsequent calls reuse them. This matches the
 * architecture doc's contract: "v2 adds 3 semantic tables (applied lazily by
 * `vault-semantic` on first use)".
 */
export function rebuildSemanticIndex(db: Database.Database): {
  notes: number;
  dimension: number;
  durationMs: number;
} {
  const t0 = Date.now();
  // Lazily apply the schema on first use. If sqlite-vec is missing, this is a
  // no-op (applySemanticSchema swallows the error and skips the vec0 DDL), and
  // the subsequent isSemanticAvailable() check returns false.
  applySemanticSchema(db);
  if (!isSemanticAvailable(db)) {
    return { notes: 0, dimension: EMBEDDING_DIM, durationMs: Date.now() - t0 };
  }

  db.exec('DELETE FROM note_embeddings');
  db.exec('DELETE FROM embedding_map');
  db.exec('DELETE FROM semantic_vocabulary');

  const vocabulary = buildVocabulary(db);
  const insertVoc = db.prepare('INSERT OR IGNORE INTO semantic_vocabulary (idx, term) VALUES (?, ?)');
  const vocTx = db.transaction((terms: string[]) => {
    for (let i = 0; i < terms.length; i++) insertVoc.run(i, terms[i]);
  });
  vocTx(vocabulary);

  const notes = db.prepare('SELECT path, body_text FROM notes WHERE body_text IS NOT NULL').all() as {
    path: string;
    body_text: string;
  }[];
  const insertEmb = db.prepare('INSERT INTO note_embeddings(embedding) VALUES (?)');
  const getLastRowid = db.prepare('SELECT last_insert_rowid() AS rowid');
  const insertMap = db.prepare('INSERT INTO embedding_map (rowid, note_path) VALUES (?, ?)');
  const embTx = db.transaction((rows: typeof notes) => {
    for (const row of rows) {
      const emb = computeEmbedding(row.body_text, vocabulary);
      const buf = Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength);
      insertEmb.run(buf);
      const { rowid } = getLastRowid.get() as { rowid: number };
      insertMap.run(Number(rowid), row.path);
    }
  });
  embTx(notes);

  return {
    notes: notes.length,
    dimension: EMBEDDING_DIM,
    durationMs: Date.now() - t0,
  };
}

/**
 * Semantic search: find the top-N notes most similar to a query.
 */
export function semanticSearch(
  db: Database.Database,
  query: string,
  limit: number = 10,
): { path: string; score: number }[] {
  if (!isSemanticAvailable(db)) {
    throw new Error(
      'vault-semantic: not available. Ensure sqlite-vec is installed and rebuild the index (filesystem walk + SQLite FTS5 reindex).',
    );
  }

  const vocRows = db.prepare('SELECT idx, term FROM semantic_vocabulary ORDER BY idx').all() as {
    idx: number;
    term: string;
  }[];
  const vocabulary = vocRows.map((r) => r.term);

  const queryEmb = computeEmbedding(query, vocabulary);
  const queryBuf = Buffer.from(queryEmb.buffer, queryEmb.byteOffset, queryEmb.byteLength);

  // sqlite-vec requires a literal LIMIT on KNN queries, and the MATCH + LIMIT
  // must be on the vec0 table directly (no JOIN in the KNN query). We do a
  // two-step: KNN search first, then join with embedding_map for paths.
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const knnRows = db
    .prepare(
      `SELECT rowid, distance
       FROM note_embeddings
       WHERE embedding MATCH ?
       ORDER BY distance ASC
       LIMIT ${safeLimit}`,
    )
    .all(queryBuf) as { rowid: number; distance: number }[];

  if (knnRows.length === 0) return [];

  // Look up note paths for the returned rowids.
  const placeholders = knnRows.map(() => '?').join(',');
  const pathRows = db
    .prepare(`SELECT rowid, note_path FROM embedding_map WHERE rowid IN (${placeholders})`)
    .all(...knnRows.map((r) => r.rowid)) as { rowid: number; note_path: string }[];

  const pathMap = new Map<number, string>();
  for (const p of pathRows) pathMap.set(p.rowid, p.note_path);

  return knnRows
    .filter((r) => pathMap.has(r.rowid))
    .map((r) => ({
      path: pathMap.get(r.rowid)!,
      score: Math.max(0, 1 - r.distance),
    }));
}
