#!/usr/bin/env node
/**
 * retrieval-bench.mjs — v0.1.3: measured local retrieval cost.
 *
 * Reports index size/docs/embedded, query embedding + hybrid latency
 * (p50/p95), FTS-only latency, and the top hit for a few probes. No claim
 * without numbers; the environment (Ollama model/GPU) is printed.
 *
 * Run: node scripts/retrieval-bench.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { retrieve } = await import('../src/lib/retrieval/bus.ts');
const { getRetrievalStore, storeStats } = await import('../src/lib/retrieval/store.ts');
const { embeddingStatus, ollamaAvailable } = await import('../src/lib/retrieval/embedding.ts');

const DB = path.join(process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'retrieval.db');
const store = getRetrievalStore();
const stats = storeStats(store);
const dbBytes = fs.existsSync(DB) ? fs.statSync(DB).size : 0;
const queries = [
  'accessible focus ring keyboard navigation',
  'postgres explain analyze index scan',
  'OWASP authentication session cookie',
  'react render waterfall useMemo performance',
  'MCP server typescript zod tool',
  'prisma transaction timeout',
];
const lat = { fts: [], hybrid: [] };
for (const q of queries) {
  let t = Date.now();
  await retrieve({ query: q, limit: 5, project: null, stacks: [], dense: false });
  lat.fts.push(Date.now() - t);
  t = Date.now();
  await retrieve({ query: q, limit: 5, project: null, stacks: [] });
  lat.hybrid.push(Date.now() - t);
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
console.log(JSON.stringify({
  environment: {
    ...embeddingStatus(),
    ollama: await ollamaAvailable(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  index: {
    ...stats,
    dbBytes,
    dbMB: Math.round((dbBytes / 1048576) * 10) / 10,
  },
  latencyMs: {
    fts: { p50: pct(lat.fts, 50), p95: pct(lat.fts, 95) },
    hybrid: { p50: pct(lat.hybrid, 50), p95: pct(lat.hybrid, 95) },
  },
  sample: (await retrieve({ query: 'accessible focus ring keyboard navigation', limit: 3, project: null, stacks: [] })).map((h) => ({ kind: h.kind, title: h.title, score: Math.round(h.score * 10000) / 10000 })),
}, null, 2));
