#!/usr/bin/env node
/**
 * launch-reliability.test.mjs — v0.0.51.
 *
 * The Wayland deadlock must not come back: the launcher defaults to XWayland,
 * the env can opt into Wayland, the main asserts the same guard for packaged
 * runs, and GPU acceleration is still the default.
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

const bin = fs.readFileSync(path.join(OLYMPUS, 'bin/olympus.js'), 'utf-8');
const main = fs.readFileSync(path.join(OLYMPUS, 'electron/main.ts'), 'utf-8');

expect('L1: the launcher defaults to XWayland',
  /process\.env\.OLYMPUS_OZONE \|\| 'x11'/.test(bin) && /--ozone-platform=' \+ ozone/.test(bin),
  'the launcher still lets Wayland hang');
expect('L2: OLYMPUS_OZONE=wayland opts back in',
  /OLYMPUS_OZONE/.test(bin) && /OLYMPUS_OZONE/.test(main),
  'no documented override');
expect('L3: packaged runs get the same guard before ready',
  /ozone-platform', 'x11'/.test(main) && /process\.platform === 'linux'/.test(main),
  'the packaged app can still deadlock');
expect('L4: GPU acceleration is NOT unconditionally disabled',
  !/gpuDisabled = !process\.argv\.includes\('--reset-gpu'\)/.test(bin)
    && /const forceSoftware =/.test(bin),
  'the old always-software workaround returned');
expect('L5: the software fallback still names --reset-gpu',
  /--reset-gpu/.test(bin) && /--reset-gpu/.test(main),
  'the user cannot retry acceleration');

console.log(failures === 0 ? '\nlaunch-reliability: all green.' : `\nlaunch-reliability: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
