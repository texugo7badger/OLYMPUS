#!/usr/bin/env node
/**
 * selftest-campaign.mjs — the operator's campaign self-test (#SELFTEST-1,
 * the 2026-10-17 directive: "only return when YOUR test passes — delete the
 * CRM and run it from zero"). Drive the REAL machinery end-to-end:
 *
 *   1. CLEAN: delete the project lane + reset the active pointer
 *   2. POST the ORIGINAL prompt to /api/olympus/action (the same route the
 *      terminal uses) and consume the SSE stream (node:http — no undici
 *      bodyTimeout)
 *   3. ANSWER the plan-walk HITL gate ('s — approve') when it asks
 *   4. SURVIVE server deaths: if the stream aborts (the dev server died —
 *      the 05:42 and 08:15 specimens), RESTART the dev server and send
 *      'continue' — the walk resumes from the durable hop-state (the disk
 *      carries the campaign)
 *   5. VERIFY the deliverable: hop-state completed + npm run build green
 *
 * Exit 0 only when the campaign completed FOR THE OPERATOR. Usage:
 *   node scripts/selftest-campaign.mjs [--slug lumina-crm] [--port 3737]
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as http from 'node:http';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const SLUG = arg('slug', 'lumina-crm');
// #146 THE PORT ISOLATION (the ERR_CONNECTION_REFUSED specimen, 2026-10-18
// 14:30): the bench's default port was 3737 — THE APP'S OWN PORT. The app
// attaches to any Next server it finds there (electron/main.ts), so the
// user's app window rode the BENCH's server; when the bench server died
// the app died with it (and the #145 fuser-kill could MURDER the app's
// own server). The bench's default is now the dedicated 3741, and 3737 is
// a HARD REFUSAL — the bench may never share the app's lane.
const PORT = Number(arg('port', '3741'));
if (PORT === 3737) {
  console.error('REFUSED: port 3737 is the OLYMPUS app\'s own port — the bench never shares it (the app would attach to the bench server and die with it). Use the default 3741 or any other port.');
  process.exit(2);
}
// --resume: continue an existing campaign (skip the clean; the hop-state
// carries the progress). Without it: the directive — delete + from zero.
// --no-clean (v0.0.4 #144 containment): the RUNNER pre-creates + pins the
// lane (the project note the intent matcher routes via) — the clean would
// DELETE the pin before the post. The pointer reset still runs.
const RESUME = args.includes('--resume');
const NO_CLEAN = args.includes('--no-clean');
const VAULT = join(homedir(), 'OLYMPUS-VAULT');
const LANE = join(VAULT, '02_Projects', SLUG);
const ACTIVE = join(homedir(), '.olympus', 'active-project.json');
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = `http://localhost:${PORT}`;
const ROOT = process.cwd();
const DEV_LOG = join('/tmp', 'opencode', 'selftest-next-dev.log');

// v0.0.4 BENCH: --prompt-file drives a NEW project campaign (the user's
// "make OLYMPUS build some other project" directive) — without it the
// original Lumina prompt stays the default.
const PROMPT_FILE = arg('prompt-file', null);
const ORIGINAL_PROMPT = PROMPT_FILE
  ? readFileSync(PROMPT_FILE, 'utf-8').trim()
  : (readFileSync(join(ROOT, 'reports', 'plano-master-1', 's0', 'vault-lumina', '_handoff.md'), 'utf-8')
      .match(/## 👤 User's Request\s*\n\s*\n> ([^\n]+)/)?.[1]
      ?? 'Construa o "Lumina CRM" — um mock premium de SaaS com identidade dark.');

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

// ── The dev-server lifecycle (survive its death) ────────────────────────────
let devChild = null;
async function ensureDevServer() {
  // #DEV-HANG (the 06:12 specimen): the health probes had NO timeout — a
  // zombie holding the port (accepts the connection, never answers) hung
  // every fetch for undici's 300s header timeout; 90 rounds of that = the
  // 90-minute dead budget the night burned four times. Every probe now
  // carries a 5s abort, and the port gets FREED before the spawn (the
  // zombie class dies at the root).
  const probe = () => fetch(`${BASE}/api/olympus/health`, {
    headers: { Origin: ORIGIN },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  const healthy = await probe();
  if (healthy && healthy.ok) { log('dev server already healthy'); return; }
  log('dev server DOWN — freeing the port + (re)starting next dev…');
  try { spawnSync('fuser', ['-k', `${PORT}/tcp`], { stdio: 'ignore' }); } catch {}
  appendFileSync(DEV_LOG, `\n=== selftest restart @ ${new Date().toISOString()} ===\n`);
  devChild = spawn('npx', ['next', 'dev', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  devChild.stdout.on('data', (d) => appendFileSync(DEV_LOG, String(d)));
  devChild.stderr.on('data', (d) => appendFileSync(DEV_LOG, String(d)));
  devChild.on('exit', (code, signal) => appendFileSync(DEV_LOG, `\n!!! DEV SERVER EXITED code=${code} signal=${signal} @ ${new Date().toISOString()}\n`));
  for (let i = 0; i < 90; i++) {
    const p = await probe();
    if (p && p.ok) { log(`dev server UP after ${(i + 1) * 2}s`); return; }
    if (i > 0 && i % 15 === 0) log(`dev server still down after ${i * 2}s (see ${DEV_LOG})…`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('dev server would not come up (180s) — port freed, probes time-bounded; see the dev log');
}

// ── The SSE driver (node:http — NO undici bodyTimeout) ─────────────────────
function postAction(text, conversationId) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ action: 'prompt', text, conversationId });
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: '/api/olympus/action', method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      if (res.statusCode >= 300) { reject(new Error(`action POST failed: HTTP ${res.statusCode}`)); res.resume(); return; }
      resolve(res);
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function consumeStream(res, conversationId, opts = {}) {
  const events = [];
  let lastEventAt = Date.now();
  let buf = '';
  const silenceAbortMs = opts.silenceAbortMs ?? 20 * 60_000;
  // #SILENCE-BUG: the per-chunk silence check NEVER ran while silent (no
  // chunks = no checks = the driver hung 2h over a frozen server). The timer
  // checks regardless; the chunk loop only parses.
  let streamDead = false;
  const silenceTimer = setInterval(() => {
    if (Date.now() - lastEventAt > silenceAbortMs) streamDead = true;
  }, 5000);
  try {
  for await (const chunk of res) {
    if (streamDead) throw new Error(`SELF-TEST ABORT: ${Math.round((Date.now() - lastEventAt) / 1000)}s of stream silence`);
    buf += chunk.toString('utf-8');
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line.slice(6)); } catch { continue; }
      lastEventAt = Date.now();
      events.push(ev);
      if (['log', 'hop_start', 'hop_done', 'hop_parked', 'walk_summary', 'question', 'permission_pending', 'error'].includes(ev.type)) {
        log(`EV ${(ev.msg || ev.type).slice(0, 150)}`);
      }
      if (ev.type === 'action_done') return { events, code: ev.code, ended: true };
    }
    if (Date.now() - lastEventAt > silenceAbortMs) {
      throw new Error(`SELF-TEST ABORT: ${Math.round((Date.now() - lastEventAt) / 1000)}s of stream silence`);
    }
  }
  } finally { clearInterval(silenceTimer); }
  if (streamDead) throw new Error(`SELF-TEST ABORT: ${Math.round((Date.now() - lastEventAt) / 1000)}s of stream silence`);
  return { events, code: null, ended: false };
}

// ── VERIFICATION ────────────────────────────────────────────────────────────
function verify() {
  // v0.0.4 BENCH: the intake may have derived its OWN project name from
  // the prompt — the active pointer carries the REAL lane; fall back to
  // the --slug hint.
  let lane = LANE;
  try {
    const active = JSON.parse(readFileSync(ACTIVE, 'utf-8'));
    if (active?.lane && existsSync(join(active.lane, 'dispatch-plan.json'))) lane = active.lane;
  } catch { /* keep the hint */ }
  log(`verify lane: ${lane}`);
  const statePath = join(lane, '.olympus-hop-state.json');
  const planPath = join(lane, 'dispatch-plan.json');
  const problems = [];
  if (!existsSync(planPath)) problems.push('dispatch-plan.json missing — the planner never delivered');
  if (!existsSync(statePath)) {
    problems.push('hop-state missing — the walk never started');
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
    const total = plan.hops.length;
    log(`walk state: ${state.completed.length}/${total} completed${state.parked ? ` — PARKED at ${state.parked.hopId} (${state.parked.reason})` : ''}`);
    if (state.parked) problems.push(`walk parked at '${state.parked.hopId}' (${state.parked.reason}) — campaign incomplete`);
    if (state.completed.length < total) problems.push(`walk incomplete: ${state.completed.length}/${total}`);
  }
  if (existsSync(join(lane, 'package.json'))) {
    log('running npm run build in the lane…');
    const build = spawnSync('npm', ['run', 'build'], { cwd: lane, encoding: 'utf-8', timeout: 15 * 60_000 });
    log(`build exit=${build.status}`);
    if (build.status !== 0) problems.push(`npm run build FAILED (exit ${build.status}): ${String(build.stderr || build.stdout || '').slice(-400)}`);
  } else {
    problems.push('no package.json in the lane — the scaffold hop never landed');
  }
  return problems;
}

