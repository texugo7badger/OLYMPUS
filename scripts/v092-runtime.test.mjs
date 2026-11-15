#!/usr/bin/env node
/**
 * v092-runtime.test.mjs — v0.0.92: the autonomy contract.
 *
 * Pins the four defects that kept AIME at 0/21, plus the phone queue and
 * hibernation expiry:
 *   1. the hop prompt now carries the exact deterministic checks (`## Result`);
 *   2. preflight marks artifact-complete hops done without re-running them;
 *   3. auth/no-route lanes stay blocked until an explicit probe;
 *   4. recovery/quarantine budgets are scoped per campaign, not lifetime;
 *   5. an expired hibernation plan is not a plan;
 *   6. a stale `sending` phone claim is requeued.
 *
 * Run: npx tsx scripts/v092-runtime.test.mjs
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-v092-'));
process.env.OLYMPUS_HOME = HOME;

let passed = 0;
function ok(name, fn) {
  try { fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const marks = await import(ROOT + '/src/lib/marks-store.ts');
const format = await import(ROOT + '/src/lib/marks-format.ts');
const laneHealth = await import(ROOT + '/src/lib/lane-health.ts');
const hibernation = await import(ROOT + '/src/lib/hibernation.ts');
const recovery = await import(ROOT + '/src/lib/hop-runtime/recovery.ts');
const queue = await import(ROOT + '/src/lib/prompt-queue.ts');
const drain = await import(ROOT + '/src/lib/prompt-queue-drain.ts');
const design = await import(ROOT + '/src/lib/design-skin.ts');
const walk = await import(ROOT + '/src/lib/hop-runtime/walker.ts');

ok('M1: a mark queue survives on disk and round-trips', () => {
  marks.writeMarks('aime', [{ x: 10, y: 20, page: '/onboarding', instruction: 'tighten the first gesture', viewport: { width: 1440, height: 900 } }]);
  marks.addMark('aime', { x: 30, y: 40, page: '/auth', instruction: 'make the login card quieter' });
  const list = marks.readMarks('aime');
  assert.equal(list.length, 2);
  assert.equal(list[0].page, '/onboarding');
  assert.equal(list[1].instruction, 'make the login card quieter');
  assert.ok(list.every((m) => m.id && m.createdAt));
});

ok('M2: the copy block and the Apollo prompt carry every mark', () => {
  const list = marks.readMarks('aime');
  const md = format.marksMarkdown('aime', list, 'http://127.0.0.1:3038/');
  assert.match(md, /tighten the first gesture/);
  assert.match(md, /make the login card quieter/);
  const prompt = format.marksPrompt('aime', list, 'http://127.0.0.1:3038/', 'apollo');
  assert.match(prompt, /Approve to send to Atlas/);
  assert.match(prompt, /ONE batch/);
});

ok('M3: remove and clear are durable', () => {
  const list = marks.readMarks('aime');
  marks.removeMark('aime', list[0].id);
  assert.equal(marks.readMarks('aime').length, 1);
  marks.clearMarks('aime');
  assert.equal(marks.readMarks('aime').length, 0);
});

ok('M4: the routes expose the durable queue and the Apollo send', () => {
  const route = src('src/app/api/olympus/marks/route.ts');
  const send = src('src/app/api/olympus/marks/send/route.ts');
  assert.match(route, /writeMarks/);
  assert.match(route, /requireAuth/);
  assert.match(send, /runGodTurn/);
  assert.match(send, /marksPrompt/);
  assert.match(send, /target === 'athena'/);
});

ok('H1: the hop prompt carries the exact checks and the ## Result law', () => {
  const walker = src('src/lib/hop-runtime/walker.ts');
  assert.match(walker, /\[HOP VERIFY — the spine runs these deterministically/);
  assert.match(walker, /file-contains/);
  assert.match(walker, /`## Result`/);
});

ok('H2: preflight verifies file gates before re-running the plan', () => {
  const walker = src('src/lib/hop-runtime/walker.ts');
  assert.match(walker, /preflight verified/);
  assert.match(walker, /verifyHopDeterministic\(h, laneRoot\)\.ok/);
});

ok('H3: the systemic breaker no longer stops the whole campaign', () => {
  const walker = src('src/lib/hop-runtime/walker.ts');
  const block = walker.slice(walker.indexOf('attempts >= 4 && parks'), walker.indexOf('attempts >= 4 && parks') + 700);
  assert.doesNotMatch(block, /stopped = true/);
  assert.match(block, /independent hops continue/);
});

ok('H4: quarantine is scoped to the generation', () => {
  const walker = src('src/lib/hop-runtime/walker.ts');
  assert.match(walker, /sameGeneration/);
  assert.match(walker, /opts\.keepQuarantine && sameGeneration/);
});

ok('L1: auth/no-route lanes do not expire on their own', () => {
  const now = Date.now();
  const entries = {
    qwen: { status: 'auth', at: now - 2 * 3_600_000, retryUntil: now - 3_600_000 },
    dead: { status: 'no-route', at: now - 2 * 3_600_000 },
    deep: { status: 'alive', at: now },
  };
  assert.equal(laneHealth.isLaneAvailable('qwen', entries, now), false);
  assert.equal(laneHealth.isLaneAvailable('dead', entries, now), false);
  assert.equal(laneHealth.isLaneAvailable('deep', entries, now), true);
  const chain = laneHealth.laneChain('qwen', ['deep', 'hy3'], entries, now);
  assert.deepEqual(chain, ['deep', 'hy3']);
});

ok('L2: the lane guard is honest in the walker and god-run', () => {
  assert.match(src('src/lib/hop-runtime/walker.ts'), /isLaneAvailable\(lane\)/);
  assert.match(src('src/lib/god-run.ts'), /GO_FALLBACK_MODEL/);
});

ok('R1: legacy recovery rows do not exhaust a new campaign', () => {
  const lane = path.join(HOME, 'lane-aime');
  fs.mkdirSync(lane, { recursive: true });
  fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({ generation: 22, campaignId: 'cmp_new', completed: [] }) + '\n');
  const legacy = Array.from({ length: 6 }, (_, i) => JSON.stringify({ ts: new Date(Date.now() - 7 * 86400_000).toISOString(), hopId: `old-${i}`, action: 'retry' })).join('\n') + '\n';
  fs.writeFileSync(path.join(lane, '.olympus-recovery.jsonl'), legacy);
  assert.equal(recovery.campaignKey(lane), 'cmp_new');
  const decision = recovery.decideRecovery(lane, {
    ts: new Date().toISOString(), hopId: 'onboarding', god: 'athena', status: 'parked',
    reason: 'dispatch-failed:tool-budget', errorClass: 'tool-budget', failureClass: 'tool-budget',
    lane: 'opencode-go/qwen3.7-plus', nextLane: 'opencode-go/deepseek-v4.1-flash',
    artifactsPresent: [], artifactsMissing: [], verdict: 'REPLAN', recommendation: 'narrow', evidence: 'tool budget',
  });
  assert.equal(decision.action, 'retry');
  assert.equal(decision.kind, 'retry-budget');
});

ok('R2: the current campaign still has a hard 6/6 budget', () => {
  const lane = path.join(HOME, 'lane-budget');
  fs.mkdirSync(lane, { recursive: true });
  fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({ generation: 22, campaignId: 'cmp_budget', completed: [] }) + '\n');
  const rows = Array.from({ length: 6 }, (_, i) => JSON.stringify({ ts: new Date().toISOString(), campaignId: 'cmp_budget', hopId: `h-${i}`, action: 'retry' })).join('\n') + '\n';
  fs.writeFileSync(path.join(lane, '.olympus-recovery.jsonl'), rows);
  const decision = recovery.decideRecovery(lane, {
    ts: new Date().toISOString(), hopId: 'onboarding', god: 'athena', status: 'parked',
    reason: 'dispatch-failed:tool-budget', errorClass: 'tool-budget', failureClass: 'tool-budget',
    lane: 'opencode-go/deepseek-v4.1-flash', nextLane: null,
    artifactsPresent: [], artifactsMissing: [], verdict: 'REPLAN', recommendation: 'narrow', evidence: 'tool budget',
  });
  assert.equal(decision.action, 'stop');
  assert.match(decision.message, /6\/6/);
});

ok('HIB1: an expired hibernation plan is not a plan', () => {
  const home = path.join(HOME, 'hib');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(hibernation.hibernationPlanPath(home), JSON.stringify({ active: true, hours: 4, until: new Date(Date.now() - 60_000).toISOString(), autoResume: true, createdAt: new Date().toISOString() }));
  assert.equal(hibernation.readHibernationPlan(home), null);
  const future = hibernation.writeHibernationPlan({ hours: 2, autoResume: true, home });
  assert.ok(future.until);
  assert.ok(hibernation.readHibernationPlan(home));
});

ok('HIB2: the walker treats the window as a ceiling, not a floor', () => {
  const walker = src('src/lib/hop-runtime/walker.ts');
  assert.match(walker, /Math\.min\(24 \* 3600_000, hibLeft\)/);
  assert.match(walker, /isHibernating\(\) \? 0/);
  assert.match(walker, /!opts\.unattended && !isHibernating\(\) && userIsActive\(\)/);
});

ok('Q1: a stale phone claim is requeued', () => {
  const now = Date.now();
  const item = queue.enqueuePrompt('aime', 'retome o walk', now, { source: 'phone', priority: 'high' });
  assert.ok(item?.id);
  queue.markQueueItem(item.id, 'sending', now - 15 * 60_000);
  assert.equal(queue.listQueue().find((i) => i.id === item.id)?.status, 'sending');
  const recovered = drain.reconcileStalePhoneClaims(now);
  assert.ok(recovered.includes(item.id));
  assert.equal(queue.listQueue().find((i) => i.id === item.id)?.status, 'queued');
});

ok('Q2: the server drain is not gated by hibernation and the phone gets 30 min', () => {
  const drainSrc = src('src/lib/prompt-queue-drain.ts');
  assert.doesNotMatch(drainSrc, /if \(!isHibernating\(\)\)/);
  assert.match(drainSrc, /DISPATCH_TIMEOUT_MS = 30 \* 60_000/);
  assert.match(src('src/app/m/page.tsx'), /30 \* 60_000/);
  assert.match(src('src/app/m/studio/page.tsx'), /30 \* 60_000/);
});

ok('S1: a parked hop outranks a live supervisor in the status', () => {
  const context = src('src/lib/campaign-context.ts');
  const runState = src('src/app/api/olympus/run-state/route.ts');
  assert.match(context, /inFlightCount/);
  assert.match(context, /state\?\.parked\s*\n\s*\? 'PARKED'/);
  assert.match(runState, /hopState\?\.inFlight\?\.length \?\? 0/);
  assert.match(runState, /'parked'/);
});

ok('D1: the Athena skin follows the project contract, not a fixed purple', () => {
  const skin = design.skinFromContract({
    tokens: {
      palette: 'night bed #06071A / surface #0C0E28 / elevated #131534; ONE accent #2B4BD8 with the legibility step #6E82F0; rarity tints bronze #B0793F',
      radius: '0 / 2 / 4',
      density: 'comfortable but compact',
      type: '"Inter", sans-serif',
    },
  });
  assert.equal(skin.source, 'contract');
  assert.equal(skin.accent.toLowerCase(), '#2b4bd8');
  assert.equal(skin.surface.toLowerCase(), '#06071a');
  assert.equal(skin.radius, 4);
  assert.match(skin.font || '', /Inter/);
  const neutral = design.skinFromContract({ tokens: {} });
  assert.equal(neutral.source, 'fallback');
});

ok('T1: the tunnel is supervised when the user asked for it', () => {
  const tunnel = src('src/lib/mobile-tunnel.ts');
  assert.match(tunnel, /ensureTunnel/);
  assert.match(tunnel, /desired: true/);
  assert.match(src('src/app/api/olympus/mobile/tunnel/route.ts'), /ensureTunnel/);
});

async function okAsync(name, fn) {
  try { await fn(); console.log('PASS ', name); passed++; }
  catch (e) { console.log('FAIL ', name, '—', e?.message || e); process.exitCode = 1; }
}

await okAsync('P1: a preflight-completed hop cannot leave a phantom park', async () => {
  const lane = fs.mkdtempSync(path.join(HOME, 'lane-preflight-'));
  const plan = {
    version: 1,
    laneRoot: lane,
    hops: [
      { id: 'a', god: 'apollo', prompt: 'a', artifacts: ['a.md'], verify: { review: 'deterministic', checks: ['file-exists:a.md', 'file-contains:a.md::## Result'] } },
      { id: 'b', god: 'apollo', prompt: 'b', artifacts: ['b.md'], after: ['a'], verify: { review: 'deterministic', checks: ['file-exists:b.md', 'file-contains:b.md::## Result'] } },
    ],
  };
  fs.writeFileSync(path.join(lane, 'a.md'), '# a\n\n## Result\n\nAlready complete.\n');
  fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({
    version: 1, generation: 1, completed: [], quarantined: ['a'], inFlight: [],
    parked: { hopId: 'a', reason: 'old-park', ts: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  }) + '\n');
  const dispatcher = async (hop) => {
    fs.writeFileSync(path.join(lane, `${hop.id}.md`), `# ${hop.id}\n\n## Result\n\nFixture complete.\n`);
    return { ok: true, exitCode: 0, output: 'ok', tokensIn: 1, tokensOut: 1, retriesAbsorbed: 0, exhausted: false };
  };
  const result = await walk.walkPlan({ plan, dispatcher, stateDir: lane, resume: true });
  assert.ok(result.completed.includes('a') && result.completed.includes('b'), JSON.stringify(result));
  assert.equal(result.parked, null);
  const state = JSON.parse(fs.readFileSync(path.join(lane, '.olympus-hop-state.json'), 'utf8'));
  assert.equal(state.parked, null);
  assert.ok(!state.quarantined.includes('a'));
});

console.log(`\nv092-runtime: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
