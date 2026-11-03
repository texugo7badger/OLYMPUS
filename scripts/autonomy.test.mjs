#!/usr/bin/env node
/**
 * autonomy.test.mjs — v0.0.47 (R47).
 *
 * The unattended contract must be explicit, visible and bounded: a persisted
 * switch read at send time, a chip in the terminal, auto-approval only in the
 * unattended lane, a bounded overnight resume, and the morning digest.
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

const lib = fs.readFileSync(OLYMPUS + '/src/lib/autonomy.ts', 'utf-8');
const card = fs.readFileSync(OLYMPUS + '/src/components/olympus/autonomy-card.tsx', 'utf-8');
const terminal = fs.readFileSync(OLYMPUS + '/src/components/olympus/interactive-terminal.tsx', 'utf-8');
const settings = fs.readFileSync(OLYMPUS + '/src/components/olympus/settings-dialog.tsx', 'utf-8');
const postRun = fs.readFileSync(OLYMPUS + '/src/lib/hop-runtime/post-run.ts', 'utf-8');
const action = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/action/route.ts', 'utf-8');

expect('N1: the switch is persisted and off by default',
  /localStorage\.getItem\(LS_KEY\) === '1'/.test(lib) && /setItem\(LS_KEY/.test(lib),
  'the setting is not persisted');
expect('N2: Settings mounts the autonomy card',
  /AutonomyCard/.test(settings) && /Run without me/.test(card),
  'the user cannot turn it on');
expect('N3: the card states the bounded contract (3 resumes, 60-min budget, digest)',
  /3 times/.test(card) && /60-minute/.test(card) && /morning digest/.test(card),
  'the contract is vague');
expect('N4: the terminal reads the switch at SEND time, not at mount',
  /unattended: unattendedEnabled\(\)/.test(terminal),
  'a stale closure can flip the mode');
expect('N5: the terminal shows an UNATTENDED chip',
  /unattended &&/.test(terminal) && />\s*unattended\s*</.test(terminal),
  'the mode is silent');
expect('N6: the action route carries body.unattended into the walk',
  /body\.unattended === true/.test(action) && /unattended: opts\.unattended === true/.test(action),
  'the switch never reaches the walk');
expect('N7: gates auto-approve ONLY in the unattended/hibernation lane',
  /if \(opts\.unattended \|\| isHibernating\(\)\)/.test(postRun) && /auto-approved — unattended/.test(postRun),
  'an attended run can be auto-approved');
expect('N8: the overnight resume is bounded and the digest is written',
  /overnightAttempt \?\? 0/.test(postRun) && /attempt < maxAttempts/.test(postRun) && /writeOvernightDigest/.test(postRun),
  'the night can loop forever or lose the digest');

console.log(failures === 0 ? '\nautonomy: all green.' : `\nautonomy: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