// ── MAIN: the resilient campaign loop ─────────────────────────────────────
try {
  if (RESUME) {
    log(`resume: keeping ${LANE} (the hop-state carries the campaign)`);
  } else if (NO_CLEAN) {
    writeFileSync(ACTIVE, '{}');
    log(`clean skipped (--no-clean — the runner pinned the lane; pointer reset only): ${LANE}`);
  } else {
    rmSync(LANE, { recursive: true, force: true });
    writeFileSync(ACTIVE, '{}');
    log(`clean: ${LANE} deleted, pointer reset`);
  }

  await ensureDevServer();

  const convo = `selftest-${Date.now()}`;
  let cycle = 0;
  const MAX_CYCLES = 8;
  // A cycle's next prompt: 'continue' when a durable campaign exists (the
  // walk resumes from hop-state), the ORIGINAL when the planner never
  // delivered (a stalled planning turn gets a FRESH start — the pool that
  // ate the last turn rarely eats the next).
  const nextText = () => (existsSync(join(LANE, 'dispatch-plan.json')) ? 'continue' : ORIGINAL_PROMPT);
  let text = ORIGINAL_PROMPT;
  while (cycle < MAX_CYCLES) {
    cycle++;
    log(cycle === 1 ? `posting the campaign prompt${PROMPT_FILE ? ` (${PROMPT_FILE})` : ' (the original Lumina handoff)'}…` : `RESUME cycle ${cycle}: posting 'continue' (the walk resumes from hop-state)…`);
    let res;
    try {
      res = await postAction(text, convo);
    } catch (e) {
      log(`POST failed (${e.message}) — the dev server probably died; restarting + retrying`);
      await ensureDevServer();
      res = await postAction(text, convo);
    }
    let out;
    try {
      out = await consumeStream(res, convo, { silenceAbortMs: 25 * 60_000 });
    } catch (e) {
      log(`stream broke: ${e.message}`);
      out = { events: [], code: null, ended: false };
    }
    if (!out.ended) {
      log('stream ended abnormally — the server died mid-walk (the durable hop-state carries the campaign)');
      await ensureDevServer();
      text = nextText();
      continue;
    }
    // The gate: answer 's' when the plan-walk approval asks.
    const gateQ = out.events.find((e) => e.type === 'question' && /approve the walk|Plan walk/i.test(String(e.msg || '') + String(e.choices?.join(' ') || '')));
    if (gateQ) {
      log('the plan-walk gate asked — answering "s" (approve)');
      const approvalRes = await postAction('s', convo);
      const approval = await consumeStream(approvalRes, convo, { silenceAbortMs: 60 * 60_000 });
      if (!approval.ended) {
        log('approval stream broke — restarting + resuming');
        await ensureDevServer();
        text = nextText();
        continue;
      }
    }
    // Cycle completed: check the state.
    const problems = verify();
    if (problems.length === 0) {
      console.log(`\nselftest-campaign: PASSED after ${cycle} cycle(s) — the campaign completed end-to-end for the operator (plan walked, build green).`);
      process.exit(0);
    }
    const resumable = problems.every((p) => /incomplete|parked/.test(p));
    if (!resumable) {
      console.error(`\nselftest-campaign: FAILED — ${problems.length} problem(s):`);
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    log(`incomplete but resumable — continuing: ${problems.join('; ')}`);
    text = nextText();
  }
  console.error(`\nselftest-campaign: FAILED — ${MAX_CYCLES} cycles exhausted.`);
  process.exit(1);
} catch (e) {
  console.error(`\nselftest-campaign: ERROR — ${e?.message || e}`);
  process.exit(1);
}
