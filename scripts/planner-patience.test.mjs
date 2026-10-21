#!/usr/bin/env node
/**
 * planner-patience.test.mjs — the 2026-10-16 peak-hour specimen, asserted
 * as code. Run: npx tsx scripts/planner-patience.test.mjs
 *
 * THE SPECIMEN (the 16:31 Lumina re-test): Apollo's planning turn rode the
 * CORRECT lane (nvidia-glm/z-ai/glm-5.3 — the #LANE-DRIFT cure held) and
 * still died, in three stacked layers:
 *
 *   1. REASONING STARVATION — glm-5.3 is a reasoner; reasoning tokens +
 *      output tokens SHARE the 16384 mouth. The DB: input=1305,
 *      reasoning=16384 (CAP), output=0 — 20.6 minutes of thinking (67K
 *      chars), ZERO plan emitted. The turn "finished" having produced
 *      nothing.
 *   2. PEAK CRAWL — the free pool at 16:31 served ~13 tok/s with
 *      multi-minute stalls; the SSE watch idle-broke at ~300s.
 *   3. THE PILEUP — the transport retry RE-POSTED the prompt onto a
 *      session whose turn was still running server-side. The DB showed
 *      FOUR queued planning prompts; the app gave up at 15:00 while the
 *      model kept working until 15:52 (and still hit the reasoning cap).
 *
 * THE CURES (this suite's law):
 *   1. Apollo plans with reasoning_effort=low (NVIDIA-probe-verified: the
 *      EXACT killer prompt went from 20+min/cap/output=0 to 171s with the
 *      full 7,333-char dispatch-plan emitted — reasoning collapsed from
 *      67,438 chars to 89).
 *   2. The watch-resume: a transport retry on a WARM server with a live
 *      in-flight turn RESUMES THE WATCH — never re-posts, never piles.
 *   3. The 16384 mouth stays (the #76 doctrine) — with reasoning low the
 *      plan (measured 7.3K chars ≈ 2K tokens) fits with room to spare.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let failures = 0;
let checked = 0;
function check(name, ok, detail = '') {
  checked++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -- ${detail}`}`);
  if (!ok) failures++;
}

const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

// ── 1. THE PLANNER LANE: apollo rides reasoning_effort=low ───────────────────
{
  const cfg = JSON.parse(read('opencode.json'));
  const apollo = cfg?.agent?.apollo || {};
  check('opencode.json: agent.apollo carries reasoning_effort: "low" (belt — a future opencode that honors agent config gets it pre-wired)',
    apollo.reasoning_effort === 'low',
    `reasoning_effort=${JSON.stringify(apollo.reasoning_effort)} — a planning turn on a reasoner without it starves the 16384 mouth (the 20-min/67K-chars/output=0 specimen)`);
  check('opencode.json: apollo still rides a GLM reasoner (the planner stays sacred — the lane rotates, the GLM family does not)',
    /glm-5\.3/.test(String(apollo.model || '')),
    `apollo model=${apollo.model} — the planner must ride the GLM family on every strategy`);
  check('opencode.json: ONLY apollo carries the low effort (the other gods keep full reasoning)',
    Object.entries(cfg.agent || {})
      .filter(([id, a]) => id !== 'apollo' && a && typeof a === 'object' && a.reasoning_effort === 'low')
      .length === 0,
    'other agents were silenced — out of scope');
}

// ── 1b. THE WIRE: opencode 1.18.10 drops agent config reasoning_effort for
// openai-compatible providers (intercept-proven: the request carries only
// model/max_tokens/tool_choice/stream). The chat.params PLUGIN is the only
// injection point that reaches the HTTP body.
{
  const pluginSrc = read('.opencode/plugins/apollo-reasoning.mjs');
  check('plugin: apollo-reasoning.mjs exists and registers the chat.params hook',
    /"chat\.params":\s*async/.test(pluginSrc),
    'the chat.params hook is gone — the wire path is dead');
  check('plugin: the hook covers EVERY free NVIDIA lane (the 05:08 specimen — step-5 hop gods starved the mouth on reasoning) and NEVER the GO/Zen lanes',
    /if \(!providerID\.startsWith\("nvidia-"\)\) return;/.test(pluginSrc)
      && /output\.options\.reasoning_effort = "low";/.test(pluginSrc),
    'the scope regressed — a reasoning lane without low effort starves the 16384 mouth (zero tool calls, zero files)');
  check('plugin: the hook injects reasoning_effort "low" into the request params',
    /output\.reasoning_effort = "low";/.test(pluginSrc),
    'the injection line is gone');
  const cfg = JSON.parse(read('opencode.json'));
  check('opencode.json: the plugin array CARRIES apollo-reasoning.mjs (unlisted plugins never load)',
    (cfg.plugin || []).includes('./.opencode/plugins/apollo-reasoning.mjs'),
    `plugin array: ${JSON.stringify(cfg.plugin)}`);
  const applySrc = read('scripts/apply-strategy.js');
  check('apply-strategy.js: the FREE plugin preset carries apollo-reasoning.mjs (an apply must not strip the fix)',
    /plugins: \[[\s\S]*?'\.\/\.opencode\/plugins\/apollo-reasoning\.mjs'[\s\S]*?olympus-router/.test(applySrc),
    'the free preset dropped the plugin — the next apply kills the fix');
}

// ── 2. THE APPLY PRESERVES IT (a re-apply must not drop the cure) ────────────
{
  const applySrc = read('scripts/apply-strategy.js');
  // The god-agent mutation surfaces only touch model + prompt — never a
  // wholesale rebuild. The demigod branch creates entries wholesale (fine —
  // demigods never ride reasoning_effort).
  const godRebuilds = (applySrc.match(/config\.agent\[godId\]\s*=\s*\{/g) || []).length;
  check('apply-strategy.js: the god loops never rebuild agent entries wholesale (model+prompt only — the cure survives every apply)',
    godRebuilds === 0,
    `${godRebuilds} wholesale god rebuild(s) — an apply would drop reasoning_effort`);
}

// ── 3. THE PILEUP CURE: transport retries resume the watch ──────────────────
{
  const src = read('src/lib/opencode-session.ts');
  check('opencode-session.ts: isTurnAliveServerSide exists (the alive-check)',
    /async function isTurnAliveServerSide/.test(src),
    'the alive-check is gone — blind re-posts return');
  check('opencode-session.ts: pollInFlightTurn exists (the watch-resume completion poll)',
    /async function pollInFlightTurn/.test(src),
    'the completion poll is gone');
  check('opencode-session.ts: the transport branch gates the resume on WARM + alive (a cold respawn re-posts — the turn died with the old process)',
    /const turnAlive = srv\.warm === true\s*\? await isTurnAliveServerSide\(srv, opts\.sessionId\)\s*: \{ alive: false as const \};[\s\S]{0,300}?watchResume = turnAlive\.alive/.test(src),
    'the warm+alive gate is gone — dead-turn resumes or blind re-posts return');
  check('opencode-session.ts: the resume SEEDS the liveness truth (a running child survives the resumed watch)',
    /\.\.\.\(watchResume \? \{[\s\S]{0,120}?childPending: watchResume\.childRunning[\s\S]{0,80}?permissionPending: watchResume\.permissionPending/.test(src),
    'the resume seed is gone — a silently-working child gets nudged again (the 00:55 specimen)');
  check('opencode-session.ts: the attempt takes the watchResume seed (the no-re-post path exists)',
    /watchResume: \{ childRunning: boolean; permissionPending: boolean \} \| false = false,\n\): Promise<WarmRunResult>/.test(src),
    'the attempt lost the watchResume parameter');
  check('opencode-session.ts: the watch path NEVER posts a message body',
    /if \(watchResume\) \{[\s\S]*?pollInFlightTurn[\s\S]*?\} else \{[\s\S]*?\/session\/\$\{opts\.sessionId\}\/message/.test(src),
    'the watch path re-posts — the pileup is back');
  check('opencode-session.ts: the retry loop resets watchResume per attempt (a non-transport class re-posts)',
    /const result = await runWarmMessageAttempt\(srv, opts, attempt === 0, watchResume\);\n      watchResume = false;/.test(src),
    'the per-attempt reset is gone — a stale resume flag leaks across classes');
}

// ── 4. THE MOUTH — the #MOUTH-REVISION (authorized 2026-10-17, the two
// cap-starvation specimens: the planner's 20-min reasoning death + the
// fixtures hop's single ~16K-token file dying mid-write, finish=length,
// zero artifacts). The reasoning lanes double (32768 — probe-accepted by
// BOTH glm-5.3 and step-5); the volume lanes KEEP the #76 bar (16384).
{
  const pantheonSrc = read('scripts/free-pantheon.test.mjs');
  const cfg = JSON.parse(read('opencode.json'));
  const glmOut = cfg?.provider?.['nvidia-glm']?.models?.['z-ai/glm-5.3']?.limit?.output;
  const stepOut = cfg?.provider?.['nvidia-step']?.models?.['stepfun-ai/step-5-preview']?.limit?.output;
  const gemmaOut = cfg?.provider?.['nvidia-google']?.models?.['google/gemma-4-31b-it']?.limit?.output;
  check('the MOUTH revision: reasoning lanes 32768, volume lanes keep the #76 bar 16384',
    /const REASONING_OUTPUT = 32768;/.test(pantheonSrc)
      && /const VOLUME_OUTPUT = 16384;/.test(pantheonSrc)
      && glmOut === 32768
      && (stepOut === 32768 || stepOut === undefined)
      && gemmaOut === 16384,
    `glm=${glmOut} step=${stepOut} gemma=${gemmaOut} — an unauthorized bar move (the nvidia-step lane may be ABSENT: #129 retired it — step-5-preview died from the catalogue; an absent lane is the honest state, a present one must keep the reasoning bar)`);
}

// ── 5. THE 22:27-22:41 SPECIMEN CHAIN: walk durability + execution law ─────
{
  const sessionSrc = read('src/lib/opencode-session.ts');
  const walkerSrc = read('src/lib/hop-runtime/walker.ts');

  // (a) THE EXECUTION LAW rides the strategy block — EVERY turn sees it
  // (the 22:33 specimen: a planning=NO turn never saw the [OLYMPUS-PLANNER]
  // contract and hand-dispatched Atlas via the task tool).
  check('law: the strategy block carries the EXECUTION LAW with NO god named as a legal task target (the 00:49 Athena loophole)',
    /EXECUTION LAW: if the active project lane carries a dispatch-plan\.json/.test(sessionSrc)
      && /NEVER dispatch ANY hop of the plan to ANY god via the task tool \(not Atlas, not Athena, not Hephaestus — NOBODY/.test(sessionSrc),
    'the execution law regressed — a god named as a legal target reopens the hand-dispatch loophole');

  // (b) THE CHILD-LIVENESS: a RUNNING tool is live work; the nudge never
  // aborts a parent blocked on a child (the 22:34 specimen: two nudges
  // re-posted around a working Atlas subagent).
  check('law: the watchdog carries childPending (a running tool is live work)',
    /childPending = st === 'running'/.test(sessionSrc)
      && /decision === 'child-running'/.test(sessionSrc)
      && /childPending: state\.childPending/.test(sessionSrc),
    'the nudge still kills parents blocked on live children');

  // (c) THE WALK STATE PERSISTS FROM SECOND ZERO (the 22:27 specimen: the
  // app restart killed the walk mid-hop-1 leaving NO state — the campaign
  // was stranded with a plan and zero resume surface).
  check('law: the walker persists the INITIAL hop-state BEFORE the first dispatch (a restart never strands the campaign)',
    /#RESTART-SPECIMEN[\s\S]*?saveHopState\(stateDir, \{\n    version: 1,\n    completed: \[\.\.\.completed\],\n    parked: null,/.test(walkerSrc),
    'the initial hop-state save is gone — a killed walk leaves no resume surface');

  // (d) THE FIRST-BYTE DEADLINE: a mute hop is a stalled pool, not a slow
  // hop (the 22:27 specimen: step-5 froze at hop-1 with zero output and
  // would have ridden the full 25-minute ceiling in silence).
  check('law: the hop dispatcher carries the first-byte deadline (a mute hop dies fast, named, retried)',
    /HOP_FIRST_BYTE_MARKER = 'hop-first-byte-timeout'/.test(walkerSrc)
      && /firstByteTimer/.test(walkerSrc)
      && /errHead\.includes\(HOP_FIRST_BYTE_MARKER\)/.test(walkerSrc)
      && /kind: 'provider-overload', error: errHead \}/.test(walkerSrc.replace(/\s/g, '')) || /if \(errHead\.includes\(HOP_FIRST_BYTE_MARKER\)\) \{[\s\S]*?provider-overload/.test(walkerSrc),
    'a stalled hop still waits the full ceiling in silence');

  // (e) THE PATH ROUTES (the 22:32 specimen: the path became a project NAME).
  const intentSrc = read('src/lib/project-intent.ts');
  check('law: a quoted project path routes to the project, never creates a path-named one',
    /extractProjectPathCandidate/.test(intentSrc)
      && /the prompt names the project's path/.test(intentSrc),
    'paths still become garbage project names');
  // (f) THE WALK BUDGET (the 00:00:48 specimen): the route-level turn timer
  // stayed armed through the walk phase and killed hops fixtures/ui-kit
  // mid-flight at exactly request-start + 15 min. The turn's timer must
  // retire when the walk begins — the walk bounds itself per-hop.
  const routeSrc = read('src/app/api/olympus/action/route.ts');
  const walkBudgetIdx = routeSrc.indexOf('#WALK-BUDGET');
  const walkCallIdx = routeSrc.indexOf('await maybeWalkThePlan', walkBudgetIdx);
  check('law: the route retires the TURN timers before the walk phase (the walk bounds itself per-hop)',
    walkBudgetIdx >= 0
      && walkCallIdx > walkBudgetIdx
      && walkCallIdx - walkBudgetIdx < 1000
      && routeSrc.slice(walkBudgetIdx, walkCallIdx).includes('clearTimeout(maxRuntimeTimer)')
      && routeSrc.slice(walkBudgetIdx, walkCallIdx).includes('clearTimeout(startupTimer)'),
    'the turn budget still bounds the walk — long campaigns die at 15 min mid-hop');
}

// ── 6. #SACRED-RUNTIME (the 10:16 specimen): a build-fix god deleted the
// walk's own machinery mid-campaign (rm opencode.json dispatch-plan.json
// .olympus-* .opencode…) — the next hop died "Model not found". The guard
// rides every hop prompt; the lane self-heals before every dispatch; the
// planner template forbids cleanup instructions in hop prompts.
{
  const walkerSrc2 = read('src/lib/hop-runtime/walker.ts');
  check('law: every hop prompt carries the RUNTIME FILES ARE SACRED guard',
    /RUNTIME FILES ARE SACRED: NEVER delete, move, or rewrite \.opencode/.test(walkerSrc2),
    'a god can clean the machinery again — the 10:16 class returns');
  check('law: the lane SELF-HEALS before every hop dispatch (ensureLaneConfig in launch)',
    /#SACRED-RUNTIME: self-healing lane[\s\S]{0,400}?ensureLaneConfig\(laneRoot\)/.test(walkerSrc2),
    'a deleted config still kills the next hop');
  const routeSrc2 = read('src/app/api/olympus/action/route.ts');
  check('law: the planner contract forbids cleanup instructions in hop prompts',
    /hop prompts must NEVER instruct deletion or cleanup of the lane's runtime files/.test(routeSrc2),
    'the planner can write the assassination into a hop prompt again');
}

console.log('');
if (failures > 0) {
  console.error(`planner-patience: ${failures} violation(s) — the peak-hour planning cure is NOT in effect`);
  process.exit(1);
}
console.log(`planner-patience: all ${checked} assertions passed (the planner reasons low, the watch resumes, the mouth stays #76)`);
