/**
 * apply-noop.test.mjs — AN13a (MADRUGA-GAP-1 S1): the N37 no-op regression
 * test, persisted. The SWEEP-1 S4 live proof (apply-1 -> no marker; apply-2
 * -> noOp marker) is now a permanent battery suite (#20).
 *
 * What it guards (N37, commit 97d0e90): a no-op apply (changes === 0) must
 * NEVER be recorded in active-strategy.json as a bare "applied" — the false
 * green's silent accomplice. The state file carries noOp:true + the
 * budget-guard pointer note instead, so the convergence signal stays the
 * only source of truth.
 *
 * Hermetic (R11): all state lives in throwaway temp dirs — OLYMPUS_ROOT and
 * OLYMPUS_HOME (and HOME) point at mkdtemp dirs BEFORE the first execution;
 * the real ~/.olympus and the repo's live opencode.json are never touched.
 * v0.0.22: the free tier is retired — the fixture applies `go-budget`
 * (the default paid strategy), offline: --force escapes the L4 catalogue
 * preflight (the temp root has no node_modules probe), so no network and
 * no provider keys are involved.
 *
 * Red-first proof: OLYMPUS_APPLY_SCRIPT may point the fixture at a mutant
 * copy of apply-strategy.js (the pre-97d0e90 shape — writeStateFile called
 * without the noOp flag on the no-op path). Against that mutant the
 * apply-2 assertions FAIL (verified red at authoring time); against the
 * real script they pass. The seam is test-only: the default is always the
 * repo's real scripts/apply-strategy.js.
 *
 * Run: npx tsx scripts/apply-noop.test.mjs   (or: node scripts/apply-noop.test.mjs)
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const APPLY_SCRIPT =
  process.env.OLYMPUS_APPLY_SCRIPT ||
  path.join(REPO_ROOT, 'scripts', 'apply-strategy.js');

const NOOP_NOTE =
  'no changes — config already matched; verify with the budget-guard, not this file';

const GODS = [
  'apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus',
  'hermes', 'persephone', 'prometheus', 'callimachus',
];

let passed = 0;
let failed = 0;
function expect(name, actual, expected) {
  const ok = actual === expected;
  if (ok) { passed++; } else {
    failed++;
    console.error(`FAIL  ${name}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
  }
}

// --- Hermetic temp state (R11: before ANY execution) -----------------------
const TMP_BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-noop-test-'));
const TMP_ROOT = path.join(TMP_BASE, 'root');
const TMP_HOME = path.join(TMP_BASE, 'home');
fs.mkdirSync(TMP_ROOT, { recursive: true });
fs.mkdirSync(TMP_HOME, { recursive: true });

try {
  // Seed: a minimal 10-god pantheon that does NOT match the GO shape —
  // apply-1 must produce changes > 0, apply-2 must be an exact no-op.
  const seedConfig = {
    $schema: 'https://opencode.ai/config.json',
    agent: {},
  };
  for (const god of GODS) {
    seedConfig.agent[god] = {
      description: `${god} (no-op fixture seed)`,
      prompt: `${god} fixture prompt — short, plain, inlined.`,
      mode: god === 'apollo' ? 'primary' : 'subagent',
      model: 'opencode-go/glm-5.3-flash',
    };
  }
  fs.writeFileSync(
    path.join(TMP_ROOT, 'opencode.json'),
    JSON.stringify(seedConfig, null, 2),
    'utf-8',
  );
  // v0.0.22 — the GO shape references the canonical god prompt files and the
  // demigod registry. Link them into the temp root so the fixture exercises
  // the REAL apply path (132 agents, {file:} prompts), not an inline stub.
  fs.symlinkSync(path.join(REPO_ROOT, '.opencode'), path.join(TMP_ROOT, '.opencode'));
  fs.copyFileSync(
    path.join(REPO_ROOT, 'opencode.demigods.json'),
    path.join(TMP_ROOT, 'opencode.demigods.json'),
  );

  const runApply = () => {
    // Hermetic env: a developer's real provider keys must not leak into the
    // fixture (the Free Hybrid resolver would see a multi-source machine and
    // pick a different small_model).
    const clean = { ...process.env };
    for (const k of ['OPENCODE_API_KEY', 'OPENCODE_GO_API_KEY', 'OPENROUTER_API_KEY',
      'OLYMPUS_OPENROUTER_KEY', 'NVIDIA_API_KEY', 'OLYMPUS_NVIDIA_KEY']) delete clean[k];
    const res = spawnSync(
      process.execPath,
      [APPLY_SCRIPT, '--strategy', 'go-budget', '--force'],
      {
        encoding: 'utf-8',
        cwd: REPO_ROOT,
        env: {
          ...clean,
          OLYMPUS_ROOT: TMP_ROOT,
          OLYMPUS_HOME: TMP_HOME,
          HOME: TMP_HOME,
        },
      },
    );
    return { code: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
  };

  const readState = () =>
    JSON.parse(fs.readFileSync(path.join(TMP_HOME, 'active-strategy.json'), 'utf-8'));

  // --- Apply-1: real changes -> state WITHOUT the no-op marker -------------
  const apply1 = runApply();
  expect('apply-1 exits 0', apply1.code, 0);
  expect('apply-1 reports real changes', /change\(s\) in opencode\.json/.test(apply1.out), true);

  const state1 = readState();
  expect('apply-1 changes > 0', typeof state1.changes === 'number' && state1.changes > 0, true);
  expect('apply-1 state has NO noOp marker', 'noOp' in state1, false);
  expect('apply-1 state has NO guard-pointer note', 'note' in state1, false);

  // --- Apply-2: no changes -> state WITH the no-op marker -------------------
  const apply2 = runApply();
  expect('apply-2 exits 0', apply2.code, 0);
  expect('apply-2 reports "No changes needed"', /No changes needed/.test(apply2.out), true);

  const state2 = readState();
  expect('apply-2 changes === 0', state2.changes, 0);
  expect('apply-2 state carries noOp: true', state2.noOp, true);
  expect('apply-2 note is the budget-guard pointer (verbatim)', state2.note, NOOP_NOTE);

  // --- The temp config really was mutated by apply-1 only ------------------
  const cfgAfter = JSON.parse(fs.readFileSync(path.join(TMP_ROOT, 'opencode.json'), 'utf-8'));
  expect('apply-1 enabled the OLYMPUS overlay plugin', (cfgAfter.plugin || []).includes('./.opencode/olympus'), true);
  expect('apply-1 loaded the demigods (132 agents)', Object.keys(cfgAfter.agent || {}).length, 132);
  expect('apply-1 set the GO small_model', cfgAfter.small_model, 'opencode-go/deepseek-v4.1-flash');
  expect('apply-1 wrote the file-ref prompt shape', String(cfgAfter.agent?.apollo?.prompt || '').startsWith('{file:'), true);
} finally {
  fs.rmSync(TMP_BASE, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\nnoOp (N37) regression: ${failed} FAILURE(S), ${passed} passed`);
  process.exit(1);
}
console.log(`\nAll ${passed} noOp (N37) marker assertions passed`);
