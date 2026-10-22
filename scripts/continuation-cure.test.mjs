#!/usr/bin/env node
/**
 * continuation-cure.test.mjs — W-S CONTINUATION-CURE (v0.0.8): the 23:31
 * specimen chain — a continuation prompt that asked for NEW work walked the
 * STALE plan while the planner's turn was still writing the NEW one
 * (hybrid "12/5 hops GREEN" state, a corrupt plan refusing every walk, the
 * user's approval narrated away, and no previewable front). One suite pins
 * every cure.
 *
 * Run: npx tsx scripts/continuation-cure.test.mjs   (exit 0 = pass)
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(OLYMPUS, p), 'utf-8');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 240)}`);
  if (!cond) failures++;
}

async function main() {
  // ── S1: the classifier escalates NEW-WORK continuations to planning ────
  const classifierSrc = read('src/lib/task-classifier.ts');
  expect('S1: plan vocabulary (dispatch-plan / TRABALHO NOVO / new plan) forces planning=true',
    classifierSrc.includes('W-S CONTINUATION-PLANNING') && classifierSrc.includes('trabalho novo'),
    'the 23:31 continuation was classified moderate/planning=false — Apollo narrated, the stale plan walked');

  // ── S2: a quoted CRITERION is not a project name ───────────────────────
  const intent = await import(OLYMPUS + '/src/lib/project-intent.ts');
  expect('S2: the acceptance-bar phrase never becomes a project name',
    intent.extractProjectName('Continue o Atlas — a barra de aceite: "eu publicaria isso" sem reservas') === null,
    'the eu-publicaria-isso junk-lane class survives');
  expect('S2: a REAL quoted name still routes (the #144 law intact)',
    intent.extractProjectName('Build "STARLIGHT CIDER" — a craft cider site') === 'STARLIGHT CIDER',
    'the distinct-name law lost its teeth');

  // ── S3: the plan JSON sanitizer (the corrupt-plan specimen) ────────────
  const postRun = await import(OLYMPUS + '/src/lib/hop-runtime/post-run.ts');
  const corrupt = '{\n  "hops": [\n    { "id": "a", "prompt": "linha um\nlinha dois\tTabbed" }\n  ]\n}';
  const sanitized = postRun.sanitizePlanJson(corrupt);
  let parsedOk = false;
  try { JSON.parse(sanitized); parsedOk = true; } catch { parsedOk = false; }
  expect('S3: sanitizePlanJson repairs raw control chars inside strings (the 23:32 Bad-control-character specimen)',
    parsedOk, `sanitized still unparseable: ${sanitized.slice(0, 80)}`);
  const clean = JSON.stringify({ version: 1, hops: [{ id: 'x', prompt: 'a\nb' }] });
  expect('S3: an ALREADY-VALID plan passes through unchanged semantics',
    JSON.parse(postRun.sanitizePlanJson(clean)).hops[0].prompt === 'a\nb',
    'the sanitizer corrupts valid plans');

  // ── S4: the state machine (fresh / resume / stale-complete) ────────────
  const prSrc = read('src/lib/hop-runtime/post-run.ts');
  expect('S4: the stale-complete echo is honest (never the liar\'s GREEN on a fresh ask)',
    prSrc.includes('stale-complete') && prSrc.includes('no NEW plan was written this turn'),
    'the 12/5 hybrid: a fully-walked plan re-echoes GREEN at a new prompt');
  expect('S4: a fresh plan on a lane with unrelated state RESETS the campaign memory',
    prSrc.includes("if (stateExists && !resume)") && prSrc.includes('unlinkSync(hopStatePath'),
    'retired-plan ids leak into new walks (the 12/5 specimen)');
  expect('S4: the counts are PLAN-SCOPED',
    prSrc.includes('result.completed.filter((id) => planIds.has(id)).length'),
    'cross-plan completed ids inflate the summary');

  // ── S5: the walk waits for the planning turn to SETTLE ──────────────────
  expect('S5: maybeWalkThePlan carries the turn-settle probe (OLYMPUS_TURN_SETTLE_MS)',
    prSrc.includes('turnStillAlive') && prSrc.includes('OLYMPUS_TURN_SETTLE_MS'),
    'the v2 prompt resolves a step early — the walk read the stale plan mid-write');
  const routeSrc = read('src/app/api/olympus/action/route.ts');
  expect('S5: the route wires the probe (isTurnAliveServerSide via ensureServer + getOrCreateSession)',
    routeSrc.includes('turnStillAlive') && routeSrc.includes('isTurnAliveServerSide'),
    'the settle wait never runs');

  // ── S6: the strict-JSON planner directive ───────────────────────────────
  expect('S6: the planner marker demands STRICT JSON (no raw line breaks in strings)',
    routeSrc.includes('STRICT JSON') && routeSrc.includes('Bad control character'),
    'the planner keeps writing corrupt plans');

  // ── S7: the static preview lane ───────────────────────────────────────
  const triggerSrc = read('src/lib/dev-server-trigger.ts');
  expect('S7: an HTML entry with no package.json is the STATIC lane (never "not a runnable project")',
    triggerSrc.includes('kind: \'static\'') && triggerSrc.includes('detectStaticHtmlEntry'),
    'the 23:36 specimen: the atlas front was invisible to the panel');
  const managerSrc = read('src/lib/dev-server-manager.ts');
  expect('S7: the manager gains startStatic (the durable static host, same state + probe lane)',
    managerSrc.includes('export async function startStatic') && managerSrc.includes('detectStaticEntry'),
    'the static lane has no durable host');
  expect('S7: the static server script ships',
    fs.existsSync(path.join(OLYMPUS, 'scripts', 'static-preview-server.mjs')),
    'no server to host the static lane');
  // The LIVE static server: a fixture lane + spawn + probe the entry.
  const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'static-preview-test-'));
  fs.writeFileSync(path.join(FIX, 'atlas.html'), '<!doctype html><title>F</title><h1>fixture-front</h1>');
  fs.writeFileSync(path.join(FIX, 'data.json'), '{"ok":true}');
  const live = await new Promise((resolve) => {
    const child = spawn('node', [path.join(OLYMPUS, 'scripts', 'static-preview-server.mjs'), '0', FIX, 'atlas.html'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
      const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
      if (m) resolve({ port: Number(m[1]), child });
    });
    setTimeout(() => resolve(null), 8000);
  });
  expect('S7: the static server boots and reports its port', !!live, 'no boot line in 8s');
  if (live) {
    const html = await fetch(`http://127.0.0.1:${live.port}/`).then((r) => r.text()).catch(() => null);
    const json = await fetch(`http://127.0.0.1:${live.port}/data.json`).then((r) => r.text()).catch(() => null);
    const mime = await fetch(`http://127.0.0.1:${live.port}/data.json`).then((r) => r.headers.get('content-type')).catch(() => null);
    const trav = await fetch(`http://127.0.0.1:${live.port}/../../../etc/passwd`).then((r) => r.status).catch(() => 'err');
    expect('S7: the entry serves (the fixture front)',
      typeof html === 'string' && html.includes('fixture-front'), 'no HTML at the root');
    expect('S7: sibling assets serve with the right MIME',
      json === '{"ok":true}' && String(mime).includes('application/json'), 'data.json unreachable or mistyped');
    expect('S7: traversal falls to the SPA entry (never escapes the lane)',
      trav === 200, `traversal status ${trav}`);
    live.child.kill();
  }
  fs.rmSync(FIX, { recursive: true, force: true });

  // ── S8/S9/S10: the 00:53 specimen chain — the echo, the kill, the silence ─
  expect('S8: the walk RETIRES the warm-stall timer (a silent hop never kills a healthy stream mid-walk)',
    routeSrc.includes('WALK-STALL-RETIRE') && routeSrc.includes('clearInterval(warmStallTimer)'),
    'the 00:56 death: the stall bound fired over the running walk');
  expect('S9: the plan-freshness gate (an echoed plan that was never written never walks)',
    prSrc.includes('W-T PLAN-FRESHNESS') && prSrc.includes('plan-not-written'),
    "the 00:53 specimen: the model's chat-text plan walked the STALE file from a prior session");
  expect('S9: the route passes the turn start (turnStartedAt) to the walk',
    routeSrc.includes('turnStartedAt = Date.now()') && routeSrc.includes('turnStartedAt,'),
    'the freshness gate has no clock');
  expect('S10: the walker heartbeats long hops (the demora-mt visibility cure)',
    read('src/lib/hop-runtime/walker.ts').includes('hop_heartbeat') && prSrc.includes('hop_heartbeat'),
    'a silent 2-minute spawn reads as a hang');

  // ── S11/S12/S13: the 01:50 specimen — the narration loop, the accent, the
  //    invented check ──
  expect('S11: the freshness gate HARVESTS the narrated plan before refusing',
    prSrc.includes('W-U PLAN-HARVEST') && prSrc.includes('harvestPlanFromTurnText'),
    'the 01:56 loop: four turns of REESCREVENDO claims with the mtime frozen — the prose never became the file');
  const narrated = `Pronto! O plano está aqui:\n\n\`\`\`json\n{"version":1,"hops":[{"id":"a","god":"athena","prompt":"fa\u00e7a o layout","artifacts":["dashboard.html"],"verify":{"review":"determin\u00edstico","checks":["design-score:7"]},"budgetTokens":8192}]}\n\`\`\`\nPronto, execu\u00e7\u00e3o agendada.`;
  const harvested = postRun.harvestPlanFromTurnText(narrated);
  expect('S11: the narrated fenced plan IS harvested (fenced-json extraction)',
    !!harvested, 'a complete narrated plan slipped through');
  if (harvested) {
    const hp = JSON.parse(harvested.strict);
    expect('S12: the translated enum folds (determinístico → deterministic)',
      hp.hops[0].verify.review === 'deterministic' && harvested.notes.some((n) => n.includes('determinístico')),
      `review stayed: ${hp.hops[0].verify.review}`);
    expect('S13: the invented check demotes to file-exists (loudly)',
      hp.hops[0].verify.checks[0] === 'file-exists:dashboard.html' && harvested.notes.some((n) => n.includes('demoted')),
      `checks: ${JSON.stringify(hp.hops[0].verify.checks)}`);
  }
  expect('S11: a planless narration harvests nothing (the honest null)',
    postRun.harvestPlanFromTurnText('oi tudo bem, sem plano aqui') === null,
    'garbage extraction would write junk plans');
  const normDirect = postRun.normalizePlanForWalk({ hops: [{ id: 'x', verify: { review: 'determin\u00edstico', checks: ['lint'] }, artifacts: ['a.html'] }] });
  expect('S13: the normalize pass leaves supported checks untouched',
    normDirect.plan.hops[0].verify.checks[0] === 'lint' && normDirect.notes.length === 1,
    'the demotion fired on a valid check');

  // ── S14/S15: the W-V PLANNER LANE (the 11:53 Code Mode lottery) ───────
  const wsCfg = JSON.parse(fs.readFileSync('/home/texugo/.local/share/olympus/workspace/opencode.json', 'utf-8'));
  const repoCfg = JSON.parse(read('opencode.json'));
  expect('S14: apollo.permission.execute = deny (the planner rides CLASSIC mode — write is direct)',
    wsCfg.agent.apollo.permission?.execute === 'deny' && repoCfg.agent.apollo.permission?.execute === 'deny',
    'the Code Mode lottery survives: the free planner searches the catalog for write (never cataloged) and reports itself BLOCKED');
  expect('S14: the apply re-asserts the flip (a re-apply never loses it)',
    read('scripts/apply-strategy.js').includes('W-V THE PLANNER LANE') && read('scripts/apply-strategy.js').includes("permission.execute !== 'deny'"),
    'the next strategy apply would strip the planner lane');
  expect('S15: the planner marker states the DIRECT-tools contract (the belt for any residual code-mode session)',
    routeSrc.includes('YOUR FILE TOOLS ARE DIRECT') && routeSrc.includes('the catalog search will NOT find them'),
    'a code-mode session keeps misreading the contract');

  if (failures > 0) { console.error(`\ncontinuation-cure: ${failures} FAIL`); process.exit(1); }
  console.log('\ncontinuation-cure: all green.');
}

main().catch((e) => { console.error('FIXTURE CRASH:', e); process.exit(1); });
