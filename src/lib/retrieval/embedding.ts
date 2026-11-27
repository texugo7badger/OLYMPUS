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
export const EMBED_MODEL = process.env.OLYMPUS_EMBED_MODEL || 'nomic-embed-text:v1.5';
export const EMBED_DIM = 768;
export const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const BATCH = Math.max(1, Math.min(32, Number(process.env.OLYMPUS_EMBED_BATCH) || 16));
const TIMEOUT_MS = Math.max(2_000, Number(process.env.OLYMPUS_EMBED_TIMEOUT_MS) || 30_000);

const queryCache = new Map<string, number[]>();
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

/** Batch document embedding. Preserves input order; null means unavailable. */
export async function embedDocuments(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => `search_document: ${String(t).slice(0, 8_000)}`);
    const out = await postEmbed(batch);
    if (!out || out.length !== batch.length) return null;
    for (const vec of out) {
      if (!Array.isArray(vec) || vec.length !== EMBED_DIM) return null;
      all.push(vec);
    }
  }
  return all;
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
