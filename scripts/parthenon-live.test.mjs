#!/usr/bin/env node
/**
 * parthenon-live.test.mjs — v0.0.86: the Parthenon is LIVE for all ten gods,
 * and a mark reaches Athena's terminal.
 *
 * The specimen (2026-11-06): the Parthenon rendered only Apollo because
 * `godStates` started empty and only Apollo ever emitted a terminal event; the
 * task list existed per god but nested under invisible cards. The mark-preview
 * route spawned a detached `opencode run` with `stdio: 'ignore'`, so the mark
 * reached a process, not the god's terminal. The 15-minute turn ceiling killed
 * AIME's `c13b-sakuga-ingest`; the 8 KB pre-step cap cut real thinking.
 *
 * This suite pins the fixes:
 *   P-1..P-5  all ten gods are initialized, overlaid from tasks, chattable
 *   P-6..P-9  the durable inbox (functional) + chat/mark/route wiring
 *   P-10..P-13 runtime ceilings (30 min turn, 40 min hop cap, 48 KB reasoning)
 *   P-14..P-17 lane health names the lane and offers a real retry
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 260)}`);
  if (!cond) failures++;
}
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

const terminal = src('src/components/olympus/interactive-terminal.tsx');
const walkerSrc = src('src/lib/hop-runtime/walker.ts');
const panel = src('src/components/olympus/god-panel.tsx');
const modal = src('src/components/olympus/god-chat-modal.tsx');
const chat = src('src/app/api/olympus/god/chat/route.ts');
const inboxRoute = src('src/app/api/olympus/god/inbox/route.ts');
const mark = src('src/app/api/olympus/athena/edit/route.ts');
const action = src('src/app/api/olympus/action/route.ts');
const session = src('src/lib/opencode-session.ts');
const hopProgress = src('src/lib/hop-runtime/progress.ts');
const runState = src('src/app/api/olympus/run-state/route.ts');
const statusBar = src('src/components/olympus/status-bar.tsx');
const providers = src('src/components/olympus/provider-settings.tsx');
const laneRoute = src('src/app/api/olympus/lane-health/route.ts');

// ── P-1..P-5: every god is present and chattable ─────────────────────────────
const godsBlock = terminal.match(/const GOD_NAMES: Record<string, string> = \{([\s\S]*?)\};/)?.[1] || '';
const godCount = (godsBlock.match(/\b\w+:\s*'/g) || []).length;
expect('P-1: the terminal knows all ten gods', godCount === 10, `GOD_NAMES has ${godCount} entries`);
expect('P-2: a fresh Parthenon starts with every god idle', /function idleGodStates\(\): Map<string, GodState>/.test(terminal) && /Object\.keys\(GOD_NAMES\)\.map/.test(terminal), 'no idle baseline');
expect('P-3: godStates is seeded from the baseline (not an empty Map)', /useState<Map<string, GodState>>\(\(\) => idleGodStates\(\)\)/.test(terminal) && !/useState<Map<string, GodState>>\(\(\) => new Map\(\)\)/.test(terminal), 'empty Map remains');
expect('P-4: the task API overlays the live event state', /Object\.entries\(tasks\)/.test(panel) && /status: current \? 'working' : 'blocked'/.test(panel) && /orderGodStates\(\[\.\.\.by\.values\(\)\]\)/.test(panel), 'no task overlay');
expect('P-5: each card opens that god\'s own chat', /setChatGod\(s\.god\)/.test(panel) && /aria-label=\{`Chat with \$\{godName/.test(panel), 'no per-card chat');

// ── P-6..P-9: the durable inbox ──────────────────────────────────────────────
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-inbox-'));
process.env.OLYMPUS_HOME = tmpHome;
const inbox = await import(ROOT + '/src/lib/god-inbox.ts');
const a = inbox.appendGodInbox('athena', { role: 'you', text: 'move the hero down 24px', source: 'mark', status: 'pending', meta: { x: 10, y: 20 } });
const b = inbox.appendGodInbox('athena', { role: 'god', text: 'Applied to the current section.', source: 'mark', status: 'done', replyTo: a.id });
inbox.updateGodInbox('athena', a.id, { status: 'done' });
const read = inbox.readGodInbox('athena', 10);
expect('P-6: the inbox round-trips a mark and its reply', read.length === 2 && read[0].id === a.id && read[1].replyTo === a.id && read[1].text.includes('Applied'), read);
inbox.appendGodInbox('athena', { role: 'you', text: 'pending mark', source: 'mark', status: 'pending' });
expect('P-7: a pending mark is countable (the badge source)', inbox.pendingGodInboxCount('athena') === 1, inbox.pendingGodInboxCount('athena'));
expect('P-8: the chat route writes both sides of the turn', /appendGodInbox\(god, \{[\s\S]*?role: 'you'/.test(chat) && /appendGodInbox\(god, \{[\s\S]*?role: 'god'/.test(chat) && /replyTo: userEntry\.id/.test(chat), 'chat is memory-only');
expect('P-9: a mark becomes an inbox row, runs in the background and settles', /appendGodInbox\('athena', \{[\s\S]*?source: 'mark'[\s\S]*?status: 'pending'/.test(mark) && /runGodTurn\('athena'/.test(mark) && /updateGodInbox\('athena', inboxEntry\.id, \{ status: 'running' \}\)/.test(mark) && /status: 'done'/.test(mark) && !/detached: true/.test(mark), 'mark still detached/stdio-ignored');
expect('P-10: the inbox route serves one god\'s thread', /readGodInbox\(god, limit\)/.test(inboxRoute) && /pendingGodInboxCount\(god\)/.test(inboxRoute), 'no inbox route');
expect('P-11: the god chat renders the inbox and mark entries', /\/api\/olympus\/god\/inbox\?god=/.test(modal) && /m\.source === 'mark'/.test(modal) && /is applying this mark/.test(modal), 'modal not wired to inbox');

// ── P-12..P-14: runtime ceilings and reasoning ───────────────────────────────
expect('P-12: the action turn ceiling defaults to 30 min (was 15)', /n > 0 \? n : 30 \* 60_000/.test(action) && /OLYMPUS_MAX_RUNTIME_MS/.test(action), 'action default unchanged');
expect('P-13: the session ceiling shares the 30-min default', /export const DEFAULT_MAX_RUNTIME_MS = 30 \* 60_000/.test(session) && !/opts\.maxRuntimeMs \?\? 10 \* 60_000/.test(session), 'session still 10 min');
expect('P-14: the hop hard cap is 40 min and env-tunable', /OLYMPUS_HOP_HARD_CAP_MS/.test(hopProgress) && /n > 0 \? n : 40 \* 60_000/.test(hopProgress), 'hop cap unchanged');
expect('P-15: reasoning is capped at 48 KB, not 8 KB, and the box is taller', /PRE_STEP_REASONING_MAX = 48 \* 1024/.test(session) && /max-h-\[26rem\]/.test(terminal) && !/max-h-48 overflow-y-auto custom-scroll/.test(terminal), 'thinking still cut');

// ── P-16..P-19: lane health is actionable ────────────────────────────────────
expect('P-16: run-state names the blocked lanes', /blockedLanes: blocked\.slice\(0, 8\)/.test(runState) && /status: l\.status/.test(runState), 'count-only payload');
expect('P-17: the status chip lists lane + reason', /state\.blockedLanes\.map/.test(statusBar) && /dead model lane\(s\):/.test(statusBar), 'chip still count-only');
expect('P-18: lane-health exposes GET inspect + POST retry', /markLaneAlive\(lane\)/.test(laneRoute) && /action !== 'retry'/.test(laneRoute), 'no retry route');
expect('P-19: the provider panel loads the lanes and offers retry', /fetch\('\/api\/olympus\/lane-health'/.test(providers) && /retryLane\(l\.lane\)/.test(providers), 'panel never loaded lanes');

// ── P-20..P-22: the Parthenon names the EXECUTING god and the plan's count ──
const tasksSheet = src('src/lib/tasks-sheet.ts');
const briefing = src('src/lib/project-briefing.ts');
expect('P-20: the task sheet applies the walker\'s balance (executing god)', /balancePlan\(rawPlan as any\)\.plan/.test(tasksSheet), 'declared god shown while another runs');
expect('P-21: the phone briefing applies the same balance', /balancePlan\(planRaw as any\)\.plan/.test(briefing), 'briefing shows the declared god');
expect('P-22: run-state counts only the plan\'s completed hops (no 33/27)', /planIds \? allCompleted\.filter/.test(runState), 'stale ids inflate progress');

expect('P-23: a retried hop clears its stale park at launch', /if \(parkedHop\?\.hopId === next\.id\) parkedHop = null/.test(walkerSrc), 'the card stays blocked while the hop runs');
expect('P-24: a live inFlight record outranks a stale park in the sheet', /else if \(startRec && lock\.alive\) status = 'running'/.test(tasksSheet), 'running lost to parked');

// ── P-25..P-29: v0.0.89 — the Atlas/Apollo command deck, mobile + forecast ──
const command = src('src/components/olympus/parthenon-command.tsx');
const mobile = src('src/app/m/page.tsx');
const wardenRoute = src('src/app/api/olympus/atlas/warden/route.ts');
const dashboardSrc = src('src/components/olympus/cost-dashboard.tsx');
const forecast = src('src/components/olympus/go-forecast-chart.tsx');
expect('P-25: the Parthenon renders the Atlas/Apollo command deck with HY3 + real quick actions',
  /<ParthenonCommand/.test(panel) && /Atlas · always on/.test(command) && /HY3/.test(command)
    && /Continue /.test(command) && /Start another project/.test(command) && /Ask Apollo/.test(command)
    && /Ask Atlas/.test(command) && /Pause/.test(command) && /Resume/.test(command) && /Evidence/.test(command),
  'the two gods are still status lines, not controls');
expect('P-26: the phone mounts the same Parthenon deck and opens it from the header',
  /MobileParthenon/.test(mobile) && /parthenonOpen/.test(mobile) && /Parthenon — Atlas and Apollo/.test(mobile),
  'the phone has no active Parthenon');
expect('P-27: the warden route exposes continue/new-project/dismiss and never dispatches a model',
  /action !== 'continue'/.test(wardenRoute) && /new-project/.test(wardenRoute) && /resolveDecision/.test(wardenRoute)
    && !/runGodTurn|askAtlas|--agent/.test(wardenRoute),
  'the warden can prompt Apollo or has no decision route');
expect('P-28: the GO forecast chart is mounted on the cost screen and the phone, with the pace + limit',
  /GoForecastChart/.test(dashboardSrc) && /GoForecastChart/.test(mobile) && /On pace to hit the limit/.test(forecast)
    && /Average \{pace\}% a day/.test(forecast) && /MONTHLY LIMIT/.test(forecast) && /go-forecast-hatch/.test(forecast),
  'the cost window still has no forecast');
expect('P-29: the animated Nakkas SVG and its static twin are shipped and stable-switchable',
  fs.existsSync(path.join(ROOT, 'public/diagrams/parthenon-nakkas.svg'))
    && fs.existsSync(path.join(ROOT, 'public/diagrams/parthenon-nakkas-static.svg'))
    && /data-motion="stable"/.test(src('src/app/globals.css')),
  'the Parthenon has no motion twin');

fs.rmSync(tmpHome, { recursive: true, force: true });
console.log(failures === 0 ? '\nparthenon-live: all green.' : `\nparthenon-live: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
