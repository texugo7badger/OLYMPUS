#!/usr/bin/env node
/**
 * team-orchestration.test.mjs — v0.0.23 demigod team contract.
 * Run: npx tsx scripts/team-orchestration.test.mjs
 *
 * The god is the MIND of the hop; the demigods are the HANDS. This suite
 * pins the contract that turns a god into a team lead, and the runtime guard
 * that keeps stale in-flight hops from blocking new campaigns:
 *
 *   T1  the arsenal directive carries the TEAM CONTRACT (2–5, one wave,
 *       verify, synthesize, cost discipline)
 *   T2  the roster is still injected (the god knows who it commands)
 *   T3  a trivial hop is explicitly allowed to work alone
 *   T4  pruneStaleInFlight exists and drops only aged entries
 *   T5  the walker uses it on resume
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0, checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${detail}`}`);
  if (!ok) failures++;
}

const arsenal = fs.readFileSync(join(ROOT, 'src/lib/hop-runtime/arsenal.ts'), 'utf-8');
const hopState = fs.readFileSync(join(ROOT, 'src/lib/hop-runtime/hop-state.ts'), 'utf-8');
const walker = fs.readFileSync(join(ROOT, 'src/lib/hop-runtime/walker.ts'), 'utf-8');

// T1 — the contract's five laws.
check('T1 team contract header', /THE TEAM CONTRACT/.test(arsenal));
check('T1 team size 2–5', /2–5/.test(arsenal));
check('T1 one parallel wave', /ONE PARALLEL WAVE/.test(arsenal));
check('T1 verify then synthesize', /VERIFY, THEN SYNTHESIZE/.test(arsenal));
check('T1 report the chain', /REPORT THE CHAIN/.test(arsenal));
check('T1 cost discipline', /COST DISCIPLINE/.test(arsenal));

// T2 — roster injection survives.
check('T2 roster lines injected', /Your roster:/.test(arsenal) && /for \(const d of roster\)/.test(arsenal));

// T3 — trivial hops may work alone.
check('T3 trivial hop allowed alone', /trivial hop/i.test(arsenal) && /works alone|work alone/i.test(arsenal));

// T4 — the prune helper.
check('T4 pruneStaleInFlight exported', /export function pruneStaleInFlight/.test(hopState));
check('T4 prune keeps young entries', /now - started > maxAgeMs/.test(hopState));

// T5 — the walker uses it on resume.
check('T5 walker prunes on resume', /pruneStaleInFlight\(loaded\)/.test(walker));
check('T5 walker logs the dropped hops', /dropped .* stale in-flight hop/.test(walker));

// T6 — vault TTL prune on idle (#233), bounded to once per 6h.
const hooks = fs.readFileSync(join(ROOT, '.opencode/olympus/olympus-hooks.ts'), 'utf-8');
check('T6 session.idle prunes the vault', /VAULT TTL PRUNE ON IDLE/.test(hooks) && /vault-prune\.js/.test(hooks));
check('T6 prune is bounded to once per 6h', /SIX_HOURS/.test(hooks) && /last-vault-prune/.test(hooks));

console.log(`\nteam-orchestration: ${checked - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
