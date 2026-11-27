#!/usr/bin/env node
/**
 * retrieval-eval.mjs — v0.1.3: measure FTS5 vs hybrid on local labels.
 *
 * This is a small, honest in-repo eval set (15 queries) — enough to catch
 * regressions, not a benchmark claim. A human label is a set of title/path
 * substrings that count as relevant. Reports P@5, MRR@5, latency.
 *
 * Run: node scripts/retrieval-eval.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { retrieve } = await import('../src/lib/retrieval/bus.ts');

const CASES = [
  { q: 'accessible focus ring keyboard navigation', expect: ['accessib', 'a11y'] },
  { q: 'postgres explain analyze index scan', expect: ['postgres', 'query performance'] },
  { q: 'OWASP authentication session cookie', expect: ['owasp', 'authentication'] },
  { q: 'react render waterfall useMemo performance', expect: ['react-performance', 'frontend-patterns'] },
  { q: 'MCP server typescript zod tool', expect: ['mcp-server'] },
  { q: 'database migration zero downtime', expect: ['database-migration', 'migration'] },
  { q: 'Playwright flaky e2e test', expect: ['e2e', 'playwright'] },
  { q: 'GLSL shader ray marching', expect: ['shader'] },
  { q: 'context7 library documentation lookup', expect: ['documentation-lookup', 'context7'] },
  { q: 'tailwind design system tokens', expect: ['design-system', 'tailwind'] },
  { q: 'stripe webhook idempotency', expect: ['payment', 'webhook', 'stripe'] },
  { q: 'docker compose healthcheck', expect: ['docker'] },
  { q: 'kubernetes readiness probe', expect: ['kubernetes'] },
  { q: 'rust borrow checker build error', expect: ['rust', 'build-resolver'] },
  { q: 'prisma transaction timeout', expect: ['prisma'] },
];

function relevant(hit, expected) {
  const hay = `${hit.title} ${hit.sourcePath} ${hit.kind}`.toLowerCase();
  return expected.some((e) => hay.includes(e.toLowerCase()));
}
function pct(n) { return `${Math.round(n * 100)}%`; }

let ftsP = 0, hybP = 0, ftsRR = 0, hybRR = 0;
const rows = [];
for (const c of CASES) {
  const t0 = Date.now();
  const fts = await retrieve({ query: c.q, limit: 5, project: null, stacks: [], dense: false });
  const tFts = Date.now() - t0;

  const t1 = Date.now();
  const hyb = await retrieve({ query: c.q, limit: 5, project: null, stacks: [] });
  const tHyb = Date.now() - t1;

  const ftsRank = fts.findIndex((h) => relevant(h, c.expect)) + 1;
  const hybRank = hyb.findIndex((h) => relevant(h, c.expect)) + 1;
  if (ftsRank > 0 && ftsRank <= 5) ftsP++;
  if (hybRank > 0 && hybRank <= 5) hybP++;
  if (ftsRank > 0) ftsRR += 1 / ftsRank;
  if (hybRank > 0) hybRR += 1 / hybRank;
  rows.push({
    query: c.q,
    fts: ftsRank > 0 ? `${ftsRank}` : '—',
    hybrid: hybRank > 0 ? `${hybRank}` : '—',
    topHybrid: hyb[0] ? `${hyb[0].kind}:${hyb[0].title}` : '—',
    ms: { fts: tFts, hybrid: tHyb },
  });
}
console.log('retrieval-eval — FTS5 vs hybrid (768d + RRF)');
console.log('query'.padEnd(48), 'fts', 'hyb', 'top hybrid');
for (const r of rows) {
  console.log(r.query.slice(0, 46).padEnd(48), String(r.fts).padStart(3), String(r.hybrid).padStart(3), r.topHybrid.slice(0, 52));
}
console.log('\nP@5   FTS', pct(ftsP / CASES.length), ' hybrid', pct(hybP / CASES.length));
console.log('MRR@5 FTS', (ftsRR / CASES.length).toFixed(3), ' hybrid', (hybRR / CASES.length).toFixed(3));
console.log('latency (median) FTS', rows.map((r) => r.ms.fts).sort((a, b) => a - b)[Math.floor(rows.length / 2)] + 'ms',
  ' hybrid', rows.map((r) => r.ms.hybrid).sort((a, b) => a - b)[Math.floor(rows.length / 2)] + 'ms');
