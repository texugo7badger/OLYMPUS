#!/usr/bin/env node
/**
 * v1-readiness.test.mjs — v0.0.50 (R50).
 *
 * The final rung must be a report, not a victory lap. It has to name the
 * evidence, the two open gates and the go/no-go; the package must expose the
 * soak/audit/perf lanes; and the README must link the report.
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

const report = fs.readFileSync(path.join(OLYMPUS, 'V1-READINESS.md'), 'utf-8');
const readme = fs.readFileSync(path.join(OLYMPUS, 'README.md'), 'utf-8');
const pkg = JSON.parse(fs.readFileSync(path.join(OLYMPUS, 'package.json'), 'utf-8'));
const version = fs.readFileSync(path.join(OLYMPUS, 'VERSION'), 'utf-8').trim();

expect('R50-1: the version is 0.0.51 or later', /(^0\.0\.(5[0-9]|[6-9][0-9])$)|(^0\.1\.0$)/.test(version) && pkg.version === version, `${version} / ${pkg.version}`);
expect('R50-2: the report records the 60 FPS measurement',
  /Brain 60\.1/.test(report) && /Studio idle 59\.8/.test(report) && /Studio chat 60\.2/.test(report),
  'the FPS claim has no numbers');
expect('R50-3: the report records the soak evidence',
  /39 rounds PASS/.test(report) && /p95 ≤ 85 ms/.test(report),
  'the soak claim has no numbers');
expect('R50-4: the report names the 8h/100-hop gate as NOT run',
  /8-hour soak \+ 100-hop campaign/.test(report) && /\*\*not run\*\*|Not run yet/i.test(report),
  'the certification is implied');
expect('R50-5: the report names the AppImage gate as not built',
  /AppImage/.test(report) && /not built|Not built yet/i.test(report),
  'the missing asset is hidden');
expect('R50-6: security is audited (0 high/critical) with the moderates named',
  /0 high \/ 0 critical/.test(report) && /27 moderate/.test(report),
  'the audit is a vibe');
expect('R50-7: go/no-go is explicit',
  /\*\*GO\*\*/.test(report) && /\*\*NO-GO\*\*/.test(report),
  'no decision');
expect('R50-8: no false "certified v1.0" claim',
  !/v1\.0 certified/i.test(report.replace(/NO-GO[^\n]*/g, '')) && !/certified v1\.0/i.test(readme),
  'the report claims a certification it did not run');
expect('R50-9: the package exposes soak, audit and route perf',
  typeof pkg.scripts?.soak === 'string' && typeof pkg.scripts?.['security:audit'] === 'string' && typeof pkg.scripts?.['perf:routes'] === 'string',
  'a gate is not runnable');
expect('R50-10: the README links the readiness report',
  /V1-READINESS\.md/.test(readme),
  'the report is buried');

console.log(failures === 0 ? '\nv1-readiness: all green.' : `\nv1-readiness: ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
