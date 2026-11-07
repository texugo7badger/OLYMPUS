#!/usr/bin/env node
/**
 * apollo-narrative.test.mjs — v0.0.87: no silent "thinking (96s)".
 *
 * The user's specimen: Apollo showed tool calls, then a silent counter and
 * "waiting for Apollo"; the preflight 429 was a footnote. The turn must
 * narrate the wait and the lane failure must be actionable (mark + next lane).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const expect = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 260)}`);
  if (!cond) failures++;
};
const action = fs.readFileSync(path.join(ROOT, 'src/app/api/olympus/action/route.ts'), 'utf-8');
const terminal = fs.readFileSync(path.join(ROOT, 'src/components/olympus/interactive-terminal.tsx'), 'utf-8');

expect('N-1: the warm turn narrates every 45s with elapsed + last tool', /progressTimer = setInterval\(\(\) =>/.test(action) && /is working — \$\{elapsed\}s/.test(action) && /last tool: \$\{lastTool\}/.test(action), 'silent waits remain');
expect('N-2: the last tool is tracked from the actual stream', /ev\?\.type === 'tool\.call' && ev\?\.tool\?\.name/.test(action), 'no last-tool state');
expect('N-3: the narration timer is cleared on finish (no zombie lines)', /if \(progressTimer\) clearInterval\(progressTimer\)/.test(action), 'timer leaks');
expect('N-4: a failed preflight marks the lane dead with its class', /markLaneDead\(r\.model, cls/.test(action), 'the failed lane is not recorded');
expect('N-5: auth/no-route fails fast with the next healthy lane', /cls === 'auth' \|\| cls === 'no-route'/.test(action) && /Next healthy lane: \$\{nextLane\}/.test(action) && /fail\(`⚠ Pre-flight/.test(action), 'the turn can still hang on a dead key');
expect('N-6: a transient probe failure suggests the fallback but keeps the turn', /The turn may be slow\. \$\{advice\}/.test(action), 'transient 429 becomes a hard failure');
expect('N-7: the terminal renders log lines in the transcript', /ev\.type === 'response' \|\| ev\.type === 'cli' \|\| ev\.type === 'log'/.test(terminal), 'narration never reaches the user');

console.log(failures === 0 ? '\napollo-narrative: all green.' : `\napollo-narrative: ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
