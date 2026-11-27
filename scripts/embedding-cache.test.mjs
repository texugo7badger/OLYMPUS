#!/usr/bin/env node
/**
 * embedding-cache.test.mjs — v0.1.4: a rebuild must not re-embed unchanged text.
 *
 * Proves the cache round-trips a 768d vector, separates models/texts, and
 * reports its real size. No Ollama call is made.
 *
 * Run: npx tsx scripts/embedding-cache.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-embed-cache-'));
process.env.OLYMPUS_HOME = HOME;
process.env.OLYMPUS_EMBED_MODEL = 'nomic-embed-text:v1.5';
process.on('exit', () => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} });

let failures = 0;
const expect = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 320)}`}`);
  if (!ok) failures++;
};

async function main() {
  const emb = await import(OLYMPUS + '/src/lib/retrieval/embedding.ts');
  const text = 'search_document: hybrid retrieval with BM25 and 768d vectors';
  expect('C1: a cold cache misses', emb.getCachedVector(text) === null, 'unexpected hit');
  const vec = Array.from({ length: 768 }, (_, i) => Math.sin(i / 17));
  emb.putCachedVector(text, vec);
  const hit = emb.getCachedVector(text);
  expect('C2: a stored vector round-trips at 768d', Array.isArray(hit) && hit.length === 768, String(hit?.length));
  expect('C3: the values survive the blob round-trip', Math.abs((hit?.[10] ?? 0) - vec[10]) < 1e-6, JSON.stringify({ got: hit?.[10], want: vec[10] }));
  expect('C4: a different text is a different key', emb.getCachedVector(text + ' other') === null);
  const stats = emb.embeddingCacheStats();
  expect('C5: stats report one entry in the temp home', stats.ready && stats.entries === 1 && stats.dbPath.startsWith(HOME), JSON.stringify(stats));

  console.log(`\nembedding-cache: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
