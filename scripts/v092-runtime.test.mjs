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
const previewIsolation = await import(ROOT + '/src/lib/preview-isolation.ts');
const goConsole = await import(ROOT + '/src/lib/go-console.ts');
const burn = await import(ROOT + '/src/lib/burn-policy.ts');

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
  assert.match(send, /startMarkPlan/);
  assert.match(send, /queued: true/);
  assert.match(send, /target/);
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

ok('PF1: loopback preview URLs move to the isolated 127.0.0.2 site', () => {
  assert.equal(previewIsolation.iframePreviewUrl('http://127.0.0.1:3038/onboarding?x=1'), 'http://127.0.0.2:3038/onboarding?x=1');
  assert.equal(previewIsolation.iframePreviewUrl('http://localhost:3038/'), 'http://127.0.0.2:3038/');
  assert.equal(previewIsolation.iframePreviewUrl('https://example.com/a'), 'https://example.com/a');
});

ok('PF2: the shell isolates the preview and boots progressively', () => {
  const main = src('electron/main.ts');
  const live = src('src/components/olympus/live-preview.tsx');
  const win = src('src/app/preview-window/page.tsx');
  const projectPreview = src('src/app/api/olympus/projects/preview/route.ts');
  const liveRoute = src('src/app/api/olympus/live-preview/route.ts');
  const page = src('src/app/page.tsx');
  assert.match(main, /appendSwitch\('site-per-process'\)/);
  assert.match(live, /isolatedUrl/);
  assert.match(live, /iframeSrc/);
  assert.match(win, /state\?\.isolatedUrl/);
  assert.match(projectPreview, /isolatedPreviewUrl/);
  assert.match(liveRoute, /isolatedPreviewUrl/);
  assert.match(page, /const critical = \[\s*'\/api\/olympus\/health',\s*'\/api\/olympus\/run-state',\s*'\/api\/olympus\/projects',\s*\]/);
  assert.match(page, /const ready = windowLoaded && dataReady/);
  assert.doesNotMatch(page, /const ready = windowLoaded && pendingPanels === 0/);
});

ok('PF3: Firefox keeps the AIME session; Electron alone gets the OOPIF origin', () => {
  const isolation = src('src/lib/preview-isolation.ts');
  const live = src('src/components/olympus/live-preview.tsx');
  const win = src('src/app/preview-window/page.tsx');
  assert.match(isolation, /export function inElectron/);
  assert.match(live, /inElectron\(\)/);
  assert.match(win, /inElectron\(\) /);
});

ok('MK1: Apollo is a durable background plan, not a 300s synchronous turn', () => {
  const send = src('src/app/api/olympus/marks/send/route.ts');
  const run = src('src/lib/marks-run.ts');
  const plan = src('src/lib/marks-plan.ts');
  assert.match(send, /queued: true/);
  assert.match(send, /startMarkPlan/);
  assert.doesNotMatch(send, /await runGodTurn/);
  assert.match(run, /1_200_000/);
  assert.match(run, /previewHealthNote/);
  assert.match(plan, /MARK_TURN_TIMEOUT_MS/);
  assert.match(plan, /MARK_BOOT_ID/);
  assert.ok(fs.existsSync(path.join(ROOT, 'src/app/api/olympus/marks/plan/route.ts')));
  assert.ok(fs.existsSync(path.join(ROOT, 'src/app/api/olympus/marks/latest/route.ts')));
  assert.ok(fs.existsSync(path.join(ROOT, 'src/app/api/olympus/marks/retry/route.ts')));
  const win = src('src/app/preview-window/page.tsx');
  assert.match(win, /pollPlan/);
  assert.match(win, /retryPlan/);
  assert.match(win, /marks\/latest/);
});

