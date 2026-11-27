#!/usr/bin/env node
/**
 * skill-index.test.mjs — v0.1.3: the skill index must return the right skill.
 *
 * Regression for two bugs found in the core audit:
 *   1. metadata rowid was 0-based while vec0 rowids start at 1 (off-by-one);
 *   2. L2 distance was reported as cosine (negative "similarities").
 *
 * Requires the local skill index: node scripts/build-skill-index.js
 * Run: npx tsx scripts/skill-index.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(os.homedir(), 'OLYMPUS-VAULT', '03_Index', 'skill-vec.db');
let failures = 0;
const expect = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 300)}`}`);
  if (!ok) failures++;
};

async function main() {
  if (!fs.existsSync(DB)) {
    console.log('SKIP  skill index not built (run node scripts/build-skill-index.js)');
    process.exit(0);
  }
  const raw = new Database(DB, { readonly: true });
  const meta = raw.prepare('SELECT MIN(rowid) lo, MAX(rowid) hi, COUNT(*) n FROM skill_metadata').get();
  raw.close();
  expect('I1: metadata rowids start at 1', meta.lo === 1, JSON.stringify(meta));
  expect('I2: metadata rowids are contiguous', meta.hi === meta.n, JSON.stringify(meta));

  const { SkillIndex } = await import(OLYMPUS + '/.opencode/src/olympus-router/src/skill-index.ts');
  const idx = new SkillIndex();
  const cases = [
    ['accessibility wcag aria', 'athena', 'accessibility'],
    ['postgres index query performance', 'persephone', 'postgres-patterns'],
    ['security owasp authentication', 'artemis', 'security-review'],
  ];
  for (const [query, god, expected] of cases) {
    const hits = idx.search(query, god, 5);
    const top = hits[0];
    expect(`I3: "${query}" finds ${expected} in the top 5`, hits.some((h) => h.skill_id.includes(expected)), hits.map((h) => `${h.skill_id}:${h.similarity.toFixed(2)}`).join(', '));
    expect(`I4: "${query}" has positive similarity`, Boolean(top && top.similarity > 0), JSON.stringify(top));
  }
  idx.close();
  console.log(`\nskill-index: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
