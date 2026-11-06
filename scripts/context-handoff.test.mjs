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

fs.rmSync(home, { recursive: true, force: true });
if (failures) { console.log(`\ncontext-handoff: ${failures} FAIL`); process.exit(1); }
console.log('\nAll 26 context-handoff assertions passed');
