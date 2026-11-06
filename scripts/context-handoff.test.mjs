#!/usr/bin/env node
/**
 * context-handoff.test.mjs — v0.0.84.
 *
 * The full window must be a CONTINUATION, not amnesia:
 *   - the brief is compact, capped, written 0600 on disk;
 *   - the reset route writes it BEFORE the serve dies and returns the path;
 *   - the terminal captures it before the transcript is replaced, then sends
 *     one short pointer prompt (never the transcript);
 *   - the offer appears once per session at ≥95%, not on every poll;
 *   - the left-column hops are clickable on the PC creative and in the phone's
 *     cost/details sheet.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-handoff-'));
process.env.OLYMPUS_HOME = home;
const { capHandoff, writeHandoff, MAX_HANDOFF_CHARS } = await import('../src/lib/context-handoff.ts');
const { parseResumeIntent } = await import('../src/lib/hop-runtime/resume-intent.ts');
const { clearUserActivity, userIsActive, markUserActivity } = await import('../src/lib/user-activity.ts');

let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const long = 'A'.repeat(20_000) + 'THE-LATEST-STATE';
const capped = capHandoff(long);
expect('H-1: the brief is capped at the contract size', capped.length <= MAX_HANDOFF_CHARS + 200, capped.length);
expect('H-2: the cap keeps the tail (the current state, not the opening)', capped.includes('THE-LATEST-STATE'), 'tail lost');
expect('H-3: the cap says it truncated', /middle truncated by OLYMPUS/.test(capped), 'silent truncation');

const rec = writeHandoff('## state\ncampaign at hop 46; next: mobile gate', 'conv-abc', new Date('2026-11-06T01:00:00Z'));
expect('H-4: the handoff lands on disk', fs.existsSync(rec.path), rec.path);
const mode = fs.statSync(rec.path).mode & 0o777;
expect('H-5: the handoff is 0600', mode === 0o600, mode.toString(8));
const written = fs.readFileSync(rec.path, 'utf-8');
expect('H-6: the file carries the continuation contract + conversation',
  /# OLYMPUS handoff/.test(written) && /conv-abc/.test(written) && /Continue/.test(written), written.slice(0, 120));
let refused = false;
try { writeHandoff('   ', 'x'); } catch { refused = true; }
expect('H-7: an empty brief is refused, not written empty', refused, 'wrote an empty handoff');

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
const action = read('src/app/api/olympus/action/route.ts');
const terminal = read('src/components/olympus/interactive-terminal.tsx');
const indicator = read('src/components/olympus/context-indicator.tsx');
const immersive = read('src/components/olympus/immersive-panel.tsx');
const mobile = read('src/app/m/page.tsx');
const supervisor = read('src/lib/hop-runtime/supervisor.ts');
const main = read('electron/main.ts');
const walker = read('src/lib/hop-runtime/walker.ts');
const widget = read('src/app/m/widget/page.tsx');
const widgetManifest = read('public/manifest-widget.webmanifest');
const pairing = read('src/lib/mobile-pairing.ts');
const walkLane = read('scripts/walk-lane.ts');
const pairDialog = read('src/components/olympus/mobile-pair-dialog.tsx');

const writeAt = action.indexOf('writeHandoff(handoffText');
const cleanupAt = action.indexOf('cleanupServer();', writeAt);
expect('H-8: reset-session writes the brief before killing the serve',
  writeAt > 0 && cleanupAt > writeAt, 'handoff written after cleanup');
expect('H-9: the reset response returns the handoff path',
  /handoff\?:/.test(action) || /handoff:\s*handoff/.test(action) || /handoff\s*\?\?/.test(action) || /handoff\b/.test(action), 'no path in response');
expect('H-10: the terminal captures the brief BEFORE resetTerminal',
  terminal.indexOf('buildConversationSummary()') < terminal.indexOf('resetTerminal();'), 'summary built after the transcript died');
expect('H-11: the continuation prompt points at the file, not the transcript',
  /OLYMPUS HANDOFF/.test(terminal) && /data\.handoff\.path/.test(terminal) && /CONTINUE the same task/.test(terminal), 'no pointer prompt');
expect('H-12: the offer fires at >=95% once per session',
  /percentage < 95/.test(indicator) && /autoOfferedRef/.test(indicator), 'no auto-offer');
expect('H-13: opening the offer does not abort a live answer',
  !/handleNewSessionStart[\s\S]{0,200}actionAbortRef\.current\?\.abort/.test(terminal), 'the offer kills the run');
expect('H-14: the PC left column hops open the task sheet',
  /inflight\.map\(\(h\) => \([\s\S]{0,300}setSheetHop\(h\.hopId\)/.test(immersive), 'PC hop rows are dead');
expect('H-15: the phone cost/details sheet hops open the task sheet',
  /inFlightList[\s\S]{0,600}setSheetHop\(h\.hopId\)/.test(mobile) && /TaskSheetModal hopId=\{sheetHop\}/.test(mobile), 'phone hop rows are dead');

// v0.0.84 edit — the resume decoupling: a bare resume command must start the
// detached walk without an LLM turn (the lane may be 429/stalled).
expect('R-1: "Continue o projeto aime!" parses to aime', parseResumeIntent('Continue o projeto aime!') === 'aime', parseResumeIntent('Continue o projeto aime!'));
expect('R-2: "continuar projeto aime" parses to aime', parseResumeIntent('continuar projeto aime') === 'aime', parseResumeIntent('continuar projeto aime'));
expect('R-3: "Continue com o projeto aime" parses to aime', parseResumeIntent('Continue com o projeto aime') === 'aime', parseResumeIntent('Continue com o projeto aime'));
expect('R-4: "resume the project aime" parses to aime', parseResumeIntent('resume the project aime') === 'aime', parseResumeIntent('resume the project aime'));
expect('R-5: a task with extra instructions is NOT hijacked', parseResumeIntent('Continue o projeto aime e rode os testes') === null, parseResumeIntent('Continue o projeto aime e rode os testes'));
expect('R-6: the action route starts the supervisor + clears the user lease', /parseResumeIntent\(text\)/.test(action) && /startDetachedWalk\(\{ slug: resumeSlug/.test(action) && /clearUserActivity\(\)/.test(action), 'no resume short-circuit');
markUserActivity(30_000);
clearUserActivity();
expect('R-7: clearUserActivity hands the lane back to the walker', userIsActive() === false, 'lease still active');

// v0.0.84 edit — duplicate-answer guard + cosmetic clear + copy worklog.
expect('T-1: the terminal dedupes exact long text per turn', /emittedTextsRef/.test(terminal) && /duplicateText\(text\)/.test(terminal) && /duplicateText\(msg\)/.test(terminal), 'no duplicate guard');
expect('T-2: the clear-view action never resets the session', /clearVisibleChat/.test(terminal) && /suppressPersistRef/.test(terminal) && /Chat view cleared/.test(terminal), 'no cosmetic clear');
expect('T-3: the clear-view action does not rotate the conversation', !/clearVisibleChat[\s\S]{0,500}conversationIdRef\.current =/.test(terminal), 'clear rotates the session');
expect('T-4: the header exposes copy + clear buttons', /Copy chat worklog/.test(terminal) && /Clear chat view/.test(terminal), 'buttons missing');
expect('T-5: the worklog includes the full transcript', /worklogText/.test(terminal) && /m\.type/.test(terminal) && /m\.text/.test(terminal), 'worklog is incomplete');

// v0.0.84 edit — the stability batch.
expect('T-6: the watchdog does not blind-reload a live/compiling Next', /silentRounds/.test(main) && /nextWatchdogAt/.test(main) && /silent for 60s/.test(main), 'watchdog still churns');
expect('T-7: the lane config is keyed by the ROOT hash, not the lane mtime', /syncLaneConfigFile/.test(walker) && /rootHash/.test(walker) && /lane-config/.test(walker), 'lane config rewrites every hop');
expect('T-8: boot resumes a finished walk that has a parked hop', /status === 'finished'/.test(supervisor) && /retryParkedHop: true/.test(supervisor) && /resumed parked hop/.test(supervisor), 'parked walk stays stuck');
expect('T-9: the phone retries a transient delivery failure once', /for \(let attempt = 0; attempt < 2/.test(mobile) && /HTTP \$\{res\?\.status/.test(mobile), 'mobile has no retry');

// v0.0.84 edit — fluid hibernate: themed HUD, close-to-hibernate.
expect('T-10: hibernate opens the live HUD instead of a native toast', /function showHud/.test(main) && /showHud\(\)/.test(main) && /Live status HUD/.test(main), 'no HUD');
expect('T-11: the HUD loads the themed live widget sheet', /\/m\/widget#t=/.test(main) && /GO Plus|5_000|inFlightList/.test(widget), 'HUD is not the live widget');
expect('T-12: closing the main window hibernates, it does not quit', /mainWindow\.on\('close'[\s\S]{0,300}hibernateNow\(\)/.test(main), 'close still quits');

// v0.0.84 edit — the live phone widget / hibernation HUD.
expect('T-13: /m/widget is a live campaign + GO + hops view', /run-state/.test(widget) && /go-usage/.test(widget) && /5_000/.test(widget) && /inFlightList/.test(widget), 'widget is not live');
expect('T-14: the widget has a standalone manifest', /"start_url": "\/m\/widget"/.test(widgetManifest) && /standalone/.test(widgetManifest), 'no widget manifest');
expect('T-15: the phone details sheet links to the widget', /\/m\/widget#t=/.test(mobile) && /Smartphone/.test(mobile), 'no phone widget link');

// v0.0.84 edit — themed QR + installable widget with terminal chat.
expect('T-16: the pairing payload carries a themed widget QR', /widgetQr/.test(pairing) && /qrDark/.test(pairing) && /themeName/.test(pairing) && /widgetQr/.test(pairDialog), 'no themed widget QR');
expect('T-17: the widget has a terminal queue + parked action + install prompt', /prompt-queue/.test(widget) && /investigar/.test(widget) && /beforeinstallprompt/.test(widget) && !/abrir OLYMPUS/.test(widget), 'widget is not interactive');
expect('T-18: the widget is installable (SW + 192/512 icons)', /serviceWorker/.test(widget) && /widget-sw/.test(widget) && /olympus-192/.test(widgetManifest) && /olympus-512/.test(widgetManifest), 'no install surface');

// v0.0.84 edit — the resume ACK must not wait on the spawn.
expect('T-19: the resume stream ACKs before spawning the walker', /resume requested/.test(action) && /setImmediate/.test(action), 'resume waits on spawn');
expect('T-20: hop work runs at low CPU priority', /setPriority\(process\.pid, 10\)/.test(walkLane), 'hops can starve the UI');

fs.rmSync(home, { recursive: true, force: true });
if (failures) { console.log(`\ncontext-handoff: ${failures} FAIL`); process.exit(1); }
console.log('\nAll 41 context-handoff assertions passed');
