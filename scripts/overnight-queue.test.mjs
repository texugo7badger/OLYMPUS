#!/usr/bin/env node
/**
 * overnight-queue.test.mjs — #211 (v0.0.9): the unattended overnight lane.
 *
 * Run: npx tsx scripts/overnight-queue.test.mjs   (exit 0 = pass)
 *
 * The doctrine: the walker already isolates every hop in a fresh session,
 * so a night-long campaign never bloats the window or drifts. #211 adds
 * the missing HUMAN substitute: the plan-walk gate auto-approves in
 * unattended mode (recorded honestly), parks auto-resume within a bounded
 * budget, and the morning digest + one live.jsonl row per wave land when
 * the campaign settles.
 *
 * The behavioral cycles ride a CHILD process: the gate record persists in
 * the VAULT and the night log is the real live.jsonl — the fake env must
 * bind at module import (the hop-runtime.test.mjs precedent).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

function tempLane() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-night-'));
}

function validPlan(laneRoot, hops) {
  return { version: 1, laneRoot, hops };
}

async function main() {
  // ── S1: the wave model (topological depth) ─────────────────────────────
  const overnight = await import(OLYMPUS + '/src/lib/hop-runtime/overnight.ts');
  const plan3 = validPlan('/tmp/lane', [
    { id: 'w1-shell', god: 'hephaestus', prompt: 'shell', artifacts: ['shell.txt'] },
    { id: 'w1-tokens', god: 'athena', prompt: 'tokens', artifacts: ['tokens.css'] },
    { id: 'w2-pages', god: 'athena', prompt: 'pages', artifacts: ['page.tsx'], after: ['w1-shell', 'w1-tokens'] },
    { id: 'w3-review', god: 'athena', prompt: 'review', artifacts: ['review.json'], after: ['w2-pages'] },
  ]);
  const waves = overnight.computeWaves(plan3);
  expect('S1: a 3-wave plan groups into 3 topological waves',
    waves.length === 3 && waves[0].hops.length === 2 && waves[1].hops[0]?.id === 'w2-pages' && waves[2].hops[0]?.id === 'w3-review',
    JSON.stringify(waves.map((w) => w.hops.map((h) => h.id))));
  expect('S1: `after` edges outside the plan do not invent waves',
    overnight.computeWaves(validPlan('/tmp/lane', [
      { id: 'only', god: 'athena', prompt: 'x', artifacts: ['x'], after: ['retired-hop'] },
    ])).length === 1, 'an external dependency created a phantom wave');

  // ── S2: the digest is built from telemetry, never from narration ───────
  const rows = [
    { ts: '2026-10-23T01:00:00.000Z', hop: 'w1-shell', god: 'hephaestus', lane: '/tmp/lane', tokensIn: 10, tokensOut: 120, durationMs: 1200, retriesAbsorbed: 0, status: 'completed' },
    { ts: '2026-10-23T01:01:00.000Z', hop: 'w1-tokens', god: 'athena', lane: '/tmp/lane', tokensIn: 10, tokensOut: 80, durationMs: 800, retriesAbsorbed: 0, status: 'completed' },
    { ts: '2026-10-23T01:02:00.000Z', hop: 'w2-pages', god: 'athena', lane: '/tmp/lane', tokensIn: 10, tokensOut: 300, durationMs: 2100, retriesAbsorbed: 0, status: 'parked-verify-failed' },
  ];
  const digest = overnight.buildOvernightDigest({
    slug: 'night-fixture', laneRoot: '/tmp/lane', plan: plan3, rows,
    parked: { hopId: 'w2-pages', reason: 'verify-failed' },
    autoApproved: true, resumeAttempts: 1,
    startedAt: '2026-10-23T01:00:00.000Z', finishedAt: '2026-10-23T01:10:00.000Z',
  });
  expect('S2: the digest names every wave + outcome',
    /## Waves/.test(digest) && /### Wave 1 — GREEN/.test(digest) && /### Wave 2 — PARKED/.test(digest) && /### Wave 3 — PENDING/.test(digest),
    digest.slice(0, 300));
  expect('S2: the digest carries the honest park (hop + reason)',
    /Parked: w2-pages \(verify-failed\)/.test(digest) && /\[parked\] `w2-pages`/.test(digest),
    digest.split('\n').slice(0, 10).join(' | '));
  expect('S2: the digest records the overnight auto-approval + resumes',
    /Auto-approved: yes/.test(digest) && /Auto-resumes: 1/.test(digest),
    'the digest hides who approved the gate');
  expect('S2: the digest states the context-hygiene doctrine (fresh session per hop)',
    /every hop runs in its own fresh session/i.test(digest),
    'the digest never explains the isolation');
  expect('S2: writeOvernightDigest lands at the documented lane path',
    overnight.OVERNIGHT_DIGEST_FILENAME === '.olympus-morning-digest.md',
    overnight.OVERNIGHT_DIGEST_FILENAME);

  // ── S3: the wiring pins (RED before the cure) ──────────────────────────
  const postRunSrc = read('src/lib/hop-runtime/post-run.ts');
  const routeSrc = read('src/app/api/olympus/action/route.ts');
  expect('S3: maybeWalkThePlan accepts the unattended flag',
    /unattended\?: boolean/.test(postRunSrc) && /overnightAttempt\?: number/.test(postRunSrc),
    'the walk has no unattended seam');
  expect('S3: the gate auto-approves ONLY in unattended mode (attended still waits)',
    /if \(!opts\.unattended\) \{[\s\S]{0,240}awaiting-approval/.test(postRunSrc) && /auto-approved — unattended overnight run/.test(postRunSrc),
    'the auto-approval is not gated by the flag');
  expect('S3: the bounded auto-resume is env-tunable',
    /OLYMPUS_OVERNIGHT_RESUME_ATTEMPTS/.test(postRunSrc) && /OLYMPUS_OVERNIGHT_RESUME_DELAY_MS/.test(postRunSrc),
    'the resume chain is unbounded');
  expect('S3: the route threads the #51 unattended flag into the warm stream',
    /unattended\?: boolean;/.test(routeSrc) && /unattended: opts\.unattended === true/.test(routeSrc) && /^      unattended,$/m.test(routeSrc),
    'the overnight flag never reaches the walk');
  expect('S3: the settle writes the digest + one live.jsonl row per wave',
    /writeOvernightDigest\(/.test(postRunSrc) && /kind: 'overnight-wave'/.test(postRunSrc) && /kind: 'overnight-auto-approve'/.test(postRunSrc),
    'the night log is missing');

  // ── S4: the behavioral cycles (fake vault bound at import) ─────────────
  {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-night-run-'));
    for (const d of ['vault', 'root', 'home']) fs.mkdirSync(path.join(work, d), { recursive: true });
    const env = {
      ...process.env,
      OLYMPUS_VAULT: path.join(work, 'vault'),
      OLYMPUS_ROOT: path.join(work, 'root'),
      HOME: path.join(work, 'home'),
    };
    const r = spawnSync('npx', ['tsx', OLYMPUS + '/scripts/overnight-queue.test.mjs', 'child-overnight'], {
      encoding: 'utf-8', cwd: OLYMPUS, timeout: 180_000, env,
    });
    let C = null;
    try { C = JSON.parse(String(r.stdout).trim().split('\n').filter(Boolean).pop()); } catch { C = null; }
    expect('S4: the child-overnight fixture ran (the fake vault bound at import)',
      !!C && !C.__err, `${r.status} ${String(r.stdout).slice(-160)} ${String(r.stderr).slice(-240)}`);
    if (C) {
      expect('S4a: a 3-wave plan completes end-to-end with unattended on — NO gate wait',
        C.a?.walked === true && C.a?.completed === 4 && C.a?.total === 4 && C.a?.awaiting === false,
        JSON.stringify(C.a).slice(0, 240));
      expect('S4a: the gate record is auto-approved with the honest note',
        C.aGate?.decision === 'approve' && /auto-approved/.test(C.aGate?.userNote || ''),
        JSON.stringify(C.aGate).slice(0, 240));
      expect('S4a: the morning digest exists and shows all 3 waves GREEN',
        C.aDigest === true && /### Wave 1 — GREEN/.test(C.aDigestText || '') && /### Wave 2 — GREEN/.test(C.aDigestText || '') && /### Wave 3 — GREEN/.test(C.aDigestText || ''),
        (C.aDigestText || '').slice(0, 300));
      expect('S4a: live.jsonl carries the auto-approve row + one row per wave',
        C.autoApproveRows === 1 && C.waveRows === 3,
        `autoApprove=${C.autoApproveRows} waves=${C.waveRows}`);
      expect('S4a: the walk narrates the overnight auto-approval in-stream',
        Array.isArray(C.aEvents) && C.aEvents.some((m) => /\[OVERNIGHT\] plan-walk gate auto-approved/.test(m)),
        JSON.stringify(C.aEvents || []).slice(0, 240));

      expect('S4b: an ATTENDED run still waits at the gate (the control)',
        C.b?.awaiting === true && C.b?.walked === false && C.bDigest === false,
        JSON.stringify(C.b).slice(0, 240));

      expect('S4c: a park auto-resumes and the campaign completes without input',
        C.c?.walked === true && C.c?.completed === 2 && C.c?.total === 2 && C.c?.parked === null,
        JSON.stringify(C.c).slice(0, 240));
      expect('S4c: the parked hop was re-dispatched exactly once (fresh walk call)',
        C.cDispatch?.filter((id) => id === 'c-2').length === 2 && C.cDispatch?.[0] === 'c-1',
        JSON.stringify(C.cDispatch));
      expect('S4c: the resume was narrated + logged (night log row)',
        Array.isArray(C.cEvents) && C.cEvents.some((m) => /\[OVERNIGHT\] wave parked/.test(m)) && C.resumeRows === 1,
        `resumeRows=${C.resumeRows} events=${JSON.stringify(C.cEvents || []).slice(0, 200)}`);
      expect('S4c: the final digest is all GREEN after the auto-resume',
        C.cDigest === true && /### Wave 1 — GREEN/.test(C.cDigestText || '') && /### Wave 2 — GREEN/.test(C.cDigestText || ''),
        (C.cDigestText || '').slice(0, 240));
    }
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

// ─── Child: the behavioral fixture (fake vault + fake OLYMPUS root) ────────
if (process.argv[2] === 'child-overnight') {
  const run = async () => {
    const vault = process.env.OLYMPUS_VAULT;
    fs.mkdirSync(path.join(vault, '05_Auto_Learning'), { recursive: true });
    fs.mkdirSync(path.join(vault, '06_Activity_Feed'), { recursive: true });
    fs.writeFileSync(path.join(process.env.OLYMPUS_ROOT, 'opencode.json'), JSON.stringify({
      agent: {
        hephaestus: { model: 'nvidia-deepseek/deepseek-v4.1-flash' },
        athena: { model: 'nvidia-kimi/moonshotai/kimi-k3' },
      },
    }));
    fs.mkdirSync(path.join(process.env.OLYMPUS_ROOT, '.opencode', 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(process.env.OLYMPUS_ROOT, 'opencode.demigods.json'), JSON.stringify({ demigods: {} }));

    const postRun = await import(OLYMPUS + '/src/lib/hop-runtime/post-run.ts');
    const hitl = await import(OLYMPUS + '/src/lib/hitl-gates.ts');
    const overnight = await import(OLYMPUS + '/src/lib/hop-runtime/overnight.ts');

    const out = { __err: null };
    const mkPlan = (lane, hops) => fs.writeFileSync(path.join(lane, 'dispatch-plan.json'), JSON.stringify(validPlan(lane, hops)));
    const okResult = { ok: true, exitCode: 0, output: '', tokensIn: 1, tokensOut: 2, retriesAbsorbed: 0, exhausted: false };
    const feed = () => {
      const p = path.join(vault, '06_Activity_Feed', 'live.jsonl');
      if (!fs.existsSync(p)) return [];
      return fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    };
    const digestText = (lane) => {
      const p = path.join(lane, overnight.OVERNIGHT_DIGEST_FILENAME);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
    };

    // ── CYCLE A: 3 waves, unattended, everything GREEN, zero gate wait ──
    const laneA = tempLane();
    mkPlan(laneA, [
      { id: 'w1-shell', god: 'hephaestus', prompt: 'shell', artifacts: ['shell.txt'], verify: { review: 'deterministic', checks: ['file-exists:shell.txt'] } },
      { id: 'w1-tokens', god: 'athena', prompt: 'tokens', artifacts: ['tokens.css'], verify: { review: 'deterministic', checks: ['file-exists:tokens.css'] } },
      { id: 'w2-pages', god: 'athena', prompt: 'pages', artifacts: ['page.tsx'], after: ['w1-shell', 'w1-tokens'], verify: { review: 'deterministic', checks: ['file-exists:page.tsx'] } },
      { id: 'w3-review', god: 'athena', prompt: 'review', artifacts: ['review.json'], after: ['w2-pages'], verify: { review: 'deterministic', checks: ['file-exists:review.json'] } },
    ]);
    const aEvents = [];
    const okA = async (hop) => { fs.writeFileSync(path.join(laneA, hop.artifacts[0]), 'x'); return okResult; };
    const a = await postRun.maybeWalkThePlan({
      slug: 'night-a', laneRoot: laneA, send: (ev) => aEvents.push(ev.msg ?? ''), dispatcher: okA,
      sessionId: 'ses-night', unattended: true,
    });
    out.a = { walked: a.walked, completed: a.completed, total: a.total, awaiting: !!a.awaitingApproval };
    out.aEvents = aEvents.filter(Boolean);
    out.aGate = hitl.listGates().find((g) => g.targetFile === path.join(laneA, 'dispatch-plan.json')) ?? null;
    out.aDigestText = digestText(laneA);
    out.aDigest = out.aDigestText !== null;
    out.autoApproveRows = feed().filter((e) => e.meta?.kind === 'overnight-auto-approve' && e.project === 'night-a').length;
    out.waveRows = feed().filter((e) => e.meta?.kind === 'overnight-wave' && e.project === 'night-a').length;

    // ── CYCLE B: the attended control — the gate still holds ────────────
    const laneB = tempLane();
    mkPlan(laneB, [
      { id: 'b-1', god: 'hephaestus', prompt: 'x', artifacts: ['b.txt'], verify: { review: 'deterministic', checks: ['file-exists:b.txt'] } },
    ]);
    const okB = async (hop) => { fs.writeFileSync(path.join(laneB, hop.artifacts[0]), 'x'); return okResult; };
    const b = await postRun.maybeWalkThePlan({ slug: 'night-b', laneRoot: laneB, dispatcher: okB, sessionId: 'ses-night' });
    out.b = { walked: b.walked, awaiting: !!b.awaitingApproval };
    out.bDigest = digestText(laneB) !== null;

    // ── CYCLE C: a park auto-resumes (bounded), then the campaign lands ──
    process.env.OLYMPUS_OVERNIGHT_RESUME_DELAY_MS = '0';
    process.env.OLYMPUS_OVERNIGHT_RESUME_ATTEMPTS = '2';
    const laneC = tempLane();
    mkPlan(laneC, [
      { id: 'c-1', god: 'hephaestus', prompt: 'one', artifacts: ['c1.txt'], verify: { review: 'deterministic', checks: ['file-exists:c1.txt'] } },
      { id: 'c-2', god: 'athena', prompt: 'two', artifacts: ['c2.txt'], after: ['c-1'], verify: { review: 'deterministic', checks: ['file-exists:c2.txt'] } },
    ]);
    const cDispatch = [];
    let c2Attempts = 0;
    const flaky = async (hop) => {
      cDispatch.push(hop.id);
      if (hop.id === 'c-2') {
        c2Attempts++;
        if (c2Attempts === 1) {
          return { ok: false, exitCode: 1, output: '', tokensIn: null, tokensOut: null, retriesAbsorbed: 4, exhausted: true, error: 'provider burst — all lanes dead' };
        }
      }
      fs.writeFileSync(path.join(laneC, hop.artifacts[0]), 'x');
      return okResult;
    };
    const cEvents = [];
    const c = await postRun.maybeWalkThePlan({
      slug: 'night-c', laneRoot: laneC, send: (ev) => cEvents.push(ev.msg ?? ''), dispatcher: flaky,
      sessionId: 'ses-night', unattended: true,
    });
    out.c = { walked: c.walked, completed: c.completed, total: c.total, parked: c.parked ? c.parked.hopId : null };
    out.cDispatch = cDispatch;
    out.cEvents = cEvents.filter(Boolean);
    out.cDigestText = digestText(laneC);
    out.cDigest = out.cDigestText !== null;
    out.resumeRows = feed().filter((e) => e.meta?.kind === 'overnight-resume' && e.project === 'night-c').length;

    console.log(JSON.stringify(out));
    process.exit(0);
  };
  run().catch((e) => {
    console.log(JSON.stringify({ __err: e instanceof Error ? e.stack ?? e.message : String(e) }));
    process.exit(0);
  });
} else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
