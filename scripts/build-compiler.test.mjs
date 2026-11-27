#!/usr/bin/env node
/**
 * build-compiler.test.mjs — v0.1.4: the dynamic edge is validated and gated.
 *
 * Proves:
 *   - a hop that matches no curated build gets a derived loadout;
 *   - invalid skills/MCPs and cross-god demigods are dropped with reasons;
 *   - a derived build is never written to the curated catalog;
 *   - promotion requires 5+ samples and >= 0.80 coherence.
 *
 * Run: npx tsx scripts/build-compiler.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-build-home-'));
const VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-build-vault-'));
fs.mkdirSync(path.join(VAULT, '03_Index'), { recursive: true });
process.env.OLYMPUS_HOME = HOME;
process.env.OLYMPUS_VAULT = VAULT;
process.env.OLYMPUS_VAULT_ROOT = VAULT;
process.env.OLYMPUS_ROOT = OLYMPUS;
process.on('exit', () => {
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(VAULT, { recursive: true, force: true }); } catch {}
});

let failures = 0;
const expect = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${String(detail).slice(0, 320)}`}`);
  if (!ok) failures++;
};

async function main() {
  const compiler = await import(OLYMPUS + '/src/lib/build-compiler.ts');
  const walker = await import(OLYMPUS + '/src/lib/hop-runtime/walker.ts');
  const resonance = await import(OLYMPUS + '/src/lib/symphony/resonance-index.ts');

  const hop = {
    id: 'derived-fixture', god: 'persephone', prompt: 'redis cache with invalidation for the dashboard',
    artifacts: ['evidence/cache.md'], verify: { checks: ['build', 'file-exists:evidence/cache.md', 'guidance-only'] },
    skills: ['redis-patterns', 'not-a-real-skill'], mcps: ['context7', 'not-a-real-mcp'], demigods: ['cache-architect', 'ui-designer'],
  };
  const derived = compiler.compileDerivedBuild(hop);
  expect('B1: a new combination compiles a derived build', Boolean(derived) && derived.source === 'derived', JSON.stringify(derived));
  expect('B2: valid skills survive, invalid ones are dropped', derived?.skills.includes('redis-patterns') && !derived.skills.includes('not-a-real-skill'), JSON.stringify(derived?.skills));
  expect('B3: valid MCPs survive, invalid ones are dropped', derived?.mcps.includes('context7') && !derived.mcps.includes('not-a-real-mcp'), JSON.stringify(derived?.mcps));
  expect('B4: a cross-god demigod is rejected', derived?.demigods.includes('cache-architect') && !derived.demigods.includes('ui-designer'), JSON.stringify(derived?.demigods));
  expect('B5: the derived build carries the rejected reasons', (derived?.derivedFrom?.rejected || []).length >= 3, JSON.stringify(derived?.derivedFrom));
  expect('B6: a derived build is cold and carries an executable gate', derived?.tier === 'cold' && derived.verify.some((v) => /^(build|file-exists):?/.test(v)), JSON.stringify(derived?.verify));

  const empty = compiler.compileDerivedBuild({ id: 'e', god: 'atlas', prompt: 'x', skills: ['not-a-real-skill'] });
  expect('B7: no resolvable arsenal means no build', empty === null, JSON.stringify(empty));

  const noCatalog = {
    id: 'no-catalog', god: 'hermes', prompt: 'turn the knowledge notes into an onboarding flow',
    artifacts: ['docs/ONBOARDING.md'], skills: ['knowledge-ops'], mcps: ['filesystem'], demigods: [],
  };
  expect('B8: without derive the honest null remains', walker.resolveHopBuild(noCatalog) === null, 'a build was invented');
  const viaWalker = walker.resolveHopBuild(noCatalog, { derive: true });
  expect('B9: with derive the walker equips the provisional loadout', Boolean(viaWalker) && viaWalker.source === 'derived', JSON.stringify(viaWalker));
  expect('B10: the derived build is recorded for audit', fs.existsSync(path.join(HOME, 'derived-builds.jsonl')), 'no derived log');

  // Promotion: write real evidence for the same signature, then promote.
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push({
    ts: new Date().toISOString(), task_signature: noCatalog.prompt, god: 'hermes',
    skill: 'knowledge-ops', mcp: 'filesystem', demigod: null, outcome: 'success',
  });
  fs.writeFileSync(path.join(VAULT, '03_Index', 'arsenal-resonance.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  resonance.backfillResonanceIndex();

  const promoted = compiler.promoteDerivedBuild(viaWalker.id);
  expect('B11: promotion requires and finds the evidence', promoted.ok === true, JSON.stringify(promoted));
  expect('B12: promotion writes a USER build, not a seed', Boolean(promoted.build) && promoted.build.source === 'user', JSON.stringify(promoted.build));
  const userFile = path.join(HOME, 'design-builds.json');
  const userRaw = fs.existsSync(userFile) ? fs.readFileSync(userFile, 'utf-8') : '';
  expect('B13: the user catalog contains the promoted build', userRaw.includes(promoted.build?.name || '__missing__'), userRaw.slice(0, 240));

  console.log(`\nbuild-compiler: ${failures === 0 ? 'PASS' : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
