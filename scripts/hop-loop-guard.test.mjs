#!/usr/bin/env node
/**
 * hop-loop-guard.test.mjs — v0.0.98-9.1: the same-hop loop breaker and the
 * bounded QA repair.
 *
 * THE SPECIMEN (AIME qa-glow-local, 2026-11-22): 15 attempts, 15 campaign
 * ids, 04:47 → 15:52. Every new campaign reset the recovery budget, so the
 * warden re-ran the same hop all night. This suite proves:
 *
 *   1. two deterministic failures block the hop for its generation;
 *   2. a new generation starts a fresh count;
 *   3. the telemetry seeds the guard (the live specimen blocks on upgrade);
 *   4. a walk skips a blocked hop (zero dispatches) and names `loop-blocked`;
 *   5. the campaign id survives three resumes;
 *   6. a QA verify-failed schedules a fix hop + a judge (2/2), not a re-run.
 *
 * Run: npx tsx scripts/hop-loop-guard.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-loop-home-'));
const TEST_VAULT = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-loop-vault-'));
process.env.OLYMPUS_HOME = TEST_HOME;
process.env.OLYMPUS_VAULT = TEST_VAULT;
process.env.OLYMPUS_OVERNIGHT_RESUME_DELAY_MS = '0';
process.on('exit', () => {
  try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch { /* gone */ }
  try { fs.rmSync(TEST_VAULT, { recursive: true, force: true }); } catch { /* gone */ }
});

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 260)}`);
  if (!cond) failures++;
}

function tempLane() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-loop-lane-'));
}

function writePlan(laneRoot, hops, generation = 1) {
  fs.writeFileSync(path.join(laneRoot, 'dispatch-plan.json'), JSON.stringify({
    version: 1,
    laneRoot,
    generation,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    hops,
  }, null, 2));
}

function seedState(laneRoot, generation = 1, campaignId = 'cmp_stable', parked = { hopId: 'hop-a', reason: 'verify-failed', ts: new Date().toISOString() }) {
  fs.writeFileSync(path.join(laneRoot, '.olympus-hop-state.json'), JSON.stringify({
    version: 1,
    completed: [],
    parked,
    campaignId,
    quarantined: [],
    inFlight: [],
    generation,
    hopHashes: {},
    parks: {},
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

async function main() {
  fs.mkdirSync(path.join(TEST_VAULT, '05_Auto_Learning'), { recursive: true });
  const loop = await import(OLYMPUS + '/src/lib/hop-runtime/loop-guard.ts');
  const vh = await import(OLYMPUS + '/src/lib/hop-runtime/verification-hop.ts');
  const walker = await import(OLYMPUS + '/src/lib/hop-runtime/walker.ts');
  const post = await import(OLYMPUS + '/src/lib/hop-runtime/post-run.ts');

  // ── 0. the verification vocabulary is one definition ─────────────────────
  {
    expect('qa-* is a verification hop', vh.isVerificationHop({ id: 'qa-glow-local', prompt: '' }));
    expect('gate-* is a verification hop', vh.isVerificationHop({ id: 'gate-back-parity', prompt: '' }));
    expect('design-gate is a verification hop', vh.isVerificationHop({ id: 'design-gate-44', kind: 'design-gate', prompt: '' }));
    expect('implementation hop is not verification', !vh.isVerificationHop({ id: 'audio-chrome-off', prompt: 'fix the audio chrome' }));
    expect('qa budget is 16', vh.verificationToolBudget({ id: 'qa-x' }) === 16);
    expect('gate budget is 20', vh.verificationToolBudget({ id: 'gate-back-parity' }) === 20);
    expect('gate ceiling is 18 min', vh.verificationDeadlineMs({ id: 'gate-back-parity' }) === 18 * 60_000);
    expect('gate judge budget is 14', vh.verificationJudgeBudget({ id: 'gate-back-parity' }) === 14);
  }

  // ── 0b. the walker/recovery/post-run agree with the shared definition ───
  {
    const walkerSrc = fs.readFileSync(path.join(OLYMPUS, 'src/lib/hop-runtime/walker.ts'), 'utf-8');
    const postSrc = fs.readFileSync(path.join(OLYMPUS, 'src/lib/hop-runtime/post-run.ts'), 'utf-8');
    const recSrc = fs.readFileSync(path.join(OLYMPUS, 'src/lib/hop-runtime/recovery.ts'), 'utf-8');
    const mainSrc = fs.readFileSync(path.join(OLYMPUS, 'electron/main.ts'), 'utf-8');
    expect('walker clamps with the shared verification definition', /isVerificationHop\(hop\) \? verificationToolBudget\(hop\)/.test(walkerSrc));
    expect('walker gives verification hops a hard deadline', /verificationDeadlineMs\(next\)/.test(walkerSrc));
    expect('post-run repairs every verification hop', /isVerificationHop\(qaHop\)/.test(postSrc));
    expect('recovery refuses a blind verification retry', /isVerificationHopId\(finding\.hopId\)/.test(recSrc));
    expect('the error log filters benign renderer noise', /isBenignRendererNoise/.test(mainSrc) && /preloaded using link preload/.test(mainSrc));
    expect('the crash log rotates instead of bisecting', /renameSync\(ERROR_LOG, ERROR_LOG \+ '\.1'\)/.test(mainSrc));
  }

  // ── 1. two failures block; one does not; a new generation is fresh ───────
  {
    const lane = tempLane();
    loop.noteLoopFailure(lane, 'qa-x', 1, 'tool-budget');
    expect('one failure is not blocked', loop.blockedLoopHops(lane, 1).length === 0);
    loop.noteLoopFailure(lane, 'qa-x', 1, 'tool-budget');
    const blocked = loop.blockedLoopHops(lane, 1);
    expect('two failures block the hop', blocked.length === 1 && blocked[0].hopId === 'qa-x', JSON.stringify(blocked));
    loop.noteLoopFailure(lane, 'qa-x', 2, 'tool-budget');
    expect('a new generation starts a fresh count', loop.blockedLoopHops(lane, 2).length === 0);
    loop.clearLoopHop(lane, 'qa-x');
    expect('clearLoopHop unblocks', loop.blockedLoopHops(lane, 1).length === 0);
  }

  // ── 2. the live specimen: 15 telemetry rows seed the guard ───────────────
  {
    const lane = tempLane();
    const created = new Date(Date.now() - 10 * 3600_000).toISOString();
    const rows = [];
    for (let i = 0; i < 15; i++) {
      rows.push(JSON.stringify({
        ts: new Date(Date.now() - (9 * 3600_000) + i * 20 * 60_000).toISOString(),
        hop: 'qa-glow-local', god: 'dionysus', status: 'parked:verify-failed',
        errorClass: 'verify-failed', lane: 'opencode-go/qwen3.7-plus', durationMs: 600_000, tokensOut: 100,
      }));
    }
    fs.writeFileSync(path.join(lane, '.olympus-hop-telemetry.jsonl'), rows.join('\n') + '\n');
    const seeded = loop.seedLoopGuardFromTelemetry(lane, 38, created);
    expect('15 parked rows seed the guard', seeded.length === 1 && seeded[0].entry.failures === 15, JSON.stringify(seeded));
    expect('seeded hop is blocked', Boolean(seeded[0]?.entry?.blockedAt));
    expect('seeded class is verify-failed', seeded[0]?.entry?.lastClass === 'verify-failed', JSON.stringify(seeded[0]));
    expect('seeding is idempotent', loop.seedLoopGuardFromTelemetry(lane, 38, created).length === 1);
  }

  // ── 3. walkPlan: 2 dispatches, then the third walk skips the hop ─────────
  {
    const lane = tempLane();
    const plan = {
      version: 1,
      laneRoot: lane,
      generation: 1,
      hops: [{
        id: 'qa-x', god: 'dionysus', prompt: 'QA the thing',
        artifacts: ['evidence/qa/x.md'],
        verify: { review: 'deterministic', checks: ['file-exists:evidence/qa/x.md'] },
        toolBudget: 16,
      }],
    };
    let calls = 0;
    const failing = async () => {
      calls += 1;
      return {
        ok: false, exitCode: 1, output: '', tokensIn: 1, tokensOut: 1,
        retriesAbsorbed: 0, exhausted: false,
        error: 'hop-tool-budget: 16/16', errorClass: 'tool-budget',
      };
    };
    const r1 = await walker.walkPlan({ plan, dispatcher: failing, resume: false, campaignId: 'cmp_stable', unattended: true });
    expect('first walk dispatches once', calls === 1, `calls=${calls}`);
    expect('first walk parks', r1.parked?.hopId === 'qa-x', JSON.stringify(r1.parked));
    const r2 = await walker.walkPlan({ plan, dispatcher: failing, resume: true, campaignId: 'cmp_stable', unattended: true });
    expect('second walk dispatches once (failure #2)', calls === 2, `calls=${calls}`);
    expect('second walk parks', r2.parked?.hopId === 'qa-x', JSON.stringify(r2.parked));
    const r3 = await walker.walkPlan({ plan, dispatcher: failing, resume: true, campaignId: 'cmp_stable', unattended: true });
    expect('third walk spends ZERO dispatches', calls === 2, `calls=${calls}`);
    expect('third walk names loop-blocked', r3.parked?.reason === 'loop-blocked', JSON.stringify(r3.parked));
  }

  // ── 4. the campaign id is stable across resumes ──────────────────────────
  {
    const lane = tempLane();
    writePlan(lane, [{
      id: 'hop-a', god: 'hephaestus', prompt: 'write a',
      artifacts: ['a.txt'], verify: { review: 'deterministic', checks: [] },
      toolBudget: 8,
    }]);
    seedState(lane, 1, 'cmp_stable');
    const failing = async () => ({
      ok: false, exitCode: 1, output: '', tokensIn: 1, tokensOut: 1,
      retriesAbsorbed: 0, exhausted: false,
      error: 'hop-tool-budget: 8/8', errorClass: 'tool-budget',
    });
    await post.maybeWalkThePlan({ slug: 'stable-fixture', laneRoot: lane, dispatcher: failing });
    const after1 = JSON.parse(fs.readFileSync(path.join(lane, '.olympus-hop-state.json'), 'utf-8'));
    await post.maybeWalkThePlan({ slug: 'stable-fixture', laneRoot: lane, dispatcher: failing });
    const after2 = JSON.parse(fs.readFileSync(path.join(lane, '.olympus-hop-state.json'), 'utf-8'));
    expect('campaign id survives resume #1', after1.campaignId === 'cmp_stable', String(after1.campaignId));
    expect('campaign id survives resume #2', after2.campaignId === 'cmp_stable', String(after2.campaignId));
    expect('second resume blocked the hop', loop.blockedLoopHops(lane, 1).some((b) => b.hopId === 'hop-a'));
  }

  // ── 5. QA verify-failed → fix hop + judge, then GREEN ────────────────────
  {
    const lane = tempLane();
    writePlan(lane, [{
      id: 'qa-glow-local', god: 'dionysus',
      prompt: 'QA: play the local clip and sample the halo. CHECKS: (1) live variation. WRITE evidence/qa/glow-local.md.',
      artifacts: ['evidence/qa/glow-local.md'],
      verify: { review: 'deterministic', checks: ['file-contains:evidence/qa/glow-local.md::Overall: PASS'] },
      toolBudget: 16,
    }]);
    fs.mkdirSync(path.join(lane, 'evidence/qa'), { recursive: true });
    fs.writeFileSync(path.join(lane, 'evidence/qa/glow-local.md'), [
      '# Glow local — QA',
      '',
      '| # | Check | Verdict | Evidence |',
      '|---|---|---|---|',
      '| 1 | local clip mounts | **FAIL** | zero local mounts on 5 surfaces |',
      '',
      '## The next hop',
      'Instrument `primaryClipForWorks` and confirm the local row survives the select.',
      '',
      'Overall: FAIL',
    ].join('\n'));
    const dispatched = [];
    const dispatcher = async (hop) => {
      dispatched.push(hop.id);
      if (hop.id === 'qa-glow-local') {
        // The first QA run writes FAIL; the judge run (after the fix) PASSes.
        const fixed = dispatched.some((id) => id.startsWith('fix-glow-local'));
        fs.writeFileSync(path.join(lane, 'evidence/qa/glow-local.md'), fixed
          ? '# Glow local — QA\n\nOverall: PASS\n'
          : '# Glow local — QA\n\nOverall: FAIL\n');
        return { ok: true, exitCode: 0, output: '', tokensIn: 1, tokensOut: 1, retriesAbsorbed: 0, exhausted: false };
      }
      if (hop.id.startsWith('fix-glow-local')) {
        fs.writeFileSync(path.join(lane, `evidence/qa/glow-local-repair-1.md`), 'fixed the election\n');
        return { ok: true, exitCode: 0, output: '', tokensIn: 1, tokensOut: 1, retriesAbsorbed: 0, exhausted: false };
      }
      fs.writeFileSync(path.join(lane, hop.artifacts?.[0] ?? 'unknown.txt'), 'x');
      return { ok: true, exitCode: 0, output: '', tokensIn: 1, tokensOut: 1, retriesAbsorbed: 0, exhausted: false };
    };
    const result = await post.maybeWalkThePlan({
      slug: 'qa-fixture', laneRoot: lane, dispatcher, unattended: true, expectPlan: true,
    });
    expect('QA repair dispatched a fix hop', dispatched.some((id) => id.startsWith('fix-glow-local')), JSON.stringify(dispatched));
    expect('QA judge re-ran after the fix', dispatched.filter((id) => id === 'qa-glow-local').length === 2, JSON.stringify(dispatched));
    expect('QA repair reached GREEN', result.completed === 2 && !result.parked, JSON.stringify({ completed: result.completed, total: result.total, parked: result.parked }));
    const repairLedger = JSON.parse(fs.readFileSync(path.join(lane, '.olympus-qa-repairs.json'), 'utf-8'));
    expect('QA repair ledger records cycle 1', repairLedger.hops?.['qa-glow-local']?.count === 1, JSON.stringify(repairLedger));
  }

  // ── 5b. a gate-* verification hop takes the same repair path ────────────
  {
    const lane = tempLane();
    const plan = {
      version: 1, laneRoot: lane, generation: 1, createdAt: new Date().toISOString(),
      hops: [{
        id: 'gate-back-parity', god: 'dionysus', prompt: 'HARD GATE - compare the backs. CHECKS: (1) bands; (2) texts; (3) scroll.',
        artifacts: ['evidence/qa/back-parity.md'], verify: { review: 'deterministic', checks: ['file-exists:evidence/qa/back-parity.md'] }, toolBudget: 20,
      }],
    };
    fs.mkdirSync(path.join(lane, 'evidence/qa'), { recursive: true });
    fs.writeFileSync(path.join(lane, 'evidence/qa/back-parity.md'), '| 1 | bands | **FAIL** | 3 vs 4 |\n\nOverall: FAIL\n');
    writePlan(lane, plan.hops, 1);
    const qa = await import(OLYMPUS + '/src/lib/hop-runtime/qa-repair.ts');
    const outcome = qa.planQaRepair({ laneRoot: lane, plan, qaHop: plan.hops[0], failureClass: 'verify-failed', error: null });
    expect('gate repair is scheduled', outcome.status === 'repaired', JSON.stringify(outcome));
    expect('gate repair fixes the gate, not QA', outcome.fixHop?.id === 'fix-back-parity-1', JSON.stringify(outcome.fixHop));
    expect('gate judge keeps a 14-call budget', outcome.qaHop?.toolBudget === 14, JSON.stringify(outcome.qaHop));
  }

  // ── 6. the QA repair cap: a third failure blocks instead of looping ─────
  {
    const lane = tempLane();
    const plan = {
      version: 1, laneRoot: lane, generation: 1,
      hops: [{ id: 'qa-x', god: 'dionysus', prompt: 'QA', artifacts: ['evidence/qa/x.md'], verify: { review: 'deterministic', checks: [] }, toolBudget: 16 }],
    };
    fs.mkdirSync(path.join(lane, 'evidence/qa'), { recursive: true });
    fs.writeFileSync(path.join(lane, 'evidence/qa/x.md'), 'Overall: FAIL\n');
    fs.writeFileSync(path.join(lane, '.olympus-qa-repairs.json'), JSON.stringify({
      version: 1, hops: { 'qa-x': { count: 2, lastGeneration: 1, lastAt: new Date().toISOString(), lastClass: 'verify-failed' } },
      updatedAt: new Date().toISOString(),
    }));
    const qa = await import(OLYMPUS + '/src/lib/hop-runtime/qa-repair.ts');
    const outcome = qa.planQaRepair({ laneRoot: lane, plan, qaHop: plan.hops[0], failureClass: 'verify-failed', error: null });
    expect('QA repair cap blocks the third cycle', outcome.status === 'blocked', JSON.stringify(outcome));
  }

  // ── 7. warden: loop-blocked lane never starts; a stale supervisor is not permission ──
  {
    const projects = path.join(TEST_VAULT, '02_Projects');
    fs.mkdirSync(projects, { recursive: true });
    fs.mkdirSync(path.join(TEST_HOME, 'supervisor'), { recursive: true });
    const lane = path.join(projects, 'warden-fixture');
    fs.mkdirSync(lane, { recursive: true });
    writePlan(lane, [{
      id: 'qa-glow-local', god: 'dionysus', prompt: 'QA', artifacts: ['evidence/qa/glow-local.md'],
      verify: { review: 'deterministic', checks: [] }, toolBudget: 16,
    }]);
    seedState(lane, 1, 'cmp_warden', { hopId: 'qa-glow-local', reason: 'verify-failed', ts: new Date().toISOString() });
    // The live specimen's telemetry seeds the guard inside the warden.
    const rows = [0, 1].map((i) => JSON.stringify({
      ts: new Date(Date.now() - 30_000 + i * 10_000).toISOString(),
      hop: 'qa-glow-local', god: 'dionysus', status: 'parked:verify-failed', errorClass: 'verify-failed',
      lane: 'opencode-go/qwen3.7-plus', durationMs: 600_000, tokensOut: 100,
    }));
    fs.writeFileSync(path.join(lane, '.olympus-hop-telemetry.jsonl'), rows.join('\n') + '\n');
    // A stale supervisor opt-in outside any hibernation window.
    fs.writeFileSync(path.join(TEST_HOME, 'supervisor', 'warden-fixture.json'), JSON.stringify({
      slug: 'warden-fixture', laneRoot: lane, pid: 1, bootId: 'x', startedAt: new Date().toISOString(),
      logFile: '/dev/null', autoResume: true, status: 'finished',
    }));
    const warden = await import(OLYMPUS + '/src/lib/atlas-warden.ts');
    let startCalls = 0;
    const state = warden.wardenTick({ vaultRoot: TEST_VAULT, persist: true, start: () => { startCalls += 1; return { ok: true, pid: 1 }; } });
    expect('warden does not start a loop-blocked lane', startCalls === 0, `startCalls=${startCalls}`);
    expect('warden decision names loop-blocked', state.decision?.reason === 'loop-blocked', JSON.stringify(state.decision));
  }

  console.log('');
  if (failures > 0) {
    console.log(`hop-loop-guard: ${failures} FAIL`);
    process.exit(1);
  }
  console.log('hop-loop-guard: all checks PASS');
}

await main();
