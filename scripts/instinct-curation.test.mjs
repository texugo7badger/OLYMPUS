#!/usr/bin/env node
/**
 * instinct-curation.test.mjs — v0.1.2: prove the quick-circuit theory.
 *
 * The audit found 33 "quick circuits" that were synthetic smoke patterns
 * (olympus-smoke/hoplane fixtures) and 187 AIME instincts marked global.
 * This suite is the proof that the cure works:
 *
 *   C1 synthetic patterns are archived, never shortcuts;
 *   C2 a project convention stays project-scoped;
 *   C3 one project's evidence can NEVER become a global quick circuit;
 *   C4 two distinct projects + samples + confidence can be promoted;
 *   C5 the model budget refuses a pass without candidates;
 *   C6 the census counts only `quick_circuit: true`.
 *
 * Run: npx tsx scripts/instinct-curation.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-curation-vault-'));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-curation-home-'));
process.env.OLYMPUS_VAULT = VAULT;
process.env.OLYMPUS_VAULT_ROOT = VAULT;
process.env.OLYMPUS_HOME = HOME;
process.on('exit', () => {
  try { fs.rmSync(VAULT, { recursive: true, force: true }); } catch { /* gone */ }
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* gone */ }
});

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 320)}`);
  if (!cond) failures++;
}

const note = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n# Fixture\n`;

async function main() {
  const base = path.join(VAULT, '05_Auto_Learning', 'instincts');
  const empirical = (god) => {
    const d = path.join(base, god, 'empirical');
    fs.mkdirSync(d, { recursive: true });
    return d;
  };

  fs.writeFileSync(path.join(empirical('apollo'), 'smoke.md'), note({
    god: '"apollo"', confidence: 0.95, samples: 7, scope: 'global', kind: 'technical',
    projects: '["olympus-smoke-TWem9l"]', quick_circuit: 'true',
    trigger: '"Hop h3 in olympus-smoke-TWem9l: build h3"', tags: '["h3", "build"]',
  }));
  fs.writeFileSync(path.join(empirical('athena'), 'aime.md'), note({
    god: '"athena"', confidence: 0.95, samples: 4, scope: 'global', kind: 'technical',
    projects: '["aime"]', quick_circuit: 'false',
    trigger: '"Hop card-clip-fill in aime: OWNER ORDER"', tags: '["card-clip-fill", "card"]',
  }));
  fs.writeFileSync(path.join(empirical('hermes'), 'one-project.md'), note({
    god: '"hermes"', confidence: 0.95, samples: 4, scope: 'global', kind: 'technical',
    projects: '["aime"]', quick_circuit: 'true',
    trigger: '"Hop email-transactional in aime: transactional email"', tags: '["email", "transactional"]',
  }));
  fs.writeFileSync(path.join(empirical('hermes'), 'proven.md'), note({
    god: '"hermes"', confidence: 0.95, samples: 25, successes: 25, failures: 0, scope: 'global', kind: 'technical',
    projects: '["aime", "olympus"]', quick_circuit: 'false',
    trigger: '"Hop webhook-retry: verify the HMAC before replay"', tags: '["webhook", "hmac"]',
  }));
  fs.writeFileSync(path.join(empirical('athena'), 'candidate.md'), note({
    god: '"athena"', confidence: 0.86, samples: 3, successes: 3, failures: 0, scope: 'global', kind: 'technical',
    projects: '["aime", "olympus"]', quick_circuit: 'false',
    trigger: '"Hop focus-ring: inset focus ring on dark cards"', tags: '["focus-ring", "cards"]',
  }));

  const curation = await import(OLYMPUS + '/src/lib/instinct-curation.ts');
  const loop = await import(OLYMPUS + '/src/lib/callimachus-loop.ts');
  const result = curation.curateInstincts({ apply: true });

  const smokePath = path.join(base, 'apollo', '_archive', 'smoke.md')
  expect('C1: synthetic smoke pattern archived', fs.existsSync(smokePath) && !fs.existsSync(path.join(base, 'apollo', 'empirical', 'smoke.md')), JSON.stringify(result));

  const aimeText = fs.readFileSync(path.join(base, 'athena', 'empirical', 'aime.md'), 'utf-8');
  expect('C2: project convention scoped to project', /scope: project/m.test(aimeText) && /kind: project/m.test(aimeText), aimeText.slice(0, 220));

  const oneText = fs.readFileSync(path.join(base, 'hermes', 'empirical', 'one-project.md'), 'utf-8');
  expect('C3: one project cannot be a quick circuit', /quick_circuit: false/m.test(oneText), oneText.slice(0, 220));

  const provenText = fs.readFileSync(path.join(base, 'hermes', 'empirical', 'proven.md'), 'utf-8');
  expect('C4: two-project evidence is promoted', /quick_circuit: true/m.test(provenText), provenText.slice(0, 220));

  const candidateText = fs.readFileSync(path.join(base, 'athena', 'empirical', 'candidate.md'), 'utf-8');
  expect('C5: unproven cross-project stays a candidate', /quick_circuit: false/m.test(candidateText) && result.candidates === 1, JSON.stringify(result));

  const census = loop.censusInstincts();
  expect('C6: census counts only validated shortcuts', census.quickCircuits === 1 && census.project >= 2 && census.technical >= 2, JSON.stringify(census));

  const list = loop.listQuickCircuits();
  expect('C7: the validated shortcut names its evidence', list.length === 1 && list[0].file === 'proven.md' && list[0].samples === 25, JSON.stringify(list));

  const state = loop.runCurationPass(true);
  const noBudget = loop.decideModelPass(state, false);
  expect('C8: candidates justify a model pass', noBudget.allowed === true && noBudget.candidates === 1, JSON.stringify(noBudget));

  // No candidates at all = deterministic pass only, zero model tokens.
  const emptyState = { at: new Date().toISOString(), result: { ...state.result, candidates: 0 }, census: state.census };
  const noEvidence = loop.decideModelPass(emptyState, false);
  expect('C10: no evidence means no model pass', noEvidence.allowed === false && /no cross-project evidence/.test(noEvidence.reason), JSON.stringify(noEvidence));

  loop.recordModelPass();
  const blocked = loop.decideModelPass(state, false);
  expect('C9: the hourly budget blocks a second pass', blocked.allowed === false && /budget/.test(blocked.reason), JSON.stringify(blocked));

  console.log(`\ninstinct-curation: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
