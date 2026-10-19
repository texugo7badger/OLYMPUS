#!/usr/bin/env node
/**
 * arsenal-recon.test.mjs — W-A RAG-CERT A6: the Arsenal Resolver read side
 * comes alive + the dead config retires.
 * Run: npx tsx scripts/arsenal-recon.test.mjs   (exit 0 = pass)
 *
 * The live defects (the 2026-10-19 RAG audit): arsenal-resolver.ts's own
 * docblock claims "called by olympus-router chat.params hook + the
 * olympus-dispatch tool" — NEITHER imports it; the feedback loop writes
 * (38 live rows in the real vault) but no dispatch path ever quick-circuits,
 * and the /api/olympus/arsenal-recon route has no client. Plus dead code:
 * searchByVector (media-vault-vec.ts) always returns null with zero callers;
 * build-skill-index.js documents OLYMPUS_EMBED_* env vars nothing reads.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

async function main() {
  // ── A6.1: the resolver is WIRED into the dispatch path ────────────────────
  const dispatchSrc = fs.readFileSync(path.join(OLYMPUS, '.opencode/olympus/tools/dispatch.ts'), 'utf-8');
  expect('A6: olympus-dispatch composes the arsenal recon (the quick-circuit layer reads again)',
    /arsenalRecon\(/.test(dispatchSrc) && dispatchSrc.includes('[ARSENAL RECON'),
    'arsenal-resolver.ts:26-28 claims the dispatch calls it — nothing does; the resonance loop is write-only');

  // ── A6.2: the recon round-trip on a fixture vault (child process) ────────
  const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-arsfx-'));
  fs.mkdirSync(path.join(fx, '03_Index'), { recursive: true });
  const rows = [];
  for (let i = 0; i < 3; i++) {
    // The min-3-samples rule applies PER NAME — every row carries the full
    // proven arsenal so each name reaches 3 samples.
    rows.push(JSON.stringify({
      ts: `2026-10-19T0${i}:00:00.000Z`,
      task_signature: 'build the dashboard kpi cards grid',
      god: 'hephaestus',
      skill: 'react-patterns',
      mcp: 'shadcn',
      demigod: 'build-resolver',
      outcome: 'success',
    }));
  }
  fs.writeFileSync(path.join(fx, '03_Index', 'arsenal-resonance.jsonl'), rows.join('\n') + '\n');
  const probe = path.join(fx, 'probe.mjs');
  fs.writeFileSync(probe, `
const OLYMPUS = process.env.PROBE_OLYMPUS;
const { arsenalRecon, computeTaskSignature } = await import(OLYMPUS + '/src/lib/symphony/arsenal-resolver.ts');
const hit = arsenalRecon('build the dashboard kpi cards grid now', 'hephaestus');
const miss = arsenalRecon('totally unrelated cooking recipe request', 'hephaestus');
console.log(JSON.stringify({
  hitSkills: hit.suggestedSkills.map(s => s.skill + ':' + s.confidence + ':' + s.samples),
  hitMcps: hit.suggestedMcps.map(s => s.mcp + ':' + s.confidence),
  hitDemis: hit.suggestedDemigods.map(s => s.demigod + ':' + s.confidence),
  quick: hit.quickCircuit, coh: hit.coherence,
  missEmpty: miss.suggestedSkills.length === 0 && miss.suggestedMcps.length === 0 && miss.suggestedDemigods.length === 0,
  missNoQuick: miss.quickCircuit === false,
}));
`);
  const r = spawnSync('npx', ['tsx', '--tsconfig', path.join(OLYMPUS, 'tsconfig.json'), probe], {
    cwd: OLYMPUS, encoding: 'utf-8', timeout: 120_000,
    env: { ...process.env, PROBE_OLYMPUS: OLYMPUS, OLYMPUS_VAULT: fx, OLYMPUS_VAULT_DIR: fx, OLYMPUS_ROOT: OLYMPUS },
  });
  let out = {};
  try { out = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { /* probe crashed */ }
  expect('A6: the recon surfaces the PROVEN arsenal (skill+mcp+demigod, 3 samples, confidence 1.0)',
    out.hitSkills?.[0] === 'react-patterns:1:3' && out.hitMcps?.[0] === 'shadcn:1' && out.hitDemis?.[0] === 'build-resolver:1',
    `stdout=${(r.stdout || '').slice(-200)} stderr=${(r.stderr || '').slice(-200)}`);
  expect('A6: the quick-circuit fires at coherence >= 0.85 on the hit',
    out.quick === true && typeof out.coh === 'number' && out.coh >= 0.85,
    `quick=${out.quick} coherence=${out.coh}`);
  expect('A6: the no-match task is the honest empty recon (never padded)',
    out.missEmpty === true && out.missNoQuick === true,
    'a no-match recon must return empty suggestions + no quick-circuit');
  fs.rmSync(fx, { recursive: true, force: true });

  // ── A6.3: the dead config retires ─────────────────────────────────────────
  const vecSrc = fs.readFileSync(path.join(OLYMPUS, 'src/lib/media-vault-vec.ts'), 'utf-8');
  expect('A6: searchByVector retired (the always-null, zero-caller helper)',
    !vecSrc.includes('searchByVector'), 'media-vault-vec.ts still exports the dead always-null helper');
  const builderSrc = fs.readFileSync(path.join(OLYMPUS, 'scripts/build-skill-index.js'), 'utf-8');
  expect('A6: the unread OLYMPUS_EMBED_* env docs retired from the builder',
    !builderSrc.includes('OLYMPUS_EMBED_PROVIDER') && !builderSrc.includes('OLYMPUS_EMBED_API_KEY'),
    'build-skill-index.js still documents env vars nothing reads (dead config)');

  if (failures > 0) { console.error(`\narsenal-recon: ${failures} FAIL`); process.exit(1); }
  console.log('\narsenal-recon: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
