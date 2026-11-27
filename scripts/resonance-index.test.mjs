#!/usr/bin/env node
/**
 * resonance-index.test.mjs — v0.1.4: the quick circuit must be earned.
 *
 * Proves the index aggregates outcomes (not rows), ignores unknown outcomes,
 * rejects hop-id/fixture signatures, and only fires a quick circuit for a real
 * task class with 3+ samples and Laplace coherence >= 0.85.
 *
 * Run: npx tsx scripts/resonance-index.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-resonance-vault-'));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-resonance-home-'));
fs.mkdirSync(path.join(VAULT, '03_Index'), { recursive: true });
process.env.OLYMPUS_VAULT = VAULT;
process.env.OLYMPUS_VAULT_ROOT = VAULT;
process.env.OLYMPUS_HOME = HOME;
process.on('exit', () => {
  try { fs.rmSync(VAULT, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {}
});

let failures = 0;
const expect = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 320)}`}`);
  if (!ok) failures++;
};

const rows = [];
const add = (task_signature, god, outcome, skill = null, ts = null) => rows.push({
  ts: ts || new Date().toISOString(), task_signature, god, skill, mcp: null, demigod: null, outcome,
});

// 12 successes + 1 failure => Laplace (13)/(15) = 0.867, enough for a quick.
for (let i = 0; i < 12; i++) add('fix the login form validation error', 'athena', 'success', 'accessibility');
add('fix the login form validation error', 'athena', 'failure', 'accessibility');
// A fixture repeats, but must never become a shortcut.
for (let i = 0; i < 8; i++) add('run the deterministic script mkdir p artifacts printf sn h3 ok', 'hephaestus', 'success', 'filesystem');
// Unknown is not evidence.
add('fix the login form validation error', 'athena', 'unknown', 'accessibility');
// Hop ids are junk.
for (let i = 0; i < 5; i++) add('root', 'apollo', 'success', 'caveman');

fs.writeFileSync(
  path.join(VAULT, '03_Index', 'arsenal-resonance.jsonl'),
  rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
);

async function main() {
  const idx = await import(OLYMPUS + '/src/lib/symphony/resonance-index.ts');
  const sig = await import(OLYMPUS + '/src/lib/symphony/resonance-signature.ts');

  const built = idx.backfillResonanceIndex();
  expect('R1: the backfill aggregates real signatures', built.signatures >= 2, JSON.stringify(built));
  expect('R2: fixture/hop-id quick circuits are not counted', built.quickCircuits === 1, JSON.stringify(built));

  const hit = idx.queryResonance({ task: 'fix login form validation', god: 'athena' });
  expect('R3: a matching task class returns the proven arsenal', Boolean(hit && hit.similarity >= 0.4), JSON.stringify(hit));
  expect('R4: 12/13 is a quick circuit (Laplace 0.867)', hit?.quickCircuit === true, JSON.stringify(hit));
  expect('R5: the suggestion carries real samples', Boolean(hit?.suggestedSkills.some((s) => s.skill === 'accessibility' && s.samples >= 3)), JSON.stringify(hit?.suggestedSkills));

  const miss = idx.queryResonance({ task: 'render a three js product scene', god: 'athena' });
  expect('R6: a novel task does not match', miss === null, JSON.stringify(miss));

  const fixture = idx.queryResonance({ task: 'run the deterministic script mkdir p artifacts printf sn h3 ok', god: 'hephaestus' });
  expect('R7: a fixture match is a hint, never a quick circuit', Boolean(fixture) && fixture.quickCircuit === false, JSON.stringify(fixture));

  expect('R8: junk signatures are rejected by the vocabulary', sig.isUsefulSignature('root') === false && sig.isUsefulSignature('h7') === false && sig.isUsefulSignature('fix the login form validation error') === true);

  const stats = idx.resonanceStats();
  expect('R9: stats report the rebuilt index', stats.ready === true && stats.signatures === built.signatures, JSON.stringify(stats));

  console.log(`\nresonance-index: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
