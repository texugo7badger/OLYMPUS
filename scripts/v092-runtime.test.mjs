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
const goRead = await import(ROOT + '/src/lib/go-console-read.ts');
const agentModel = await import(ROOT + '/src/lib/agent-model.ts');
const failureClass = await import(ROOT + '/src/lib/hop-runtime/failure-class.ts');
const overnight = await import(ROOT + '/src/lib/hop-runtime/overnight.ts');
const postRun = await import(ROOT + '/src/lib/hop-runtime/post-run.ts');

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
  assert.match(send, /enqueuePrompt\(/);
  assert.match(send, /queued: true/);
  assert.match(send, /target: 'apollo'/);
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

ok('R2: the campaign budget is the window (12 default), not the old 6', () => {
  const lane = path.join(HOME, 'lane-budget');
  fs.mkdirSync(lane, { recursive: true });
  fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({ generation: 22, campaignId: 'cmp_budget', completed: [] }) + '\n');
  const rows = Array.from({ length: 12 }, (_, i) => JSON.stringify({ ts: new Date().toISOString(), campaignId: 'cmp_budget', hopId: `h-${i}`, action: 'retry' })).join('\n') + '\n';
  fs.writeFileSync(path.join(lane, '.olympus-recovery.jsonl'), rows);
  const decision = recovery.decideRecovery(lane, {
    ts: new Date().toISOString(), hopId: 'onboarding', god: 'athena', status: 'parked',
    reason: 'dispatch-failed:tool-budget', errorClass: 'tool-budget', failureClass: 'tool-budget',
    lane: 'opencode-go/deepseek-v4.1-flash', nextLane: null,
    artifactsPresent: [], artifactsMissing: [], verdict: 'REPLAN', recommendation: 'narrow', evidence: 'tool budget',
  });
  assert.equal(decision.action, 'stop');
  assert.match(decision.message, /12\/12/);
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
  const surface = src('src/components/olympus/preview-surface.tsx');
  const projectPreview = src('src/app/api/olympus/projects/preview/route.ts');
  const liveRoute = src('src/app/api/olympus/live-preview/route.ts');
  const page = src('src/app/page.tsx');
  assert.match(main, /appendSwitch\('site-per-process'\)/);
  assert.match(live, /PreviewSurface/);
  assert.match(win, /PreviewSurface/);
  assert.match(surface, /createElement\('webview'/);
  assert.doesNotMatch(projectPreview, /isolatedPreviewUrl/);
  assert.doesNotMatch(liveRoute, /isolatedPreviewUrl/);
  assert.match(page, /const critical = \[\s*'\/api\/olympus\/health',\s*'\/api\/olympus\/run-state',\s*'\/api\/olympus\/projects',\s*\]/);
  assert.match(page, /const ready = windowLoaded && dataReady/);
  assert.doesNotMatch(page, /const ready = windowLoaded && pendingPanels === 0/);
});

ok('PF3: the preview keeps the REAL origin (cookies), with the webview as the renderer', () => {
  const isolation = src('src/lib/preview-isolation.ts');
  const surface = src('src/components/olympus/preview-surface.tsx');
  const live = src('src/components/olympus/live-preview.tsx');
  const win = src('src/app/preview-window/page.tsx');
  assert.match(isolation, /export function inElectron/);
  assert.match(surface, /inElectron\(\)/);
  assert.match(surface, /webview/);
  // The 127.0.0.2 alias is the login-losing origin; it must not be the
  // surface URL anymore.
  assert.doesNotMatch(live, /iframePreviewUrl/);
  assert.doesNotMatch(win, /state\?\.isolatedUrl/);
  assert.doesNotMatch(win, /iframePreviewUrl/);
});

ok('MK1: marks become ONE durable Apollo terminal queue item (no parallel plan)', () => {
  const send = src('src/app/api/olympus/marks/send/route.ts');
  const terminal = src('src/components/olympus/interactive-terminal.tsx');
  assert.match(send, /enqueuePrompt\(/);
  assert.match(send, /priority: 'high'/);
  assert.match(send, /source: 'markview'/);
  assert.doesNotMatch(send, /startMarkPlan|runGodTurn|appendGodInbox/);
  assert.match(terminal, /priority !== 'high'/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'src/app/api/olympus/marks/plan/route.ts')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'src/components/olympus/god-chat-modal.tsx')));
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
  assert.match(live, /sendQueueToApollo/);
  assert.match(live, /marks\/send/);
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

ok('PN1: OpenCode 2.4.2 is pinned and the patch-notes surface is wired', () => {
  const pkg = JSON.parse(src('package.json'));
  assert.equal(pkg.dependencies['@opencode/cli'], '2.4.2');
  assert.equal(pkg.dependencies['@opencode/plugin'], '2.4.2');
  const notes = JSON.parse(src('public/patch-notes.json'));
  assert.equal(notes.current, pkg.version);
  assert.equal(notes.opencode.tested, pkg.dependencies['@opencode/cli']);
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
  // v0.0.97 — the console's own numbers, never a local-delta adjustment.
  assert.equal(w.monthlyPct, 25);
  assert.equal(w.h5Pct, 3);
  assert.equal(w.weeklyPct, 8);
  assert.ok(w.source === 'console' && w.capUsd === 220);
});

ok('PN3: the burn policy upgrades a behind-pace month and respects model ceilings', () => {
  const decision = burn.chooseBurnRoster({
    policy: { mode: 'burn', targetPct: 95, modelCeilingPct: 85 },
    accountPct: 25, dailyPct: 1.7, daysLeft: 15, h5Pct: 3, weeklyPct: 8,
    models: [{ model: 'kimi-k2.7-code', pctMonth: 2, limitUsd: null }],
    enabledModels: [],
  });
  assert.equal(decision.blocked, null);
  assert.equal(decision.step, 1);
  assert.equal(decision.roster.apollo, 'opencode-go/kimi-k2.7-code');
  const capped = burn.chooseBurnRoster({
    policy: { mode: 'burn', targetPct: 95, modelCeilingPct: 85 },
    accountPct: 25, dailyPct: 1.7, daysLeft: 15, h5Pct: 3, weeklyPct: 8,
    models: [{ model: 'kimi-k2.7-code', pctMonth: 90, limitUsd: 60 }],
    enabledModels: [],
  });
  assert.notEqual(capped.roster.apollo, 'opencode-go/kimi-k2.7-code');
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
  assert.match(main, /if \(errorCode === -3\) return;/);
  assert.match(main, /if \(hibernating\) return;\n    app\.quit\(\);/);
  assert.match(main, /postJson\('\/api\/olympus\/chat\/hibernate', \{ waitMs: 60_000, forceFree \}, 70_000\)/);
  const prefs = JSON.parse(src('package.json'));
  assert.match(prefs.version, /^\d+\.\d+\.\d+$/);
});

ok('PN5: the hibernate HUD collapses to a compact strip from a real button', () => {
  const widget = src('src/app/m/widget/page.tsx');
  const main = src('electron/main.ts');
  assert.match(widget, /olympus:hud-compact/);
  assert.match(widget, /setCompact/);
  assert.match(widget, /Minimize2/);
  assert.ok(fs.existsSync(path.join(ROOT, 'electron', 'hud-preload.ts')));
  assert.match(main, /hud-preload\.js/);
  assert.match(main, /setHudCompact/);
  assert.match(main, /compact \? 340 : 420/);
  assert.match(main, /compact \? 190 : 720/);
});

ok('PN6: the GO console frame parser reads both snapshots exactly', () => {
  const a = goRead.parseGoConsoleText(
    '41% Go Plus usage · Renews Dec 5 · On pace for 82% 5-hour window Resets in 3h 27m 71% used Weekly Resets in 2d 2h 40% used Monthly Resets in 15d 1h 41% used',
    Date.parse('2026-11-20T16:16:00Z'),
  );
  assert.ok(a);
  assert.equal(a.monthlyPct, 41); assert.equal(a.h5Pct, 71); assert.equal(a.weeklyPct, 40);
  assert.equal(a.resetAt, '2026-12-05T18:15:00.000Z');
  const b = goRead.parseGoConsoleText(
    'Monthly 44% used\nGo Plus usage · Renews Dec 5 · On pace for 87%\n5-hour window Resets in 3h 21m 86% used\nWeekly Resets in 2d 2h 46% used',
    Date.parse('2026-11-20T16:30:00Z'),
  );
  assert.ok(b); assert.equal(b.monthlyPct, 44); assert.equal(b.h5Pct, 86); assert.equal(b.weeklyPct, 46);
});

ok('PN7: a stale anchor pauses upgrades; rolling 86 steps down; rolling 100 is a quota hit', () => {
  const base = {
    policy: { mode: 'burn', targetPct: 95, modelCeilingPct: 85 },
    accountPct: 41, dailyPct: 2.7, daysLeft: 14, h5Pct: 71, weeklyPct: 40,
    models: [], enabledModels: [],
  };
  assert.equal(burn.chooseBurnRoster({ ...base, anchorAgeMs: 10 * 60_000 }).blocked, 'stale-anchor');
  const down = burn.chooseBurnRoster({ ...base, anchorAgeMs: 1000, h5Pct: 86 });
  assert.equal(down.step, -1);
  assert.equal(down.blocked, null);
  const hit = burn.chooseBurnRoster({ ...base, anchorAgeMs: 1000, h5Pct: 100, rollingResetAt: '2026-11-20T20:00:00Z' });
  assert.equal(hit.blocked, 'quota-hit');
  assert.equal(hit.resumeAt, '2026-11-20T20:00:00Z');
});

ok('PN8: the unverified qwen lane is guarded to the verified GO fallback', () => {
  assert.equal(agentModel.isUnverifiedQwenLane('opencode-go/qwen3.7-plus'), true);
  assert.equal(agentModel.guardedModelForGod('athena', 'opencode-go/qwen3.7-plus'), 'opencode-go/deepseek-v4.1-flash');
  assert.equal(agentModel.guardedModelForGod('athena', 'opencode-go/kimi-k2.7-code'), 'opencode-go/kimi-k2.7-code');
  assert.match(src('src/app/api/olympus/action/route.ts'), /guardedModelForGod/);
  assert.match(src('src/components/olympus/custom-frames.tsx'), /parseGoConsoleText/);
  assert.match(src('src/components/olympus/custom-frames.tsx'), /olympus:go-console-synced/);
  const panel = src('src/components/olympus/burn-panel.tsx');
  assert.match(panel, /hardPressure/);
  assert.match(panel, /mode\.id === 'burn' \|\| mode\.id === 'pace'/);
  assert.match(src('src/lib/go-console.ts'), /const monthPct = anchor\.monthlyPct;/);
  const consoleRoute = src('src/app/api/olympus/go-usage/console/route.ts');
  assert.match(consoleRoute, /peekUsageSnapshot/);
  assert.doesNotMatch(consoleRoute, /getUsageSnapshot/);
  assert.match(src('src/lib/hop-runtime/walker.ts'), /readGoConsoleAnchor/);
  assert.match(src('src/lib/hop-runtime/walker.ts'), /anchor\.h5Pct >= 100/);
});


ok('PN9: the GO limit is a quota WAIT, not an unknown stop', () => {
  assert.equal(failureClass.classifyDispatchFailure({ errorClass: 'provider.go-limit', error: 'OpenCode Go 5 hour usage limit reached' }), 'provider-quota');
  assert.equal(failureClass.classifyDispatchFailure({ errorClass: 'provider.quota', error: 'quota exceeded' }), 'provider-quota');
  assert.equal(failureClass.classifyDispatchFailure({ errorClass: 'provider.auth', error: 'OpenCode Go requires an API key' }), 'provider-auth');
  assert.equal(failureClass.classifyDispatchFailure({ errorClass: 'provider.no-route', error: 'model not found' }), 'provider-route');
  assert.equal(failureClass.classifyParkReason('blocked-dependencies', '2 blocked by qa-art-fit'), 'blocked-dependencies');
  assert.equal(failureClass.classifyParkReason('verify-failed', 'MISSING Overall: PASS'), 'verify-failed');
  assert.equal(failureClass.classifyParkReason('tool-budget', 'hop-tool-budget-exceeded'), 'tool-budget');
  const rec = src('src/lib/hop-runtime/recovery.ts');
  assert.match(rec, /case 'provider-quota'/);
  assert.match(rec, /wait-quota/);
  assert.match(rec, /blocked-dependencies/);
});

ok('PN10: the digest counts state-completed hops (6/10, not 4/10)', () => {
  const plan = { hops: [
    { id: 'a', god: 'athena', artifacts: [] }, { id: 'b', god: 'dionysus', artifacts: [] },
  ] };
  const rows = [{ ts: '2026-11-21T00:00:00Z', hop: 'a', god: 'athena', status: 'completed', durationMs: 1, tokensIn: 1, tokensOut: 1 }];
  const digest = overnight.buildOvernightDigest({
    slug: 'aime', laneRoot: '/tmp/aime', plan, rows,
    state: { completed: ['a', 'b'], quarantined: ['qa-x'], parks: {} },
    autoApproved: false, resumeAttempts: 0,
    startedAt: '2026-11-21T00:00:00Z', finishedAt: '2026-11-21T01:00:00Z',
  });
  assert.match(digest, /Completed: 2\/2/);
  assert.match(digest, /Quarantined dependencies: qa-x/);
});

ok('PN11: the terminal meter and the Logs workspace are wired', () => {
  const meter = src('src/app/api/olympus/go-usage/meter/route.ts');
  assert.match(meter, /peekUsageSnapshot/);
  assert.doesNotMatch(meter, /getUsageSnapshot/);
  assert.match(src('src/components/olympus/interactive-terminal.tsx'), /UsageMeter/);
  const logs = src('src/app/api/olympus/logs/route.ts');
  assert.match(logs, /buildLogsPayload/);
  assert.match(src('src/components/olympus/activity-bar.tsx'), /leftPane === 'logs'/);
  assert.match(src('src/components/olympus/logs-dashboard.tsx'), /HopsTable/);
  assert.match(src('src/lib/logs-index.ts'), /parksByClass/);
  assert.match(src('src/lib/hop-runtime/walker.ts'), /parkMap/);
  assert.match(src('src/lib/hop-runtime/walker.ts'), /retryHopIds/);
  assert.match(src('src/lib/hop-runtime/post-run.ts'), /recoverBlockedDependencies/);
  assert.match(src('src/lib/atlas-warden.ts'), /retryHopIds/);
  assert.match(src('src/lib/hop-runtime/supervisor.ts'), /retry-hops/);
});


ok('PN12: a blocked gate recovers its quarantined dependencies, not the gate', () => {
  const lane = path.join(HOME, 'lane-blocked');
  fs.mkdirSync(lane, { recursive: true });
  const plan = { hops: [
    { id: 'impl', god: 'athena', artifacts: [] },
    { id: 'qa-a', god: 'dionysus', artifacts: [], after: ['impl'] },
    { id: 'qa-b', god: 'dionysus', artifacts: [], after: ['impl'] },
    { id: 'gate', god: 'athena', artifacts: [], after: ['qa-a', 'qa-b'] },
  ] };
  fs.writeFileSync(path.join(lane, 'dispatch-plan.json'), JSON.stringify(plan));
  fs.writeFileSync(path.join(lane, '.olympus-hop-state.json'), JSON.stringify({
    version: 1, generation: 1, campaignId: 'cmp_blocked',
    completed: ['impl'], quarantined: ['qa-a', 'qa-b'],
    parked: { hopId: 'gate', reason: 'blocked-dependencies', errorClass: 'blocked-dependencies', failureClass: 'blocked-dependencies', kind: 'blocked', ts: new Date().toISOString() },
    parks: {
      'qa-a': { hopId: 'qa-a', reason: 'dispatch-failed:tool-budget', errorClass: 'tool-budget', failureClass: 'tool-budget', kind: 'parked', ts: new Date().toISOString() },
      'qa-b': { hopId: 'qa-b', reason: 'verify-failed', errorClass: 'verify-failed', failureClass: 'verify-failed', kind: 'parked', ts: new Date().toISOString() },
      gate: { hopId: 'gate', reason: 'blocked-dependencies', failureClass: 'blocked-dependencies', kind: 'blocked', ts: new Date().toISOString() },
    },
    updatedAt: new Date().toISOString(),
  }));
  const result = postRun.recoverBlockedDependencies(lane, plan);
  assert.deepEqual(result.ids.sort(), ['qa-a', 'qa-b']);
  assert.equal(result.waitMs, 0);
  const red = src('src/lib/hop-runtime/post-run.ts');
  assert.match(red, /retryHopIds: dep\.ids/);
  assert.match(red, /recoverBlockedDependencies/);
});

ok('PN13: the brain keeps its full cloud (no silent auto-lean regression)', () => {
  const brain = src('src/components/olympus/brain-atlas-3d.tsx');
  assert.doesNotMatch(brain, /autoLean/);
  assert.match(brain, /'background', 'haze', 'cloud', 'edges', 'nodes', 'signals', 'labels'/);
  assert.match(brain, /'background', 'cloud', 'edges', 'nodes', 'labels'/);
  assert.match(brain, /idleAutoRotate: opts\.perfPreset !== 'batterySaver'/);
  assert.match(brain, /addEventListener\('pointerup', up, true\)/);
  assert.match(brain, /pauseWhenIdle: opts\.perfPreset === 'batterySaver'/);
  assert.match(brain, /pauseWhenIdle: perfPreset === 'batterySaver'/);
  assert.doesNotMatch(brain, /setEnabledPassesForTest\(new Set\(\[[^\]]*'compass'/);
  // The stale v0.1.4 local build carried the old autoLean chunk; the source
  // guard is the contract a future build must satisfy.
  assert.doesNotMatch(brain, /Auto · lean/);
});

ok('PN14: minimize keeps the window; closing hibernates by default', () => {
  const main = src('electron/main.ts');
  assert.match(main, /olympus:window-minimize[\s\S]{0,120}mainWindow\?\.minimize\(\)/);
  assert.match(main, /readCloseToHibernate\(\)[\s\S]{0,120}void hibernateNow\(\)/);
  const prefs = src('src/lib/power-prefs.ts');
  assert.match(prefs, /closeToHibernate: true/);
});

console.log(`\nv092-runtime: ${passed} passed${process.exitCode ? ', failures' : ', all green'}.`);
