#!/usr/bin/env node
/**
 * shortcircuit-gate.test.mjs — W-A RAG-CERT A5: the instinct gate tells the
 * truth about WHO is running, and the short-circuit telemetry loop closes.
 * Run: npx tsx scripts/shortcircuit-gate.test.mjs   (exit 0 = pass)
 *
 * The live defects (the 2026-10-19 RAG audit):
 *   (a) getActiveScopeAndAgent is a STUB — it returns {scope:'god',
 *       agent:'apollo'} for every session (instinct-gate.ts:157-159), so
 *       every god's interactive session queries APOLLO's instinct pool and
 *       the skill hints filter to apollo's arsenal for ANY god.
 *   (b) shortcircuit-log.jsonl has NO writer anywhere — the Short-Circuit
 *       Health panel (God Intelligence Dashboard) reads a file that can
 *       never exist; AGENTS.md's "every instinct gate evaluation is logged"
 *       claim is untrue of the tree.
 *
 * The cure: chat.params (the only hook that carries the real `agent`) registers
 * sessionID→agent in an in-memory map; getActiveScopeAndAgent consults it
 * (scope = god iff one of the 10 GOD_IDS, else sub-agent; unknown session =
 * the honest apollo legacy default); the same hook appends the evaluation row
 * to the vault log (the ShortCircuitEntry shape the readers expect).
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
  // ── A5.1: the un-stub — the REAL agent for the session ────────────────────
  const gate = await import(OLYMPUS + '/.opencode/src/olympus-router/src/instinct-gate.ts');
  const hasRegister = typeof gate.registerSessionAgent === 'function';
  if (hasRegister) {
    gate.registerSessionAgent('s-athena-x', 'athena');
    gate.registerSessionAgent('s-demi-x', 'build-resolver');
    const rAthena = gate.getActiveScopeAndAgent('s-athena-x');
    const rDemi = gate.getActiveScopeAndAgent('s-demi-x');
    const rUnknown = gate.getActiveScopeAndAgent('s-never-seen');
    expect('A5: a god session resolves to ITS god (athena, not the apollo stub)',
      rAthena.scope === 'god' && rAthena.agent === 'athena', `got ${JSON.stringify(rAthena)}`);
    expect('A5: a demigod session resolves to the sub-agent scope',
      rDemi.scope === 'sub-agent' && rDemi.agent === 'build-resolver', `got ${JSON.stringify(rDemi)}`);
    expect('A5: an unknown session keeps the honest apollo legacy default',
      rUnknown.scope === 'god' && rUnknown.agent === 'apollo', `got ${JSON.stringify(rUnknown)}`);
  } else {
    expect('A5: registerSessionAgent exists (the session->agent map)', false,
      'getActiveScopeAndAgent is still the {god, apollo} stub — every session runs as Apollo');
    expect('A5: a god session resolves to ITS god (athena, not the apollo stub)', false, 'blocked: no map');
    expect('A5: a demigod session resolves to the sub-agent scope', false, 'blocked: no map');
    expect('A5: an unknown session keeps the honest apollo legacy default', false, 'blocked: no map');
  }

  // ── A5.2: the writer + the reader round-trip (fixture vault, child proc) ──
  const hasWriter = typeof gate.logShortCircuitEvaluation === 'function';
  let probeOk = false;
  let probeDetail = '';
  if (hasWriter) {
    const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-scfx-'));
    const probe = path.join(fx, 'probe.mjs');
    fs.writeFileSync(probe, `
const OLYMPUS = process.env.PROBE_OLYMPUS;
const gate = await import(OLYMPUS + '/.opencode/src/olympus-router/src/instinct-gate.ts');
const ok1 = gate.logShortCircuitEvaluation({ god: 'athena', session_id: 's1', confidence: 0.91, short_circuited: true, instinct_id: 'red-heroes', instinct_tags: ['red', 'hero'], task_signature: 'red hero section', tokens_saved: 0 });
const ok2 = gate.logShortCircuitEvaluation({ god: 'hephaestus', session_id: 's2', confidence: 0.2, short_circuited: false, instinct_id: null, instinct_tags: null, task_signature: 'unrelated query', tokens_saved: 0 });
const { getShortCircuitStats } = await import(OLYMPUS + '/src/lib/shortcircuit-telemetry.ts');
const stats = getShortCircuitStats();
console.log(JSON.stringify({ ok1, ok2, stats }));
`);
    const r = spawnSync('npx', ['tsx', '--tsconfig', path.join(OLYMPUS, 'tsconfig.json'), probe], {
      cwd: OLYMPUS, encoding: 'utf-8', timeout: 120_000,
      env: { ...process.env, PROBE_OLYMPUS: OLYMPUS, OLYMPUS_VAULT_ROOT: fx, OLYMPUS_VAULT: fx, OLYMPUS_ROOT: OLYMPUS },
    });
    try {
      const out = JSON.parse((r.stdout || '').trim().split('\n').pop());
      probeOk = out.ok1 === true && out.ok2 === true
        && out.stats.total_evaluations === 2
        && out.stats.total_short_circuits === 1
        && out.stats.per_god.athena?.short_circuits === 1
        && out.stats.log_file.exists === true;
    } catch { probeDetail = `stdout=${(r.stdout || '').slice(-160)} stderr=${(r.stderr || '').slice(-160)}`; }
    expect('A5: the writer appends rows the READER aggregates (the telemetry loop closes)',
      probeOk, probeDetail || 'the round-trip shortcircuit-log.jsonl -> getShortCircuitStats mismatched');
    fs.rmSync(fx, { recursive: true, force: true });
  } else {
    expect('A5: the writer appends rows the READER aggregates (the telemetry loop closes)', false,
      'logShortCircuitEvaluation is absent — shortcircuit-log.jsonl still has no writer; the Short-Circuit Health panel can never render');
  }

  // ── A5.3: the router pins — the real agent threads + the gate logs ────────
  // The v1 hook map lives in v1.ts (the v2 entry is the adapter — no chat.params).
  const routerSrc = fs.readFileSync(path.join(OLYMPUS, '.opencode/src/olympus-router/v1.ts'), 'utf-8');
  expect('A5: chat.params registers the REAL agent for the session (hookInput.agent)',
    /registerSessionAgent\(hookInput\.sessionID,\s*hookInput\.agent\)/.test(routerSrc),
    'the chat.params gate still resolves every session as apollo');
  expect('A5: chat.params logs the gate evaluation (the AGENTS.md claim made true)',
    routerSrc.includes('logShortCircuitEvaluation('),
    'the gate computes olympus_instinct_gate without appending the evaluation row');

  if (failures > 0) { console.error(`\nshortcircuit-gate: ${failures} FAIL`); process.exit(1); }
  console.log('\nshortcircuit-gate: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
