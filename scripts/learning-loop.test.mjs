#!/usr/bin/env node
/**
 * learning-loop.test.mjs — v0.1.0: the brain must close the loop.
 *
 * The audit found 55 seed instincts, 3 empirical and 0 short-circuits. This
 * suite proves the two missing links:
 *   1. a completed hop writes/updates an empirical instinct (samples grow);
 *   2. the instinct gate short-circuits ONLY when both specific tags match.
 * It uses a temp vault; no model, no real campaign.
 *
 * Run: npx tsx scripts/learning-loop.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-learning-vault-'));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-learning-home-'));
process.env.OLYMPUS_VAULT = VAULT;
process.env.OLYMPUS_VAULT_ROOT = VAULT;
process.env.OLYMPUS_HOME = HOME;
process.on('exit', () => {
  try { fs.rmSync(VAULT, { recursive: true, force: true }); } catch { /* gone */ }
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* gone */ }
});

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 280)}`);
  if (!cond) failures++;
}

async function main() {
  fs.mkdirSync(path.join(VAULT, '05_Auto_Learning', 'instincts', 'hermes', 'empirical'), { recursive: true });
  const learning = await import(OLYMPUS + '/src/lib/hop-runtime/learning.ts');
  const input = {
    slug: 'fixture',
    hop: 'sakuga-sourcing',
    god: 'hermes',
    artifacts: ['evidence/clips/sakuga-candidates.md'],
    checks: ['file-exists:evidence/clips/sakuga-candidates.md'],
    promptExcerpt: 'download fan sakuga for the catalogue and match titles',
    status: 'completed',
    tokensIn: 1000,
    tokensOut: 200,
    lane: 'opencode-go/deepseek-v4.1-flash',
    ts: '2026-11-25T00:00:00.000Z',
  };
  const first = learning.recordHopLearning(input);
  expect('L1: a completed hop creates an empirical instinct', first.ok && first.created && first.samples === 1, JSON.stringify(first));
  expect('L2: the instinct has the two specific tags', Array.isArray(first.tags) && first.tags.includes('sakuga-sourcing') && first.tags.includes('sakuga-candidates'), JSON.stringify(first.tags));
  expect('L3: the file is a valid frontmatter note', fs.existsSync(first.path) && fs.readFileSync(first.path, 'utf-8').includes('source: empirical'), first.path);

  const second = learning.recordHopLearning(input);
  expect('L4: a repeated hop raises samples/confidence', second.ok && second.samples === 2 && second.confidence > first.confidence, JSON.stringify(second));

  const gate = await import(OLYMPUS + '/.opencode/src/olympus-router/src/instinct-gate.ts');
  const hit = gate.queryInstincts('god', 'hermes', 'sakuga-sourcing sakuga-candidates');
  expect('L5: the gate short-circuits on both specific tags', hit.short_circuit === true && hit.matching_instinct?.id === first.path.split('/').pop()?.replace(/\.md$/, ''), JSON.stringify({ confidence: hit.confidence, id: hit.matching_instinct?.id }));
  const miss = gate.queryInstincts('god', 'hermes', 'sakuga-sourcing only');
  expect('L6: one tag is not enough — no false short-circuit', miss.short_circuit === false, JSON.stringify({ confidence: miss.confidence }));

  const vaultParse = await import(OLYMPUS + '/src/lib/vault/parse.ts');
  const bad = vaultParse.parseNote('bad.md', '---\naction: Use OpenSpec: /opsx:explore\n---\n# Body\n', 40, new Date());
  expect('L7: invalid YAML is tolerated, not a vault-index crash', bad.body.includes('# Body') && bad.frontmatter.action === 'Use OpenSpec: /opsx:explore', JSON.stringify(bad.frontmatter));

  console.log(`\nlearning-loop: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
