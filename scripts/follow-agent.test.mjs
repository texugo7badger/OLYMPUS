#!/usr/bin/env node
/**
 * follow-agent.test.mjs — v0.0.42 (R42-02).
 *
 * Pins the editor-follow contract: opt-in only, inside the active project,
 * one file per burst, and the API refuses traversal/no-editor honestly.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const route = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/editor/open/route.ts', 'utf-8');
const comp = fs.readFileSync(OLYMPUS + '/src/components/olympus/follow-agent.tsx', 'utf-8');
const panel = fs.readFileSync(OLYMPUS + '/src/components/olympus/editor-bridge-panel.tsx', 'utf-8');
const status = fs.readFileSync(OLYMPUS + '/src/components/olympus/status-bar.tsx', 'utf-8');

expect('F1: the open route refuses a file outside the project root',
  /isInside/.test(route) && /outside the project root/.test(route) && /realpathSync/.test(route),
  'the route can open arbitrary paths');
expect('F2: the open route only accepts a real file',
  /isFile\(\)/.test(route) && /file not found/.test(route),
  'the route does not validate the target');
expect('F3: VSCode-family gets -g file:line, Zed gets file:line',
  /-g/.test(route) && /editorId === 'vscode'/.test(route) && /`\$\{target\}:\$\{line\}`/.test(route),
  'line targeting is missing');
expect('F4: follow is OPT-IN (stored off by default)',
  /localStorage\.getItem\(LS_KEY\) === '1'/.test(comp) && /Off by default/.test(panel),
  'the editor can steal focus without consent');
expect('F5: the subscriber reads the activity feed and writes only inside the active project',
  /new EventSource\('\/api\/olympus\/activity'\)/.test(comp) && /file\.startsWith/.test(comp) && /editor\/open/.test(comp),
  'the follow path is not wired');
expect('F6: bursts are debounced and the same file is deduped for 5s',
  /setTimeout\(/.test(comp) && /now - last\.current\.at < 5_000/.test(comp),
  'the editor can be spammed');
expect('F7: the subscription pauses when the window is hidden',
  /useDocVisible/.test(comp) && /!docVisible/.test(comp),
  'the feed runs while hidden');
expect('F8: the Editor Bridge panel exposes the toggle',
  /useFollowAgentSetting/.test(panel) && /follow the agent/.test(panel),
  'no user control in the panel');
expect('F9: the follower is mounted in the always-visible status bar',
  /<FollowAgent \/>/.test(status),
  'the follower only runs while the panel is open');
expect('F10: no native title= in the follow files',
  !/\btitle=/.test(comp) && !/\btitle=/.test(route),
  'native tooltips are forbidden');

console.log(failures === 0 ? '\nfollow-agent: all green.' : `\nfollow-agent: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
