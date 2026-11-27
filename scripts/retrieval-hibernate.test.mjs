#!/usr/bin/env node
/**
 * retrieval-hibernate.test.mjs — v0.1.3 hibernate/resume discipline.
 *
 * Proves the file-backed pause bit is visible to a separate indexer run,
 * that a paused run writes no partial docs, and that resume indexes the same
 * docs idempotently (hash skip, no duplicates).
 *
 * Run: npx tsx scripts/retrieval-hibernate.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-hibernate-root-'));
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-hibernate-vault-'));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-hibernate-home-'));
fs.mkdirSync(path.join(ROOT, '.opencode', 'skills', 'fixture'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.opencode', 'skills', 'fixture', 'SKILL.md'), '---\nname: fixture\ndescription: hibernate fixture\n---\n# Fixture\nA deterministic retrieval chunk.');
fs.mkdirSync(path.join(VAULT, '04_Knowledge', 'references', 'fixture'), { recursive: true });
fs.writeFileSync(path.join(VAULT, '04_Knowledge', 'references', 'fixture', 'note.md'), '---\ntitle: Fixture note\ncategory: fixture\n---\nThe hibernate note is deterministic.');

process.env.OLYMPUS_ROOT = ROOT;
process.env.OLYMPUS_VAULT = VAULT;
process.env.OLYMPUS_VAULT_ROOT = VAULT;
process.env.OLYMPUS_HOME = HOME;
process.env.OLLAMA_HOST = 'http://127.0.0.1:1';
process.on('exit', () => {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(VAULT, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {}
});

let failures = 0;
const expect = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 300)}`}`);
  if (!ok) failures++;
};

async function main() {
  const runtime = await import(OLYMPUS + '/src/lib/retrieval/runtime.ts');
  const { indexRetrieval } = await import(OLYMPUS + '/src/lib/retrieval/indexer.ts');
  const { openRetrievalStore, storeStats } = await import(OLYMPUS + '/src/lib/retrieval/store.ts');

  runtime.pauseRetrievalIndexing('test-hibernate');
  expect('H1: pause is visible in-process', runtime.isRetrievalPaused() === true);
  expect('H2: pause is visible across processes (file)', fs.existsSync(path.join(HOME, 'retrieval-paused')));

  const paused = await indexRetrieval({ force: true });
  expect('H3: paused run reports paused', paused.paused === true, JSON.stringify(paused));
  const s1 = openRetrievalStore();
  expect('H4: paused run writes no partial docs', storeStats(s1).docs === 0, JSON.stringify(storeStats(s1)));

  runtime.resumeRetrievalIndexing();
  expect('H5: resume clears the file flag', !fs.existsSync(path.join(HOME, 'retrieval-paused')));
  const first = await indexRetrieval({});
  const s2 = openRetrievalStore();
  const firstDocs = storeStats(s2).docs;
  expect('H6: resume indexes the fixtures', firstDocs >= 2, JSON.stringify({ first, stats: storeStats(s2) }));

  const second = await indexRetrieval({});
  const s3 = openRetrievalStore();
  expect('H7: a repeated run is idempotent', storeStats(s3).docs === firstDocs && second.chunks === 0, JSON.stringify({ second, stats: storeStats(s3) }));

  console.log(`\nretrieval-hibernate: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
