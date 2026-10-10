#!/usr/bin/env node
/**
 * battery.mjs — #94 (HIGIENIA-1 H1c / BATT-ENV): the battery contract,
 * pinned and declared.
 *
 * THE INVOCATION OF RECORD: every suite runs via `npx tsx` — NEVER bare
 * node (the @/lib imports crash at the loader). Per-suite patience 600s
 * (the flat-300s lesson institutionalized at PLANO-MASTER-1: a harness
 * timeout killed the exit-gate suite at its tail once; never again).
 *
 * THE DECLARED ENVIRONMENT (a fresh clone reads pointers, not stack
 * traces): the environment-dependent suites get a NAMED SKIP when their
 * prerequisite is absent —
 *   - project-exit-gate  needs `~/olympus-bench` (the FIXTURES corpus:
 *                         madruga-1/cafeteria + madruga-2/escola);
 *   - generation-contract + parallel-pantheon read REAL vault state
 *                         (the LIVE-VS-VAULT surface — green on the
 *                         user's box by design, N29's declaration class);
 *   - the opencode-run state (`.opencode/package.json` — created by one
 *     `opencode models` run) flips tsx to the CJS transform for the
 *     overlay sources; without it the dispatch-spine class crashes with
 *     `__filename is not defined` — here it is a NAMED prerequisite.
 *
 * Usage: node scripts/battery.mjs   (or: npm run battery)
 * Exit 0 = every run suite green (skips are declared, never silent).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname;
const SUITE_TIMEOUT_MS = 600_000;

// ── The declared prerequisites (checked BEFORE the sweep) ────────────────────
const BENCH_DIR = join(homedir(), 'olympus-bench');
const OPENCODE_RUN_STATE = join(ROOT, '.opencode', 'package.json');

/** The suites that read environment state beyond the repo, with the
 *  DECLARED reason a fresh clone would see as a named skip. */
const ENV_DEPENDENT = new Map([
  ['project-exit-gate.test.mjs', `needs ${BENCH_DIR} (the FIXTURES corpus: madruga-1/cafeteria + madruga-2/escola)`],
  ['generation-contract.test.mjs', 'reads REAL vault state (the LIVE-VS-VAULT surface — N29 class; green on the user\'s box by design)'],
  ['parallel-pantheon.test.mjs', 'reads REAL vault state (the LIVE-VS-VAULT surface — N29 class; green on the user\'s box by design)'],
]);

const suites = readdirSync(join(ROOT, 'scripts'))
  .filter((f) => f.endsWith('.test.mjs'))
  .sort();

let pass = 0, fail = 0, skipped = 0;
console.log(`battery: ${suites.length} suites — the invocation of record: npx tsx, ${SUITE_TIMEOUT_MS / 1000}s per-suite patience`);
console.log(`battery surface: the repo ${ROOT}`);
console.log(`battery prereq: opencode-run state ${existsSync(OPENCODE_RUN_STATE) ? 'PRESENT' : `ABSENT — run \`opencode models\` once (the dispatch-spine class crashes with '__filename is not defined' without it)`}`);
console.log('');

for (const suite of suites) {
  const envReason = ENV_DEPENDENT.get(suite) ?? null;
  if (envReason && suite === 'project-exit-gate.test.mjs' && !existsSync(BENCH_DIR)) {
    console.log(`SKIP  ${suite} — ${envReason}`);
    skipped++;
    continue;
  }
  const r = spawnSync('npx', ['tsx', join(ROOT, 'scripts', suite)], {
    encoding: 'utf-8',
    cwd: ROOT,
    timeout: SUITE_TIMEOUT_MS,
  });
  const ok = r.status === 0;
  const head = String((r.status === null ? `TIMEOUT after ${SUITE_TIMEOUT_MS / 1000}s` : r.stdout || '') || '')
    .trim().split('\n').filter((l) => /pass|PASS|assertion|violation|doctrine|passed/i.test(l)).slice(-1)[0] ?? '';
  if (ok) { pass++; console.log(`PASS  ${suite}${head ? `  —  ${head.slice(0, 90)}` : ''}`); }
  else { fail++; console.log(`FAIL  ${suite}  —  ${head || `exit ${r.status}`}`); }
}

console.log('');
console.log(`battery: ${pass} PASS / ${fail} FAIL / ${skipped} SKIP (declared) of ${suites.length}`);
if (fail > 0) { console.error('battery: FAIL — see the per-suite lines above'); process.exit(1); }
console.log('battery: green (skips declared, never silent)');
process.exit(0);
