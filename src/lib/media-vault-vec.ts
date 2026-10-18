/**
 * media-vault-vec.ts — #150 SQLITE-VEC-1 (v0.0.5): the vector search layer
 * behind the MEDIA-VAULT wrap. sqlite-vec v0.1.9 (PINNED — pre-v1), loaded
 * into better-sqlite3 (the repo's existing engine), vec0 virtual tables +
 * KNN. Callers NEVER touch sqlite-vec raw — this is the only door.
 *
 * The embedding source: Pollinations /v1/embeddings
 * (openai/text-embedding-3-small) — key-gated BYOK (a free key from
 * enter.pollinations.ai). WITHOUT a key the search falls back to the
 * keyword pass (media-vault.ts) — honest, never a fake semantic.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MEDIA_VAULT_DIR, type MediaAsset } from './media-vault';

// PINNED (the issue's own rule): pre-v1 — never float this.
export const SQLITE_VEC_VERSION = 'v0.1.9';

const VEC_DB_PATH = path.join(MEDIA_VAULT_DIR, 'vectors.db');
const EMBED_DIM = 1536; // openai/text-embedding-3-small

/** The Atelier BYOK config (~/.olympus/atelier.json). */
export interface AtelierKeys { pollinations_key?: string; google_key?: string; }
export function readAtelierKeys(): AtelierKeys {
  try {
    const p = path.join(os.homedir(), '.olympus', 'atelier.json');
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as AtelierKeys;
  } catch { return {}; }
}

let db: Database.Database | null = null;
function vecDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(MEDIA_VAULT_DIR, { recursive: true });
  db = new Database(VEC_DB_PATH);
  sqliteVec.load(db);
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS asset_vectors USING vec0(
    embedding float[${EMBED_DIM}],
    +asset_id TEXT,
    +text TEXT
  )`);
  return db;
}

/** Embed one text via Pollinations — null when no key (the caller falls back). */
export async function embedText(text: string): Promise<Float32Array | null> {
  const keys = readAtelierKeys();
  if (!keys.pollinations_key) return null;
  try {
    const r = await fetch('https://gen.pollinations.ai/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.pollinations_key}` },
      body: JSON.stringify({ input: text.slice(0, 4000), model: 'openai/text-embedding-3-small' }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const d: any = await r.json();
    const emb = d?.data?.[0]?.embedding;
    if (!Array.isArray(emb) || emb.length !== EMBED_DIM) return null;
    return Float32Array.from(emb);
  } catch {
    return null;
  }
}

/** Index (or re-index) an asset's description+tags. No key = a no-op (honest). */
export async function indexAsset(asset: MediaAsset): Promise<boolean> {
  const text = [asset.description ?? '', (asset.tags ?? []).join(' '), asset.suggestedUse ?? ''].join(' ').trim();
  if (!text) return false;
  const emb = await embedText(text);
  if (!emb) return false;
  const d = vecDb();
  d.prepare('DELETE FROM asset_vectors WHERE asset_id = ?').run(asset.id);
  d.prepare('INSERT INTO asset_vectors(rowid, embedding, asset_id, text) VALUES (?, ?, ?, ?)')
    .run(nextRowId(), vecBlob(emb), asset.id, text);
  return true;
}

/** The semantic KNN search — null when unavailable (the keyword fallback runs). */
export function searchByVector(query: string, limit = 24): MediaAsset['id'][] | null {
  if (!readAtelierKeys().pollinations_key) return null;
  // The query embedding is async in embedText — for the sync interface we
  // pre-embed in searchSemantic below; this sync path is the internal helper.
  return null;
}

/** The full async semantic path — null = unavailable (fall back to keyword). */
export async function searchSemantic(query: string, limit = 24): Promise<MediaAsset['id'][] | null> {
  if (!readAtelierKeys().pollinations_key) return null;
  const q = await embedText(query);
  if (!q) return null;
  const rows = vecDb()
    .prepare('SELECT asset_id, distance FROM asset_vectors WHERE embedding MATCH ? AND k = ? ORDER BY distance')
    .all(vecBlob(q), Math.min(limit, 64));
  return rows.map((r: any) => String(r.asset_id));
}

/** Re-index the whole vault (idempotent — the maintenance entry point). */
export async function reindexVault(): Promise<{ indexed: number; skipped: number }> {
  const { listAssets } = await import('./media-vault');
  let indexed = 0, skipped = 0;
  for (const a of listAssets(1000)) {
    if (await indexAsset(a)) indexed++;
    else skipped++;
  }
  return { indexed, skipped };
}

// ── internals ───────────────────────────────────────────────────────────────
let rowIdCounter = 1;
function nextRowId(): bigint {
  const d = vecDb();
  const row = d.prepare('SELECT COALESCE(MAX(rowid), 0) + 1 AS next FROM asset_vectors').get() as any;
  rowIdCounter = Number(row?.next ?? rowIdCounter);
  return BigInt(rowIdCounter);
}
function vecBlob(f: Float32Array): Buffer {
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}
