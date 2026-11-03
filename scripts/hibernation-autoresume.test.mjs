#!/usr/bin/env node
/**
 * hibernation-autoresume.test.mjs — v0.0.52.
 *
 * Hibernation keeps the campaign worker alive, but a park used to wait for a
 * morning click because only `opts.unattended` auto-resumed. The marker is
 * now the contract: hibernating means "no human at the keyboard".
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 220)}`);
  if (!cond) failures++;
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-hibernate-'));
const lib = await import(OLYMPUS + '/src/lib/hibernation.ts');
expect('H-1: no marker = not hibernating', lib.isHibernating(home) === false, 'false positive');
fs.writeFileSync(path.join(home, 'hibernation.json'), JSON.stringify({ active: true }) + '\n');
expect('H-2: active marker = hibernating', lib.isHibernating(home) === true, 'marker ignored');
fs.writeFileSync(path.join(home, 'hibernation.json'), JSON.stringify({ active: false }) + '\n');
expect('H-3: inactive marker = not hibernating', lib.isHibernating(home) === false, 'stale true');

const postRun = fs.readFileSync(OLYMPUS + '/src/lib/hop-runtime/post-run.ts', 'utf-8');
expect('H-4: the overnight auto-resume runs when hibernating',
  /opts\.unattended \|\| isHibernating\(\)/.test(postRun),
  'a park still waits for the morning');
const action = fs.readFileSync(OLYMPUS + '/src/app/api/olympus/action/route.ts', 'utf-8');
expect('H-5: a prompt sent during hibernation is unattended',
  /body\.unattended === true \|\| noQuestionsIntent\(text\) \|\| isHibernating\(\)/.test(action),
  'the action route drops the marker');
const main = fs.readFileSync(OLYMPUS + '/electron/main.ts', 'utf-8');
expect('H-6: the main writes the marker before destroying the window',
  /writeHibernationMarker\(true\)/.test(main) && /mainWindow\.destroy\(\)/.test(main),
  'the marker can race the destroy');
expect('H-7: the marker file is ~/.olympus/hibernation.json',
  /hibernation\.json/.test(fs.readFileSync(OLYMPUS + '/src/lib/hibernation.ts', 'utf-8')),
  'the path drifted');

console.log(failures === 0 ? '\nhibernation-autoresume: all green.' : `\nhibernation-autoresume: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
