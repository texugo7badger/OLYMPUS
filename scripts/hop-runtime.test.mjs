#!/usr/bin/env node
/**
 * hop-runtime.test.mjs — #109 the spine and the hops (FLUENCY-1, Batch C).
 * Run: npx tsx scripts/hop-runtime.test.mjs   (exit 0 = pass)
 *
 * The doctrine: models are lanes; the cable carries context. SESSIONS ARE
 * LANES; THE DISK CARRIES THE CAMPAIGN. An architectural task stops being
 * one 150k-token god-session (the user's 2026-10-09 death at ~80%) and
 * becomes a deterministic spine (a script, zero LLM tokens) walking small
 * LLM hops — each <= 16k output, one god, artifacts on disk, park-on-
 * exhaustion with resume.
 *
 * The fixture INJECTS the dispatcher (no live pools in the battery): the
 * suite proves the SPINE's laws — schema validation (garbage dies loudly),
 * topological order, the concurrency cap (<= 3, the #106 law), park +
 * resume, the telemetry rows, the deterministic verify (0 tokens).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

function tempLane() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-hoplane-'));
  return dir;
}

function validPlan(laneRoot, hops) {
  return {
    version: 1,
    laneRoot,
    hops: hops ?? [
      { id: 'hop-1', god: 'hephaestus', prompt: 'write the landing page', artifacts: ['app/page.tsx'], verify: { review: 'deterministic', checks: ['file-exists:app/page.tsx'] }, budgetTokens: 16384 },
    ],
  };
}

async function main() {
  let mod = null;
  try {
    mod = await import(OLYMPUS + '/src/lib/hop-runtime/walker.ts');
  } catch (e) {
    console.log('(module absent — the RED guard fires below)');
  }
  const schemaMod = (() => { try { return { m: null }; } catch { return null; } })(); // placeholder, real import below

  if (!mod || typeof mod.walkPlan !== 'function') {
    expect('W: the hop runtime exported (src/lib/hop-runtime/walker.ts)', false,
      'missing — the architectural task is still ONE 150k-token god-session (task-classifier.ts:247-273)');
    expect('W: plan-schema validation (garbage dies loudly)', false, 'blocked: the module is absent');
    expect('W: topological order + the concurrency cap (<= 3)', false, 'blocked');
    expect('W: park-on-exhaustion + resume (the campaign never dies)', false, 'blocked');
    expect('W: per-hop telemetry rows', false, 'blocked');
    expect('W: deterministic verify, 0 tokens', false, 'blocked');
    return;
  }

  const { walkPlan, MAX_HOP_CONCURRENCY } = mod;
  const schema = await import(OLYMPUS + '/src/lib/hop-runtime/plan-schema.ts');
  const { validateDispatchPlan, MAX_HOP_BUDGET_TOKENS } = schema;

  // ── 1. The schema: garbage plans die loudly ─────────────────────────────
  expect('S: MAX_HOP_BUDGET_TOKENS = 16384 (the #76 bar)', MAX_HOP_BUDGET_TOKENS === 16384, String(MAX_HOP_BUDGET_TOKENS));
  const okLane = tempLane();
  const okV = validateDispatchPlan(validPlan(okLane));
  expect('S: the valid plan passes', okV.ok === true, JSON.stringify(okV).slice(0, 200));
  const badTable = [
    ['not an object', null],
    ['version != 1', { ...validPlan(okLane), version: 2 }],
    ['hops not an array', { ...validPlan(okLane), hops: 'nope' }],
    ['hops empty', { ...validPlan(okLane), hops: [] }],
    ['laneRoot missing', { version: 1, hops: validPlan(okLane).hops }],
    ['hop.id missing', { ...validPlan(okLane), hops: [{ god: 'hephaestus', prompt: 'x', artifacts: [] }] }],
    ['hop.id duplicate', { ...validPlan(okLane), hops: [
      { id: 'a', god: 'hephaestus', prompt: 'x', artifacts: [], budgetTokens: 100 },
      { id: 'a', god: 'apollo', prompt: 'y', artifacts: [], budgetTokens: 100 },
    ] }],
    ['hop.god missing', { ...validPlan(okLane), hops: [{ id: 'a', prompt: 'x', artifacts: [] }] }],
    ['hop.prompt missing', { ...validPlan(okLane), hops: [{ id: 'a', god: 'apollo', artifacts: [] }] }],
    ['artifacts not an array', { ...validPlan(okLane), hops: [{ id: 'a', god: 'apollo', prompt: 'x', artifacts: 'app/page.tsx' }] }],
    ['budgetTokens over the #76 bar', { ...validPlan(okLane), hops: [{ id: 'a', god: 'apollo', prompt: 'x', artifacts: [], budgetTokens: 150000 }] }],
    ['after references a missing hop', { ...validPlan(okLane), hops: [{ id: 'a', god: 'apollo', prompt: 'x', artifacts: [], after: ['ghost'] }] }],
    ['after cycle', { ...validPlan(okLane), hops: [
      { id: 'a', god: 'apollo', prompt: 'x', artifacts: [], after: ['b'] },
      { id: 'b', god: 'apollo', prompt: 'y', artifacts: [], after: ['a'] },
    ] }],
    ['verify.review not in the enum', { ...validPlan(okLane), hops: [{ id: 'a', god: 'apollo', prompt: 'x', artifacts: [], verify: { review: 'vibes' } }] }],
    ['resumePoint references a missing hop', { ...validPlan(okLane), resumePoint: 'ghost' }],
  ];
  for (const [name, plan] of badTable) {
    const v = validateDispatchPlan(plan);
    expect(`S: garbage dies loudly — ${name}`, v.ok === false && Array.isArray(v.errors) && v.errors.length > 0,
      JSON.stringify(v).slice(0, 160));
  }
  const vDefaults = validateDispatchPlan({ version: 1, laneRoot: okLane, hops: [{ id: 'a', god: 'apollo', prompt: 'x', artifacts: [] }] });
  expect('S: defaults honest — budget 16384, review deterministic, checks []',
    vDefaults.ok === true && vDefaults.plan.hops[0].budgetTokens === 16384 && vDefaults.plan.hops[0].verify.review === 'deterministic',
    JSON.stringify(vDefaults).slice(0, 200));

  // ── 2. The walker: topological order + the concurrency cap ─────────────
  const capLane = tempLane();
  const capPlan = {
    version: 1,
    laneRoot: capLane,
    hops: [
      { id: 'r1', god: 'apollo', prompt: 'root 1', artifacts: ['a1.txt'] },
      { id: 'r2', god: 'apollo', prompt: 'root 2', artifacts: ['a2.txt'] },
      { id: 'r3', god: 'apollo', prompt: 'root 3', artifacts: ['a3.txt'] },
      { id: 'r4', god: 'apollo', prompt: 'root 4', artifacts: ['a4.txt'] },
      { id: 'sink', god: 'apollo', prompt: 'after all roots', artifacts: ['sink.txt'], after: ['r1', 'r2', 'r3', 'r4'] },
    ],
  };
  let inFlight = 0, maxInFlight = 0;
  const order = [];
  const capDisp = async (hop) => {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(r => setTimeout(r, 30));
    fs.writeFileSync(path.join(capLane, hop.artifacts[0]), 'done');
    order.push(hop.id); inFlight--;
    return { ok: true, exitCode: 0, output: 'ok', tokensIn: 100, tokensOut: 500, retriesAbsorbed: 0, exhausted: false };
  };
  const capState = tempLane(); // telemetry/state in a scratch dir
  const walk1 = await walkPlan({ plan: capPlan, dispatcher: capDisp, stateDir: capState });
  expect('W: MAX_HOP_CONCURRENCY = 3 (the #106 law)', MAX_HOP_CONCURRENCY === 3, String(MAX_HOP_CONCURRENCY));
  expect('W: the cap held (4 roots runnable, never 4 in flight)', maxInFlight <= 3, 'max=' + maxInFlight);
  expect('W: the cap USED (the roots actually ran concurrently)', maxInFlight === 3, 'max=' + maxInFlight + ' (want 3 — parallelism dead?)');
  expect('W: topological order — the sink last, after every root',
    order.indexOf('sink') === 4 && ['r1','r2','r3','r4'].every(id => order.indexOf(id) < order.indexOf('sink')),
    JSON.stringify(order));
  expect('W: all hops completed', walk1.completed.length === 5 && !walk1.parked, JSON.stringify(walk1).slice(0, 200));

  // ── 3. Park-on-exhaustion + resume ──────────────────────────────────────
  const parkLane = tempLane();
  const parkPlan = {
    version: 1,
    laneRoot: parkLane,
    hops: [
      { id: 'h1', god: 'apollo', prompt: 'one', artifacts: ['one.txt'] },
      { id: 'h2', god: 'hephaestus', prompt: 'two', artifacts: ['two.txt'] },
      { id: 'h3', god: 'apollo', prompt: 'three', artifacts: ['three.txt'], after: ['h2'] },
    ],
  };
  let h2Attempts = 0;
  const parkDisp = async (hop) => {
    if (hop.id === 'h2') {
      h2Attempts++;
      if (h2Attempts === 1) {
        return { ok: false, exitCode: -1, output: '', tokensIn: 10, tokensOut: 0, retriesAbsorbed: 4, exhausted: true, error: 'Service temporarily overloaded' };
      }
    }
    fs.writeFileSync(path.join(parkLane, hop.artifacts[0]), 'done');
    return { ok: true, exitCode: 0, output: 'ok', tokensIn: 100, tokensOut: 500, retriesAbsorbed: 0, exhausted: false };
  };
  const parkState = tempLane();
  const walk2 = await walkPlan({ plan: parkPlan, dispatcher: parkDisp, stateDir: parkState });
  expect('P: exhaustion PARKS (h2 parked, h3 never ran, h1 completed)',
    walk2.parked?.hopId === 'h2' && walk2.completed.includes('h1') && !walk2.completed.includes('h3'),
    JSON.stringify(walk2).slice(0, 240));
  const stateFile = JSON.parse(fs.readFileSync(path.join(parkState, '.olympus-hop-state.json'), 'utf-8'));
  expect('P: the state file records the park (hop + reason)',
    stateFile.parked?.hopId === 'h2' && /exhaust/i.test(stateFile.parked?.reason || ''), JSON.stringify(stateFile).slice(0, 240));
  expect('P: h1 in the state (completed hops survive the park)', Array.isArray(stateFile.completed) && stateFile.completed.includes('h1'), JSON.stringify(stateFile));

  // resume: h1 skipped (no re-dispatch), h2 re-run + completes, h3 runs
  const calls = [];
  const resumeDisp = async (hop) => {
    calls.push(hop.id);
    fs.writeFileSync(path.join(parkLane, hop.artifacts[0]), 'done');
    return { ok: true, exitCode: 0, output: 'ok', tokensIn: 100, tokensOut: 500, retriesAbsorbed: 0, exhausted: false };
  };
  const walk3 = await walkPlan({ plan: parkPlan, dispatcher: resumeDisp, stateDir: parkState, resume: true });
  expect('P: resume skips completed hops (h1 never re-dispatched)', !calls.includes('h1'), JSON.stringify(calls));
  expect('P: resume re-runs the parked hop then its dependents',
    calls.includes('h2') && calls.includes('h3') && calls.indexOf('h2') < calls.indexOf('h3'), JSON.stringify(calls));
  expect('P: the resumed walk completes everything', walk3.completed.length === 3 && !walk3.parked, JSON.stringify(walk3).slice(0, 240));

  // ── 4. Telemetry rows ────────────────────────────────────────────────────
  const telemetryPath = path.join(parkState, '.olympus-hop-telemetry.jsonl');
  const rows = fs.readFileSync(telemetryPath, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  expect('T: one row per attempted hop (h1 + h2-parked + h2 + h3)', rows.length === 4, JSON.stringify(rows.map((r) => r.hop + ':' + r.status)));
  expect('T: the row shape {ts, hop, god, lane, tokensIn/out, durationMs, retriesAbsorbed, status}',
    rows.every((r) => typeof r.ts === 'string' && typeof r.hop === 'string' && typeof r.god === 'string' && typeof r.lane === 'string' && 'tokensIn' in r && 'tokensOut' in r && typeof r.durationMs === 'number' && typeof r.retriesAbsorbed === 'number' && typeof r.status === 'string'),
    JSON.stringify(rows[0]));
  expect('T: the parked row carries the absorbed retries (the #107 ledger, per-hop)',
    rows.some((r) => r.hop === 'h2' && r.status.includes('parked') && r.retriesAbsorbed === 4), JSON.stringify(rows.find((r) => r.hop === 'h2')));

  // ── 5. Deterministic verify — 0 tokens ─────────────────────────────────
  let verifyDispCalls = 0;
  const verifyLane = tempLane();
  fs.writeFileSync(path.join(verifyLane, 'present.txt'), 'here');
  const verifyPlan = {
    version: 1,
    laneRoot: verifyLane,
    hops: [
      { id: 'v-ok', god: 'apollo', prompt: 'writes present.txt', artifacts: ['present.txt'] },
      { id: 'v-miss', god: 'apollo', prompt: 'claims missing.txt but never writes it', artifacts: ['missing.txt'] },
    ],
  };
  const verifyDisp = async (hop) => {
    verifyDispCalls++;
    return { ok: true, exitCode: 0, output: 'claimed done', tokensIn: 100, tokensOut: 500, retriesAbsorbed: 0, exhausted: false };
  };
  const verifyState = tempLane();
  const walk4 = await walkPlan({ plan: verifyPlan, dispatcher: verifyDisp, stateDir: verifyState });
  expect('V: file-exists verify passes on the real artifact (v-ok completed)',
    walk4.completed.includes('v-ok'), JSON.stringify(walk4).slice(0, 240));
  expect('V: file-exists verify FAILS the liar hop (missing artifact -> parked, not completed)',
    !walk4.completed.includes('v-miss') && /v-miss/.test(walk4.parked?.hopId || '') && /verify/i.test(walk4.parked?.reason || ''),
    JSON.stringify(walk4).slice(0, 240));
  expect('V: verify burned ZERO dispatches (deterministic-first — the dispatcher ran once per hop, verify itself 0 LLM)',
    verifyDispCalls === 2, 'calls=' + verifyDispCalls);
}

main().then(() => {
  if (failures > 0) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log('\nAll #109 hop-runtime assertions passed');
  process.exit(0);
}).catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
