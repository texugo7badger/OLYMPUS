#!/usr/bin/env node
/**
 * stability.test.mjs — v0.0.40 (R40).
 *
 * Pins the stability contract: the soak harness probes the five load-bearing
 * endpoints, its thresholds are the house's (no made-up green), npm exposes
 * the run, and STABILITY.md never claims the 8h/100-hop certification that was
 * not run.
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

const soak = fs.readFileSync(path.join(OLYMPUS, 'scripts/soak.mjs'), 'utf-8');
const docs = fs.readFileSync(path.join(OLYMPUS, 'STABILITY.md'), 'utf-8');
const pkg = JSON.parse(fs.readFileSync(path.join(OLYMPUS, 'package.json'), 'utf-8'));

expect('S1: the soak probes health, power, resources, run-state and projects',
  ['health', 'power', 'resources', 'run-state', 'projects'].every((n) => soak.includes(`name: '${n}'`)),
  'a load-bearing endpoint is not probed');
expect('S2: the memory floor is the governor floor (900 MB sampler / 1.2 GB admission)',
  /minAvailable < 900/.test(soak) && /growthMb > Math\.max\(600/.test(soak),
  'the soak thresholds are missing');
expect('S3: a non-2xx is a failure, never a skip',
  /if \(!r\.ok\) failures\.push/.test(soak) && !/SKIP/.test(soak),
  'the soak can report green while an endpoint is down');
expect('S4: npm exposes the soak (60 min) and soak:short',
  typeof pkg.scripts?.soak === 'string' && typeof pkg.scripts?.['soak:short'] === 'string',
  'the harness is not runnable from npm');
expect('S5: the docs record the measured 2-minute PASS',
  /24 rounds/.test(docs) && /7,357 MB/.test(docs) && /\+185 MB/.test(docs),
  'the measured run is not recorded');
expect('S6: the docs do NOT claim the 8h/100-hop certification',
  /not\s+claimed|not\s+run|not\s+part of this slice/i.test(docs) && !/8-hour[^\n]*PASS/i.test(docs) && !/100-hop[^\n]*PASS/i.test(docs),
  'a certification was claimed without evidence');
expect('S7: the chaos matrix names the un-drilled disk case',
  /Disk nearly full/.test(docs) && /not drilled/i.test(docs),
  'the honest gap is hidden');
expect('S8: the report carries p50/p95 and failures',
  /p50/.test(soak) && /p95/.test(soak) && /failures/.test(soak),
  'the report cannot answer latency or failure questions');

console.log(failures === 0 ? '\nstability: all green.' : `\nstability: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