ok('HB3: hibernation stops idle dev servers and prunes the expired window', () => {
  const hibernate = src('src/app/api/olympus/chat/hibernate/route.ts');
  const manager = src('src/lib/dev-server-manager.ts');
  const hib = src('src/lib/hibernation.ts');
  const live = src('src/components/olympus/live-preview.tsx');
  assert.match(hibernate, /list\(\)/);
  assert.match(hibernate, /stop\(server\.slug\)/);
  assert.match(hibernate, /pruneHibernationPlan/);
  assert.match(manager, /rssMB/);
  assert.match(manager, /no probe evidence/);
  assert.match(manager, /security nudge/);
  assert.match(manager, /readPidRssMB/);
  assert.match(hib, /pruneHibernationPlan/);
  assert.match(live, /sendToApollo/);
  assert.match(live, /restart/);
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

ok('PN1: OpenCode 2.3.2 is pinned and the patch-notes surface is wired', () => {
  const pkg = JSON.parse(src('package.json'));
  assert.equal(pkg.dependencies['@opencode/cli'], '2.3.2');
  assert.equal(pkg.dependencies['@opencode/plugin'], '2.3.2');
  const notes = JSON.parse(src('public/patch-notes.json'));
  assert.equal(notes.current, '0.0.96');
  assert.equal(notes.opencode.tested, '2.3.2');
  assert.match(notes.opencode.gateCommand, /opencode:gate/);
  const component = src('src/components/olympus/patch-notes.tsx');
  assert.match(component, /opencode-update/);
  assert.match(component, /olympus:open-patch-notes/);
  assert.match(component, /patch-notes\.json/);
  assert.match(component, /PatchNotesTeaser/);
  assert.ok(fs.existsSync(path.join(ROOT, 'src/app/patch-notes/page.tsx')));
  assert.match(src('src/components/olympus/olympus-loader.tsx'), /PatchNotesTeaser/);
  assert.match(src('src/components/olympus/status-bar.tsx'), /olympus:open-patch-notes/);
  assert.match(src('src/app/page.tsx'), /PatchNotesOverlay/);
});

ok('PN2: the GO account anchor and the Monday weekly reset are exact', () => {
  assert.equal(goConsole.nextWeeklyReset(Date.parse('2026-11-20T17:26:00Z')), '2026-11-23T00:00:00.000Z');
  assert.equal(goConsole.parsePct('25,5%'), 25.5);
  const anchor = goConsole.normalizeAnchor({
    plan: 'go-plus', monthlyPct: 25, h5Pct: 3, weeklyPct: 8,
    resetAt: '2026-12-05T18:15:00Z', capUsd: 220,
    localSpendMonthUsd: 55, localSpend5hUsd: 1.5, localSpend7dUsd: 8,
    capturedAt: '2026-11-20T17:00:00Z', source: 'manual',
  });
  assert.ok(anchor);
  const w = goConsole.accountWindows({
    anchor,
    spendMonthUsd: 66, spend5hUsd: 2.5, spend7dUsd: 12,
    now: Date.parse('2026-11-20T18:00:00Z'),
  });
  assert.ok(Math.abs(w.monthlyPct - 30) < 1e-9, String(w.monthlyPct));
  assert.ok(Math.abs(w.h5Pct - 5.272727272727273) < 1e-9, String(w.h5Pct));
  assert.ok(w.source === 'console' && w.capUsd === 220);
});

ok('PN3: the burn policy upgrades a behind-pace month and respects model ceilings', () => {
  const decision = burn.chooseBurnRoster({
    policy: { mode: 'burn', targetPct: 95, modelCeilingPct: 85 },
    accountPct: 25, dailyPct: 1.7, daysLeft: 15, h5Pct: 3, weeklyPct: 8,
    models: [{ model: 'kimi-k3', pctMonth: 2, limitUsd: null }],
    enabledModels: [],
  });
  assert.equal(decision.blocked, null);
  assert.equal(decision.step, 1);
  assert.equal(decision.roster.apollo, 'opencode-go/kimi-k3');
  const capped = burn.chooseBurnRoster({
    policy: { mode: 'burn', targetPct: 95, modelCeilingPct: 85 },
    accountPct: 25, dailyPct: 1.7, daysLeft: 15, h5Pct: 3, weeklyPct: 8,
    models: [{ model: 'kimi-k3', pctMonth: 90, limitUsd: 60 }],
    enabledModels: [],
  });
  assert.notEqual(capped.roster.apollo, 'opencode-go/kimi-k3');
  assert.equal(burn.chooseBurnRoster({
    policy: { mode: 'off', targetPct: 95, modelCeilingPct: 85 },
    accountPct: 25, dailyPct: 1.7, daysLeft: 15, h5Pct: 3, weeklyPct: 8, models: [],
  }).blocked, 'off');
});

ok('PN4: hibernate v2 gates active turns, keeps a live preview, and restores idle ones', () => {
  const route = src('src/app/api/olympus/chat/hibernate/route.ts');
  assert.match(route, /waitForActiveRuns/);
  assert.match(route, /keepPreview/);
  assert.match(route, /hibernation-devservers\.json/);
  const main = src('electron/main.ts');
  assert.match(main, /readCloseToHibernate/);
  assert.match(main, /restoreHibernatedDevServers/);
  assert.match(main, /if \(hibernating\) return;\n    app\.quit\(\);/);
  assert.match(main, /postJson\('\/api\/olympus\/chat\/hibernate', \{ waitMs: 60_000, forceFree \}, 70_000\)/);
  const prefs = JSON.parse(src('package.json'));
  assert.ok(prefs.version.startsWith('0.0.96'));
});

console.log(`\nv092-runtime: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
