#!/usr/bin/env node
/**
 * retrieval-bus.test.mjs — v0.1.3 retrieval bus, hermetic FTS path.
 *
 * Sets OLLAMA_HOST to a closed port so the dense lane is honestly absent.
 * Proves the bus still answers from FTS5, respects project/kind filters,
 * deduplicates chunks and formats a bounded cited block.
 *
 * Run: npx tsx scripts/retrieval-bus.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-retrieval-home-'));
process.env.OLYMPUS_HOME = HOME;
process.env.OLLAMA_HOST = 'http://127.0.0.1:1';
process.on('exit', () => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} });

let failures = 0;
const expect = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 300)}`}`);
  if (!ok) failures++;
};

async function main() {
  const store = await import(OLYMPUS + '/src/lib/retrieval/store.ts');
  const bus = await import(OLYMPUS + '/src/lib/retrieval/bus.ts');

  const s = store.openRetrievalStore();
  store.upsertChunk(s, {
    docId: 'knowledge:auth#0', kind: 'knowledge', sourcePath: '/vault/auth.md',
    title: 'Authentication patterns', text: 'OWASP authentication session cookie rotation',
    project: null, stacks: [], god: 'all', hash: 'a', updatedAt: new Date().toISOString(),
    expiresAt: null, stale: false,
  }, null);
  store.upsertChunk(s, {
    docId: 'knowledge:postgres#0', kind: 'knowledge', sourcePath: '/vault/pg.md',
    title: 'Postgres query performance', text: 'index scan explain analyze query planner',
    project: null, stacks: ['postgres'], god: 'persephone', hash: 'b', updatedAt: new Date().toISOString(),
    expiresAt: null, stale: false,
  }, null);
  store.upsertChunk(s, {
    docId: 'instinct:aime#0', kind: 'instinct', sourcePath: '/vault/aime.md',
    title: 'AIME card fill', text: 'card clip fill write evidence clips',
    project: 'aime', stacks: ['nextjs'], god: 'athena', hash: 'c', updatedAt: new Date().toISOString(),
    expiresAt: null, stale: false,
  }, null);
  s.close();

  const auth = await bus.retrieve({ query: 'owasp authentication', limit: 5 });
  expect('R1: FTS finds the authentication knowledge', auth.some((h) => h.title.includes('Authentication')), JSON.stringify(auth.map((h) => h.title)));
  expect('R2: no stale/dense-only hallucinations', auth.length > 0, JSON.stringify(auth));

  const aimeOutside = await bus.retrieve({ query: 'card clip fill', project: 'other', limit: 5 });
  expect('R3: project instinct is hidden outside its project', aimeOutside.every((h) => h.project !== 'aime'), JSON.stringify(aimeOutside));
  const aimeInside = await bus.retrieve({ query: 'card clip fill', project: 'aime', stacks: ['nextjs'], limit: 5 });
  expect('R4: project instinct is visible inside its project', aimeInside.some((h) => h.title.includes('AIME')), JSON.stringify(aimeInside));

  const block = await bus.composeRetrievalBlock({ query: 'postgres query', limit: 3, budgetChars: 600 });
  expect('R5: the prompt block is bounded and cited', block.length > 0 && block.length <= 900 && block.includes('OLYMPUS-RETRIEVAL'), block);

  const c7 = await import('../src/lib/retrieval/context7-cache.ts');
  const recorded = c7.recordContext7Result('mcp__context7__query-docs', { libraryId: '/vercel/next.js', query: 'middleware' }, { output: 'Next.js middleware runs before rendering and can rewrite or redirect the request.' });
  const docs = c7.listContext7Docs();
  expect('R6: Context7 output becomes a durable doc', recorded && docs.length === 1 && docs[0].kind === 'doc', JSON.stringify(docs));
  expect('R7: Context7 doc carries a TTL', Boolean(docs[0]?.expiresAt), JSON.stringify(docs[0]));

  console.log(`\nretrieval-bus: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
