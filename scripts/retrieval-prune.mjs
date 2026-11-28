#!/usr/bin/env node
/**
 * retrieval-prune.mjs — v0.1.7: remove index rows whose source file is gone.
 *
 * The brain reset moves 1,350 instinct files out of the active tree. The
 * retrieval index kept their old rows, so search still returned archived
 * memories. This prunes only rows whose `source_path` no longer exists; it
 * never touches a live document. The FTS/vector maps are deleted together.
 *
 * Usage: npm run retrieval:prune
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import { closeRetrievalStore, deleteChunk, getRetrievalStore, storeStats } from '../src/lib/retrieval/store.ts';

const store = getRetrievalStore();
const rows = store.db.prepare('SELECT doc_id, source_path FROM retrieval_docs').all();
const missing = rows.filter((r) => !fs.existsSync(r.source_path));
for (const row of missing) deleteChunk(store, row.doc_id);
console.log(`retrieval-prune: ${missing.length} orphan row(s) removed of ${rows.length}; ${storeStats(store).docs} live docs remain`);
closeRetrievalStore();
