#!/usr/bin/env node
/**
 * boot-mode.test.mjs — WHICH SERVER A LAUNCH SERVES (2026-10-24).
 *
 * The specimen: `olympus dev` opened "a screen that did not look like OLYMPUS
 * at all". Two faults: the CLI dropped every `--` flag (so `--dev` never
 * arrived) and production was chosen by FILE EXISTENCE — a half-copied
 * `.next/standalone` from a concurrent build got served.
 *
 * B1  a packaged app is ALWAYS production
 * B2  --dev always wins, even with a perfect build on disk
 * B3  a source run with NO build → development
 * B4  a source run with a COMPLETE stamped build → production
 * B5  a source run with a build on disk but NO stamp (mid-build / never
 *     finished) → development — the guard that fixes the specimen
 * B6  --prod CANNOT force an incomplete build
 * B7  every decision carries a reason (the launch must be diagnosable)
 * B8  the wiring is real: main.ts imports resolveBootMode, and the stamp is
 *     written by the last build step and deleted by the first
 *
 * Run: npx tsx scripts/boot-mode.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 240) : ''}`); }
}

const { resolveBootMode } = await import('../electron/boot-mode.ts');
const base = { packaged: false, devRequested: false, prodRequested: false, hasStandalone: true, buildStamped: true };

const B1 = resolveBootMode({ ...base, packaged: true, hasStandalone: true });
expect('B1 packaged + bundled standalone → production', B1.mode === 'production', B1.mode);

const B2 = resolveBootMode({ ...base, devRequested: true });
expect('B2 --dev wins over a perfect build', B2.mode === 'development', B2.mode);

const B3 = resolveBootMode({ ...base, hasStandalone: false, buildStamped: false });
expect('B3 no build → development', B3.mode === 'development', B3.mode);

const B4 = resolveBootMode({ ...base });
expect('B4 complete build → production', B4.mode === 'production', B4.mode);

const B5 = resolveBootMode({ ...base, buildStamped: false });
expect('B5 build on disk, NO stamp (mid-build) → development', B5.mode === 'development', B5.mode);
expect('B5 the reason names the stamp', /stamp|in progress/i.test(B5.reason), B5.reason);

const B6 = resolveBootMode({ ...base, prodRequested: true, buildStamped: false });
expect('B6 --prod cannot force an incomplete build', B6.mode === 'development', B6.mode);

for (const [label, d] of [['B1', B1], ['B2', B2], ['B3', B3], ['B4', B4], ['B5', B5], ['B6', B6]]) {
  expect(`B7 ${label} carries a non-empty reason`, typeof d.reason === 'string' && d.reason.length > 5, d.reason);
}

/* ── B8: the wiring ─────────────────────────────────────────────────────── */
{
  const main = fs.readFileSync(path.join(ROOT, 'electron', 'main.ts'), 'utf-8');
  expect('B8 main.ts imports resolveBootMode', /from '\.\/boot-mode\.js'/.test(main));
  expect('B8 main.ts does not decide dev by app.isPackaged alone',
    !/const isDev = !app\.isPackaged;/.test(main));
  expect('B8 main.ts logs the mode + the reason', /mode: \$\{boot\.mode\.toUpperCase\(\)\}/.test(main));

  const post = fs.readFileSync(path.join(ROOT, 'scripts', 'electron-postcompile.js'), 'utf-8');
  expect('B8 the stamp is written by the LAST build step', /\.olympus-build-complete/.test(post));

  const invalidate = path.join(ROOT, 'scripts', 'invalidate-build-stamp.js');
  expect('B8 the invalidation script exists', fs.existsSync(invalidate));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  expect('B8 prebuild hooks invalidate the stamp (build, build:app, build:linux)',
    ['prebuild', 'prebuild:app', 'prebuild:linux'].every((k) => /invalidate-build-stamp/.test(pkg.scripts[k] || '')),
    JSON.stringify({ prebuild: pkg.scripts.prebuild, app: pkg.scripts['prebuild:app'], linux: pkg.scripts['prebuild:linux'] }));

  const cli = fs.readFileSync(path.join(ROOT, 'bin', 'olympus.js'), 'utf-8');
  expect('B8 `olympus dev` passes --dev explicitly',
    /startElectron\(\[\.\.\.passthrough, '--dev'\]\)/.test(cli));
  expect('B8 the CLI no longer strips every flag blindly',
    !/const filtered = args\.filter\(a => !a\.startsWith\('--'\)\);/.test(cli));
}

console.log(`\nboot-mode: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
