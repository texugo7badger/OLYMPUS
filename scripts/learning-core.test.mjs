#!/usr/bin/env node
/**
 * learning-core.test.mjs — v0.1.3 P0 contract.
 *
 * Proves:
 *   - outcome normalization (completed != success without verify);
 *   - the ECC confidence formula (a lucky 2/2 is not a short-circuit);
 *   - project-scoped instinct RAG never leaks AIME into another project;
 *   - the gate only short-circuits a proven quick circuit in the right scope.
 *
 * Run: npx tsx scripts/learning-core.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-learning-core-'));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-learning-home-'));
process.env.OLYMPUS_VAULT = VAULT;
process.env.OLYMPUS_VAULT_ROOT = VAULT;
process.env.OLYMPUS_HOME = HOME;
process.on('exit', () => {
  try { fs.rmSync(VAULT, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {}
});

let failures = 0;
const expect = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 300)}`}`);
  if (!ok) failures++;
};

const note = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n# Fixture\n`;

async function main() {
  const outcome = await import(OLYMPUS + '/src/lib/learning/outcome.ts');
  const conf = await import(OLYMPUS + '/src/lib/learning/confidence.ts');
  const rag = await import(OLYMPUS + '/src/lib/instinct-rag.ts');
  const gate = await import(OLYMPUS + '/.opencode/src/olympus-router/src/instinct-gate.ts');

  expect('O1: completed+verified is success', outcome.normalizeOutcome('completed', { verified: true }).outcome === 'success');
  expect('O2: completed without verify is failure', outcome.normalizeOutcome('completed', { verified: false }).outcome === 'failure');
  expect('O3: parked is failure', outcome.normalizeOutcome('parked-verify-failed').outcome === 'failure');
  expect('O4: unknown is not success', outcome.normalizeOutcome('mystery').outcome === 'unknown');

  const c2 = conf.computeInstinctConfidence({ successes: 2, failures: 0 });
  const c25 = conf.computeInstinctConfidence({ successes: 25, failures: 0 });
  expect('C1: 2/2 confidence is below 0.6', c2.confidence < 0.6, JSON.stringify(c2));
  expect('C2: 25/25 confidence is below 0.85', c25.confidence < 0.85, JSON.stringify(c25));
  expect('C3: cap is 0.95', conf.computeInstinctConfidence({ successes: 1000, failures: 0 }).confidence <= 0.95);

  const dir = path.join(VAULT, '05_Auto_Learning', 'project-instincts', 'aime', 'athena');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'aime-card.md'), note({
    god: '"athena"', confidence: 0.95, samples: 40, successes: 40, failures: 0,
    scope: 'project', projects: '["aime"]', stacks: '["nextjs"]', quick_circuit: 'false',
    trigger: '"card clip fill in aime"', action: '"write evidence/clips/card.md"', source: 'empirical',
  }));

  const leak = rag.instinctPriorContext('athena', 'fix the card clip fill', { project: 'other', stacks: ['nextjs'] });
  const own = rag.instinctPriorContext('athena', 'fix the card clip fill', { project: 'aime', stacks: ['nextjs'] });
  expect('S1: AIME instinct does not leak into another project', leak === null, leak || 'leak');
  expect('S2: AIME instinct is visible inside AIME', Boolean(own && own.includes('card.md')), own || 'missing');

  const other = gate.queryInstincts('god', 'athena', 'card clip fill', 3, { project: 'other', stacks: ['nextjs'] });
  const inside = gate.queryInstincts('god', 'athena', 'card clip fill', 3, { project: 'aime', stacks: ['nextjs'] });
  expect('G1: gate hides the project instinct outside its project', other.matching_instinct === null, JSON.stringify(other));
  expect('G2: project memory is visible inside its project but never short-circuits', inside.matching_instinct !== null && inside.visibility === 'project' && inside.short_circuit === false, JSON.stringify({ confidence: inside.confidence, visibility: inside.visibility, short: inside.short_circuit }));

  const feedDir = path.join(VAULT, '06_Activity_Feed');
  fs.mkdirSync(feedDir, { recursive: true });
  fs.writeFileSync(path.join(feedDir, 'live.jsonl'), JSON.stringify({ ts: new Date().toISOString(), god: 'athena', action: 'dispatch_outcome', instinct_id: 'aime-card', project: 'aime', outcome: 'success' }) + '\n');
  const recal = await import(OLYMPUS + '/src/lib/learning/recalibrate.ts');
  const rec = recal.recalibrateFromOutcomes();
  const updated = fs.readFileSync(path.join(dir, 'aime-card.md'), 'utf-8');
  expect('L1: dispatch outcome recalibrates successes', rec.updated === 1 && /^successes: 41$/m.test(updated), JSON.stringify({ rec, updated: updated.slice(0, 240) }));

  let shortCircuits = 0;
  for (let i = 0; i < 10; i++) {
    const r = gate.queryInstincts('god', 'athena', 'card clip fill', 3, { project: 'aime', stacks: ['nextjs'] });
    if (r.short_circuit) shortCircuits++;
  }
  expect('G3: project memory never short-circuits (no quick circuit)', shortCircuits === 0, String(shortCircuits));

  console.log(`\nlearning-core: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
