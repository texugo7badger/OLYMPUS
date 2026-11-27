/**
 * retrieval/embedding.ts — v0.1.3: local Ollama embeddings (768d).
 *
 * nomic-embed-text:v1.5 is Apache-2.0, 8192-token context and 768 dimensions.
 * The task prefixes are mandatory for the model's retrieval behaviour:
 * `search_document:` for indexed text, `search_query:` for the query.
 *
 * The lane never blocks a hop: no Ollama, a timeout or an HTTP failure
 * returns null and the caller falls back to FTS5.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

export const EMBED_MODEL = process.env.OLYMPUS_EMBED_MODEL || 'nomic-embed-text:v1.5';
export const EMBED_DIM = 768;
export const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const BATCH = Math.max(1, Math.min(32, Number(process.env.OLYMPUS_EMBED_BATCH) || 16));
const TIMEOUT_MS = Math.max(2_000, Number(process.env.OLYMPUS_EMBED_TIMEOUT_MS) || 30_000);

const queryCache = new Map<string, number[]>();

/* ------------------------------------------------------------------ */
/* v0.1.4 — the content-addressed embedding cache.                     */
/* A --force rebuild and a chunker change used to re-embed every chunk; */
/* this cache makes unchanged text free. The key includes the model,    */
/* so a model swap never reuses a stale vector.                        */
/* ------------------------------------------------------------------ */
const CACHE_HOME = () => process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const CACHE_DB = () => process.env.OLYMPUS_EMBED_CACHE_DB || path.join(CACHE_HOME(), 'embedding-cache.db');
let cacheDb: Database.Database | null = null;

function cacheKey(text: string): string {
  return crypto.createHash('sha256').update(`${EMBED_MODEL}\u0000${text}`).digest('hex');
}

function openCache(): Database.Database | null {
  try {
    if (cacheDb) return cacheDb;
    fs.mkdirSync(path.dirname(CACHE_DB()), { recursive: true });
    const db = new Database(CACHE_DB());
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        key TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        dim INTEGER NOT NULL,
        vector BLOB NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    cacheDb = db;
    return db;
  } catch {
    return null;
  }
}

export function getCachedVector(text: string): number[] | null {
  const db = openCache();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT vector, dim FROM embedding_cache WHERE key = ?').get(cacheKey(text)) as { vector: Buffer; dim: number } | undefined;
    if (!row || row.dim !== EMBED_DIM) return null;
    const vec = Array.from(new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4));
    return vec.length === EMBED_DIM ? vec : null;
  } catch {
    return null;
  }
}

export function putCachedVector(text: string, vector: number[]): void {
  if (!Array.isArray(vector) || vector.length !== EMBED_DIM) return;
  const db = openCache();
  if (!db) return;
  try {
    db.prepare('INSERT OR REPLACE INTO embedding_cache (key, model, dim, vector, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(cacheKey(text), EMBED_MODEL, EMBED_DIM, Buffer.from(new Float32Array(vector).buffer), new Date().toISOString());
  } catch { /* cache is an optimization, never a blocker */ }
}

export function embeddingCacheStats() {
  const db = openCache();
  if (!db) return { ready: false, entries: 0, dbPath: CACHE_DB() };
  try {
    const entries = (db.prepare('SELECT COUNT(*) AS n FROM embedding_cache').get() as { n: number }).n;
    return { ready: true, entries, dbPath: CACHE_DB() };
  } catch {
    return { ready: false, entries: 0, dbPath: CACHE_DB() };
  }
}
const QUERY_CACHE_MAX = 200;

function cacheGet(key: string): number[] | null {
  const hit = queryCache.get(key);
  if (!hit) return null;
  // LRU touch
  queryCache.delete(key);
  queryCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: number[]) {
  queryCache.set(key, value);
  while (queryCache.size > QUERY_CACHE_MAX) {
    const first = queryCache.keys().next().value;
    if (!first) break;
    queryCache.delete(first);
  }
}

async function postEmbed(input: string[], keepAlive: string | number = '5m'): Promise<number[][] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input, keep_alive: keepAlive }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json() as { embeddings?: number[][] };
    if (!Array.isArray(data?.embeddings)) return null;
    return data.embeddings;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Warm query embedding. Returns null when the local lane is unavailable. */
export async function embedQuery(query: string): Promise<number[] | null> {
  const text = String(query || '').trim();
  if (!text) return null;
  const cached = cacheGet(`q:${text}`);
  if (cached) return cached;
  const out = await postEmbed([`search_query: ${text.slice(0, 8_000)}`]);
  const vec = out?.[0];
  if (!vec || vec.length !== EMBED_DIM) return null;
  cacheSet(`q:${text}`, vec);
  return vec;
}

/** Batch document embedding with cache stats. Preserves input order. */
export async function embedDocumentsWithStats(texts: string[]): Promise<{ vectors: number[][] | null; hits: number; misses: number }> {
  if (texts.length === 0) return { vectors: [], hits: 0, misses: 0 };
  const all: number[][] = [];
  let hits = 0;
  let misses = 0;
  for (let i = 0; i < texts.length; i += BATCH) {
    const raw = texts.slice(i, i + BATCH);
    const vectors: Array<number[] | null> = raw.map((t) => getCachedVector(t));
    const missing = raw.map((t, idx) => (vectors[idx] ? -1 : idx)).filter((idx) => idx >= 0);
    hits += raw.length - missing.length;
    if (missing.length > 0) {
      const batch = missing.map((idx) => `search_document: ${String(raw[idx]).slice(0, 8_000)}`);
      const out = await postEmbed(batch);
      if (!out || out.length !== batch.length) return { vectors: null, hits, misses };
      for (let k = 0; k < missing.length; k++) {
        const vec = out[k];
        if (!Array.isArray(vec) || vec.length !== EMBED_DIM) return { vectors: null, hits, misses };
        vectors[missing[k]] = vec;
        putCachedVector(raw[missing[k]], vec);
        misses++;
      }
    }
    for (const vec of vectors) {
      if (!vec || vec.length !== EMBED_DIM) return { vectors: null, hits, misses };
      all.push(vec);
    }
  }
  return { vectors: all, hits, misses };
}

/** Batch document embedding. Preserves input order; null means unavailable. */
export async function embedDocuments(texts: string[]): Promise<number[][] | null> {
  return (await embedDocumentsWithStats(texts)).vectors;
}

export async function ollamaAvailable(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2_500);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) return false;
    const data = await res.json() as { models?: Array<{ name?: string }> };
    return Boolean(data?.models?.some((m) => String(m.name || '').startsWith(EMBED_MODEL.split(':')[0])));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort unload on hibernate; Ollama may be shared, so never throw. */
export async function releaseOllamaModel(): Promise<void> {
  try {
    await postEmbed([''], 0);
  } catch { /* the model unloads by keep_alive anyway */ }
}

export function embeddingStatus() {
  return { model: EMBED_MODEL, dimensions: EMBED_DIM, url: OLLAMA_URL, batch: BATCH };
}
