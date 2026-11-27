#!/usr/bin/env node
/**
 * retrieval-index.mjs — v0.1.3: build/refresh the local hybrid index.
 *
 * FTS5 + 768d nomic-embed-text via Ollama. Incremental by content hash.
 * Usage:
 *   npm run retrieval:index
 *   npm run retrieval:index -- --force
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { indexRetrieval } = await import(ROOT + '/src/lib/retrieval/indexer.ts');

const force = process.argv.includes('--force');
const t0 = Date.now();
const result = await indexRetrieval({
  force,
  onProgress: (p) => {
    if (p.done % 50 === 0 || p.done === p.total) {
      process.stdout.write(`\r  docs ${p.done}/${p.total} · embedded ${p.embedded} · skipped ${p.skipped}`);
    }
  },
});
process.stdout.write('\n');
console.log(JSON.stringify({ ...result, seconds: Math.round((Date.now() - t0) / 1000) }, null, 2));
