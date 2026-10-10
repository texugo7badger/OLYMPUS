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
import { spawnSync } from 'node:child_process';
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
  // ── 9. PLANO-MASTER-1 B3+B6 (#117/#120): the post-run behavior rides a
  // CHILD process — the plan-walk approval gate persists in the VAULT
  // (hitl-gates.json), so the fake vault env must bind at module import;
  // an in-process fixture would touch the real vault. The child runs all
  // four cycles: the park->resume campaign, the gate approve, the gate
  // abort, and the no-plan honest skip.
  if (process.argv[2] === 'child-post-run') {
    const vault = process.env.OLYMPUS_VAULT;
    fs.mkdirSync(path.join(vault, '05_Auto_Learning'), { recursive: true });
    // the fake OLYMPUS root config carries the god model lanes — the POOL
    // threading evidence (B6b: the narration names WHO + WHERE + THE POOL).
    fs.writeFileSync(path.join(process.env.OLYMPUS_ROOT, 'opencode.json'), JSON.stringify({
      agent: { hephaestus: { model: 'nvidia-deepseek/deepseek-v4.1-flash' }, athena: { model: 'nvidia-kimi/moonshotai/kimi-k3' } },
    }));
    const postRun = await import(OLYMPUS + '/src/lib/hop-runtime/post-run.ts');
    const hitl = await import(OLYMPUS + '/src/lib/hitl-gates.ts');
    const out = { events: [], disp: [] };
    const send = (ev) => out.events.push({ type: ev.type, hop: ev.hop ?? null, god: ev.god ?? null, pool: ev.pool ?? null });
    const mkPlan = (lane, hops) => fs.writeFileSync(path.join(lane, 'dispatch-plan.json'), JSON.stringify(validPlan(lane, hops)));
    const gateFor = (lane) => hitl.getPendingGates().find((g) => g.targetFile === path.join(lane, 'dispatch-plan.json'));

    // CYCLE A (#117/B3): the park -> resume campaign, now behind the gate.
    const laneA = tempLane();
    mkPlan(laneA, [
      { id: 'b3-1', god: 'hephaestus', prompt: 'shell', artifacts: ['shell.txt'], verify: { review: 'deterministic', checks: ['file-exists:shell.txt'] } },
      { id: 'b3-2', god: 'athena', prompt: 'dash', artifacts: ['dash.txt'], verify: { review: 'deterministic', checks: ['file-exists:dash.txt'] }, after: ['b3-1'] },
    ]);
    const dying = async (hop) => {
      out.disp.push(`A:${hop.id}`);
      if (hop.id === 'b3-1') { fs.writeFileSync(path.join(laneA, 'shell.txt'), 'x'); return { ok: true, exitCode: 0, output: '', tokensIn: 10, tokensOut: 20, retriesAbsorbed: 0, exhausted: false }; }
      return { ok: false, exitCode: 1, output: '', tokensIn: null, tokensOut: null, retriesAbsorbed: 4, exhausted: true, error: 'provider overload — all lanes dead' };
    };
    const a1 = await postRun.maybeWalkThePlan({ slug: 'b3-fixture', laneRoot: laneA, send, dispatcher: dying, sessionId: 'ses-b6' });
    out.a1 = { walked: a1.walked, awaiting: !!a1.awaitingApproval?.gate?.id };
    out.dispAfterA1 = out.disp.length;
    hitl.resolveGate(gateFor(laneA).id, 'approve');
    const a2 = await postRun.maybeWalkThePlan({ slug: 'b3-fixture', laneRoot: laneA, send, dispatcher: dying, sessionId: 'ses-b6' });
    out.a2 = {
      walked: a2.walked, completed: a2.completed, total: a2.total,
      parked: a2.parked ? { hopId: a2.parked.hopId, reason: a2.parked.reason } : null,
      summaryLine: a2.summaryLine,
    };
    const healed = async (hop) => { out.disp.push(`R:${hop.id}`); fs.writeFileSync(path.join(laneA, hop.artifacts[0]), 'x'); return { ok: true, exitCode: 0, output: '', tokensIn: 5, tokensOut: 6, retriesAbsorbed: 0, exhausted: false }; };
    const a3 = await postRun.maybeWalkThePlan({ slug: 'b3-fixture', laneRoot: laneA, send, dispatcher: healed, sessionId: 'ses-b6' });
    out.a3 = { completed: a3.completed, total: a3.total, parked: a3.parked ? a3.parked.hopId : null, summaryLine: a3.summaryLine };

    // CYCLE B (#120/B6): the gate IS the HITL record; approve -> 2/2 walked.
    const laneB = tempLane();
    mkPlan(laneB, [
      { id: 'g-1', god: 'hephaestus', prompt: 'a', artifacts: ['a.txt'], verify: { review: 'deterministic', checks: ['file-exists:a.txt'] } },
      { id: 'g-2', god: 'athena', prompt: 'b', artifacts: ['b.txt'], verify: { review: 'deterministic', checks: ['file-exists:b.txt'] }, after: ['g-1'] },
    ]);
    const ok2 = async (hop) => { out.disp.push(`B:${hop.id}`); fs.writeFileSync(path.join(laneB, hop.artifacts[0]), 'x'); return { ok: true, exitCode: 0, output: '', tokensIn: 1, tokensOut: 1, retriesAbsorbed: 0, exhausted: false }; };
    const b1 = await postRun.maybeWalkThePlan({ slug: 'gates-proj', laneRoot: laneB, send, dispatcher: ok2, sessionId: 'ses-b6' });
    out.b1 = { awaiting: !!b1.awaitingApproval?.gate?.id, walked: b1.walked };
    out.dispAfterB1 = out.disp.filter((d) => d.startsWith('B:')).length;
    const pg = gateFor(laneB);
    out.pendingGate = pg ? { phase: pg.phase, target: pg.targetFile } : null;
    hitl.resolveGate(pg.id, 'approve');
    const b2 = await postRun.maybeWalkThePlan({ slug: 'gates-proj', laneRoot: laneB, send, dispatcher: ok2, sessionId: 'ses-b6' });
    out.b2 = { walked: b2.walked, completed: b2.completed, total: b2.total, parked: b2.parked ? b2.parked.hopId : null };

    // CYCLE C (#120): abort withholds the walk honestly.
    const laneC = tempLane();
    mkPlan(laneC, [ { id: 'a-1', god: 'hephaestus', prompt: 'x', artifacts: ['x.txt'], verify: { review: 'deterministic', checks: ['file-exists:x.txt'] } } ]);
    await postRun.maybeWalkThePlan({ slug: 'abort-proj', laneRoot: laneC, send, dispatcher: ok2, sessionId: 'ses-b6' });
    hitl.resolveGate(gateFor(laneC).id, 'abort');
    const c2 = await postRun.maybeWalkThePlan({ slug: 'abort-proj', laneRoot: laneC, send, dispatcher: ok2, sessionId: 'ses-b6' });
    out.c2 = { walked: c2.walked, reason: c2.reason ?? null, summaryHead: (c2.summaryLine || '').slice(0, 90) };

    // CYCLE D: no plan on disk -> the honest skip.
    const laneD = tempLane();
    const d1 = await postRun.maybeWalkThePlan({ slug: 'noplan', laneRoot: laneD, send, sessionId: 'ses-b6' });
    out.d1 = { walked: d1.walked, summary: d1.summaryLine };

    // #121 (B7's live finding): the lane config bootstrap — the intake home
    // carries NO opencode.json; without the copy every hop dies ProviderModel
    // NotFound (the acceptance-test specimen, verbatim). The walk bootstraps
    // the config into the lane BEFORE any dispatch.
    out.laneConfigA = fs.existsSync(path.join(laneA, 'opencode.json'));
    out.laneConfigRoot = (() => { try { return JSON.parse(fs.readFileSync(path.join(laneA, 'opencode.json'), 'utf-8')).agent?.hephaestus?.model ?? null; } catch { return null; } })();

    // the POOL evidence: the hop_start events carry the god model lanes
    out.pools = out.events.filter((e) => e.type === 'hop_start').map((e) => `${e.god}=${e.pool}`);
    console.log(JSON.stringify(out));
    process.exit(0);
  }

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

  // ── 6. The planner contract: the Apollo prompt surface ──────────────────
  const routeSrc = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/action/route.ts', 'utf-8');
  expect('PL: needsPlanning gates the planner marker (the contract rides the classification)',
    /classification\.needsPlanning\s*\? '\[OLYMPUS-PLANNER\]/.test(routeSrc),
    'the planner marker is not gated on needsPlanning');
  expect('PL: the marker names dispatch-plan.json + the hop runtime + the doctrine',
    /OLYMPUS-PLANNER/.test(routeSrc) && /dispatch-plan\.json/.test(routeSrc) && /hop-runtime/.test(routeSrc) && /the disk carries the campaign/.test(routeSrc),
    'the planner contract block is incomplete');
  expect('PL: the marker rides AFTER the prompt (the session marker still leads every turn type)',
    /: sessionMarker \+ classificationMarker \+ promptText \+ plannerMarker/.test(routeSrc),
    'the composition broke the #65 marker-order pin');

  // ── 8. #119 (PLANO-MASTER-1 B5/F4): the contract rides INLINE — the
  // planner stops diving into source. The user's UAT: Apollo opened the
  // orchestrator source at 13:43 to learn the JSON shape the prompt should
  // have carried. RED pre-cure: the marker points at plan-schema.ts and
  // carries no canonical example.
  expect('PL/#119 (F4): the planner contract rides INLINE — a minimal canonical plan example in the marker',
    /\{"version":1,"laneRoot"/.test(routeSrc) && /file-exists:/.test(routeSrc) && /"budgetTokens":8192/.test(routeSrc),
    'the planner still has to OPEN the source to learn the JSON shape (the 13:43 source dive)');
  expect('PL/#119 (F4): the marker no longer points the planner at source files (the schema/walker path refs die)',
    !/\[OLYMPUS-PLANNER\][^']*\.ts\b/.test(routeSrc),
    'the marker still tells the planner to read the schema in source — the F4 defect verbatim');
  const agentsSrc = fs.readFileSync(OLYMPUS + '/AGENTS.md', 'utf-8');
  expect('PL: the doctrine sentence in AGENTS.md (sessions are lanes; the disk carries the campaign)',
    /Sessions are lanes; the disk carries the campaign/.test(agentsSrc), 'the standing note is missing');
  const econSrc = fs.readFileSync(OLYMPUS + '/TOKEN-ECONOMY.md', 'utf-8');
  expect('PL: the hop-runtime economics in TOKEN-ECONOMY.md (bursts fit BETWEEN peaks; the park survives)',
    /burst/i.test(econSrc) && /PARKS on exhaustion/.test(econSrc), 'the hop economics section is missing');

  // ── 7. SMOKE-1 rider R3: the per-hop ceiling is env-tunable ─────────────
  // FLUENCY-1's resume was killed at the hard-coded 15-min ceiling SECONDS
  // after the artifacts landed. The knob: OLYMPUS_HOP_TIMEOUT_MS, default
  // 900000, junk/negative tolerated (falls back to the default).
  expect('R3: resolveHopTimeoutMs exported (the per-hop ceiling knob)', !!mod && typeof mod.resolveHopTimeoutMs === 'function',
    'absent — walker.ts spawns every hop with a hard-coded 15 * 60_000');
  if (mod && typeof mod.resolveHopTimeoutMs === 'function') {
    expect('R3: the default ceiling is 15 min (900000ms)', mod.resolveHopTimeoutMs({}) === 900000, JSON.stringify(mod.resolveHopTimeoutMs({})));
    expect('R3: OLYMPUS_HOP_TIMEOUT_MS overrides (30000 -> 30000)', mod.resolveHopTimeoutMs({ OLYMPUS_HOP_TIMEOUT_MS: '30000' }) === 30000, JSON.stringify(mod.resolveHopTimeoutMs({ OLYMPUS_HOP_TIMEOUT_MS: '30000' })));
    expect('R3: junk env tolerated (falls back to the default)', mod.resolveHopTimeoutMs({ OLYMPUS_HOP_TIMEOUT_MS: 'abc' }) === 900000, '?');
    expect('R3: zero/negative env tolerated (falls back to the default)', mod.resolveHopTimeoutMs({ OLYMPUS_HOP_TIMEOUT_MS: '0' }) === 900000, '?');
  }
  const walkerSrc = fs.readFileSync(OLYMPUS + '/src/lib/hop-runtime/walker.ts', 'utf-8');
  // The contract: the runSpawn CALL SITE threads the resolved knob (a named
  // DEFAULT constant elsewhere in the file is the sane-default home, not a
  // violation).
  expect('R3: spawnHopDispatcher threads the resolved knob into runSpawn (no hard-coded ceiling at the call site)',
    /resolveHopTimeoutMs\(\)/.test(walkerSrc) && /runSpawn\(\s*\[\s*'run',[\s\S]{0,140}?resolveHopTimeoutMs\(\)/.test(walkerSrc) && !/runSpawn\(\s*\[[\s\S]{0,160}?\d+ \* 60_000/.test(walkerSrc),
    'the call site still hard-codes the ceiling');

  // ── 8. PLANO-MASTER-1 B3 (#117): the PRODUCT FLOW walks the plan ────────
  // The user's UAT, verbatim: 19 planned hops -> 0 walked -> "Task completed.
  // writes 1" (the 1 write WAS the plan file). The cure: the route's post-run
  // flow walks dispatch-plan.json INSIDE the stream — hops narrated live
  // (who + where), honest parks with the resume contract printed, and the
  // completion line tells the truth (walked/parked — never "completed").
  let postRun = null;
  try { postRun = await import(OLYMPUS + '/src/lib/hop-runtime/post-run.ts'); } catch { /* RED below */ }
  expect('B3: the post-run walk module exported (src/lib/hop-runtime/post-run.ts)',
    !!postRun && typeof postRun.maybeWalkThePlan === 'function',
    "absent — the plan is still the turn's deliverable; 19 hops die on paper");

  // #120: the post-run BEHAVIORAL fixtures (the park->resume cycle, the
  // approval gate lifecycle, the abort, the no-plan skip, the pool
  // narration) moved to the child-post-run process below — the gate state
  // persists in the VAULT, and an in-process fixture would touch the real
  // one. The in-process import above stays as the export check.

  // The wiring pins (RED until the cure): the route CALLS the walk in the
  // post-run flow; the client renders the walk + suppresses the bare census.
  expect('B3: the route walks the plan post-run (await maybeWalkThePlan in the streamWarm close path)',
    /maybeWalkThePlan\(/.test(routeSrc) && /await maybeWalkThePlan/.test(routeSrc),
    "the plan is still the turn's deliverable — the UAT's 19 hops died on paper");
  const termSrc = fs.readFileSync(OLYMPUS + '/src/components/olympus/interactive-terminal.tsx', 'utf-8');
  expect('B3: the client renders the walk live (walk_summary + hop events handled)',
    /walk_summary/.test(termSrc) && /hop_start/.test(termSrc), 'the walk is invisible in the terminal');
  expect('B3: THE INVARIANT — a walked/parked plan NEVER reports the bare "Task completed" census',
    /runWalkSummary/.test(termSrc), "the census line still masks the walk's truth");

  // ── 10. PLANO-MASTER-1 B3+B6 (#117/#120): the post-run behavior — the
  // park->resume cycle behind the approval gate, the gate's HITL record,
  // the abort, the no-plan skip, the pool narration. ─────────────────────
  {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-b6-'));
    for (const d of ['vault', 'root', 'home']) fs.mkdirSync(path.join(work, d), { recursive: true });
    const env = {
      ...process.env,
      OLYMPUS_VAULT: path.join(work, 'vault'),
      OLYMPUS_ROOT: path.join(work, 'root'),
      HOME: path.join(work, 'home'),
    };
    const r = spawnSync('npx', ['tsx', OLYMPUS + '/scripts/hop-runtime.test.mjs', 'child-post-run'], {
      encoding: 'utf-8', cwd: OLYMPUS, timeout: 180_000, env,
    });
    let C = null;
    try { C = JSON.parse(String(r.stdout).trim().split('\n').filter(Boolean).pop()); } catch { C = null; }
    expect('B3+B6: the child-post-run fixture ran (the fake vault bound at module import)',
      !!C && !C.__err, `${r.status} ${String(r.stdout).slice(-160)} ${String(r.stderr).slice(-240)}`);
    if (C) {
      expect('B3/#117: a fresh plan opens the approval gate BEFORE the walk (awaitingApproval, zero dispatches)',
        C.a1?.awaiting === true && C.a1?.walked === false && C.dispAfterA1 === 0, JSON.stringify(C.a1).slice(0, 200));
      expect('B3/#117: after approval the walk runs — and parks honestly at the dead lane (1/2, retry-exhausted)',
        C.a2?.walked === true && C.a2?.completed === 1 && C.a2?.total === 2 && C.a2?.parked?.hopId === 'b3-2' && /retry-exhausted/.test(C.a2?.parked?.reason || ''),
        JSON.stringify(C.a2).slice(0, 240));
      expect('B3/#117: the parked summary line NAMES the park + PRINTS the resume contract (never "Task completed")',
        /b3-2/.test(C.a2?.summaryLine || '') && /RESUME/i.test(C.a2?.summaryLine || '') && !/Task completed/i.test(C.a2?.summaryLine || ''),
        C.a2?.summaryLine);
      expect('B3/#117: the hops narrated live in the stream (hop_start + hop_done + hop_parked + walk_summary)',
        Array.isArray(C.events) &&
        C.events.some((e) => e.type === 'hop_start' && e.hop === 'b3-1') &&
        C.events.some((e) => e.type === 'hop_done' && e.hop === 'b3-1') &&
        C.events.some((e) => e.type === 'hop_parked' && e.hop === 'b3-2') &&
        C.events.some((e) => e.type === 'walk_summary'),
        JSON.stringify((C.events || []).map((e) => e.type)));
      expect('B3/#117: the RESUME walk completes the campaign (2/2, the state carried on disk)',
        C.a3?.completed === 2 && C.a3?.total === 2 && C.a3?.parked === null && /2\/2/.test(C.a3?.summaryLine || ''),
        JSON.stringify(C.a3).slice(0, 240));
      expect('B3/#117: no plan on disk -> the honest skip (walked false, no invented narration)',
        C.d1?.walked === false && !C.d1?.summary, JSON.stringify(C.d1).slice(0, 200));
      expect('B6/#120: the gate IS the HITL record (phase plan-walk, targetFile = the plan — the Pantheon toast surface)',
        C.pendingGate?.phase === 'plan-walk' && /dispatch-plan\.json$/.test(C.pendingGate?.target || ''), JSON.stringify(C.pendingGate));
      expect("B6/#120: a fresh plan's gate withholds the walk (awaiting, zero dispatches on that lane)",
        C.b1?.awaiting === true && C.b1?.walked === false && C.dispAfterB1 === 0, JSON.stringify(C.b1).slice(0, 200));
      expect('B6/#120: APPROVE resolves the SAME gate -> the walk runs (2/2 GREEN)',
        C.b2?.walked === true && C.b2?.completed === 2 && C.b2?.total === 2 && C.b2?.parked === null, JSON.stringify(C.b2));
      expect('B6/#120: ABORT withholds the walk honestly (walked false, reason plan-aborted)',
        C.c2?.walked === false && C.c2?.reason === 'plan-aborted', JSON.stringify(C.c2).slice(0, 200));
      expect('B6/#120: the hop narration carries the POOL (the god model lanes from the config)',
        Array.isArray(C.pools) && C.pools.some((p) => p === 'hephaestus=nvidia-deepseek/deepseek-v4.1-flash'),
        JSON.stringify(C.pools));
      expect('B7/#121: the walk BOOTSTRAPS the lane config (the intake home carries the copy the #99 lanes always had)',
        C.laneConfigA === true && C.laneConfigRoot === 'nvidia-deepseek/deepseek-v4.1-flash',
        JSON.stringify({ laneConfigA: C.laneConfigA, laneConfigRoot: C.laneConfigRoot }));
    }
  }
  const postRunSrc = fs.readFileSync(OLYMPUS + '/src/lib/hop-runtime/post-run.ts', 'utf-8');
  expect('B6/#120: the POOL is threaded into the hop narration (resolveGodModelLane in post-run)',
    /resolveGodModelLane/.test(postRunSrc) && /pool/.test(postRunSrc), 'the narration names the god but not the model lane');
  expect('B6/#120: the hop activity publish is OPT-IN (publishActivity -> appendActivity; the route opts in)',
    /publishActivity/.test(postRunSrc) && /appendActivity/.test(postRunSrc) && /publishActivity: true/.test(routeSrc),
    'the walk states never reach the durable feed — the Pantheon stays blind across sessions');
  expect('B6/#120: the route ASKS through the question flow + the s/n short-circuit resolves the SAME gate in-turn',
    /awaitingApproval/.test(routeSrc) && /resolvePlanWalkAnswer/.test(routeSrc),
    'the gate is created but never asked / never resolvable from the terminal');

  // ── 11. #111 part 2 (HIGIENIA-1 H1a): the ceiling-kill classification —
  // the SMOKE-1 forensics (reports/smoke-1/s2/429-forensics.md): the
  // per-hop ceiling's SIGKILL surfaced as a classless `exit null` park; a
  // provider-erroring hang must count as provider-overload WITHIN the
  // crescendo budget (absorbed, retried), and a pure hang parks NAMED —
  // never classless.
  expect('#111: classifyCeilingKill exported (the ceiling-kill classifier)',
    typeof mod?.classifyCeilingKill === 'function', 'absent — the ceiling parks classless (exit null)');
  if (typeof mod?.classifyCeilingKill === 'function') {
    const ckProv = mod.classifyCeilingKill('stderr tail: AI_APICallError: Service temporarily overloaded');
    expect('#111: a provider-erroring hang classifies provider-overload (absorbed by the crescendo, retried)',
      ckProv.kind === 'provider-overload', JSON.stringify(ckProv).slice(0, 160));
    const ckHang = mod.classifyCeilingKill('');
    expect('#111: a pure hang parks NAMED (ceiling-kill + the knob, never a bare exit null)',
      ckHang.kind === 'hang' && /ceiling-kill/.test(ckHang.error), JSON.stringify(ckHang).slice(0, 200));
  }
  expect('#111: the dispatcher consults the classifier on the signal-kill path (code === null)',
    /classifyCeilingKill\(/.test(walkerSrc) && /last\.code === null/.test(walkerSrc),
    'the ceiling still parks classless');
}

main().then(() => {
  if (failures > 0) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log('\nAll #109 hop-runtime assertions passed');
  process.exit(0);
}).catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
