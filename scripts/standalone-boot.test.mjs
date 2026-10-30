#!/usr/bin/env node
/**
 * standalone-boot.test.mjs — THE BOOT-CRASH CONTRACT (v0.0.25).
 *
 * THE SPECIMEN (2026-10-30): `olympus start` died with
 *
 *   Error: An error occurred while loading instrumentation hook:
 *   Cannot find module './websocket'
 *   Require stack: .next/standalone/node_modules/ws/lib/stream.js
 *
 * Root cause: instrumentation loaded `ws` via eval, so Turbopack never traced
 * it; the standalone copy lost lib files. The fix is a config contract plus a
 * build gate that refuses to package an incomplete standalone.
 *
 *   S1  ws is in serverExternalPackages
 *   S2  ws is force-traced into the standalone output
 *   S3  instrumentation loads ws with a TRACEABLE import
 *   S4  the verifier exists and checks the exact missing file
 *   S5  the static/public sync step exists (the panes' chunks live there)
 *   S6  the build scripts run sync → verify BEFORE packaging
 *
 * Run: npx tsx scripts/standalone-boot.test.mjs (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failures = 0;
function expect(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + String(detail).slice(0, 320) : ''}`); }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// ── S1/S2: the config contract ────────────────────────────────────────────
{
  const cfg = read('next.config.ts');
  expect('S1 ws is externalized (read from node_modules at runtime)',
    /serverExternalPackages:\s*\[[^\]]*'ws'/.test(cfg), cfg.match(/serverExternalPackages[^\n]*/)?.[0]);
  expect('S2 ws is force-traced into the standalone output',
    /outputFileTracingIncludes/.test(cfg) && /'\.\/node_modules\/ws\/\*\*'/.test(cfg));
}

// ── S3: the instrumentation import ────────────────────────────────────────
{
  const src = read('src/instrumentation-node.ts');
  expect('S3 instrumentation uses a literal dynamic import for ws',
    /await import\('ws'\)/.test(src));
  expect('S3 the eval("require(\\"ws\\")") dodge is gone', !/eval\('require\("ws"\)'\)/.test(src));
}

// ── S4: the verifier ──────────────────────────────────────────────────────
{
  const p = path.join(ROOT, 'scripts/verify-standalone.mjs');
  expect('S4 verify-standalone.mjs exists', fs.existsSync(p));
  const src = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
  expect('S4 it requires ws FROM the standalone tree', /createRequire/.test(src) && /req\('ws'\)/.test(src));
  expect('S4 it asserts websocket.js specifically', /websocket\.js/.test(src));
  expect('S4 it checks BUILD_ID parity', /BUILD_ID/.test(src));
  expect('S4 it boots server.js', /server\.js/.test(src) && /Cannot find module/.test(src));
}

// ── S5: the asset sync ────────────────────────────────────────────────────
{
  const p = path.join(ROOT, 'scripts/sync-standalone-assets.mjs');
  expect('S5 sync-standalone-assets.mjs exists', fs.existsSync(p));
  const src = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
  expect('S5 it copies .next/static into the standalone', /\.next', 'static'/.test(src) || /\.next\/static/.test(src));
  expect('S5 it copies public', /'public'/.test(src));
}

// ── S6: the build chain ───────────────────────────────────────────────────
{
  const pkg = JSON.parse(read('package.json'));
  for (const name of ['build', 'build:app', 'build:linux']) {
    const cmd = pkg.scripts[name] || '';
    const syncIdx = cmd.indexOf('sync-standalone-assets.mjs');
    const verifyIdx = cmd.indexOf('verify-standalone.mjs');
    expect(`S6 ${name} syncs the assets before verifying`,
      syncIdx >= 0 && verifyIdx > syncIdx, cmd);
    expect(`S6 ${name} verifies BEFORE packaging`,
      verifyIdx >= 0 && (cmd.indexOf('electron-builder') === -1 || verifyIdx < cmd.indexOf('electron-builder')), cmd);
  }
  expect('S6 verify:standalone script exists', pkg.scripts['verify:standalone'] === 'node scripts/verify-standalone.mjs');
}

// ── S7: the live artifact (when a build exists) ───────────────────────────
{
  const wsFile = path.join(ROOT, '.next/standalone/node_modules/ws/lib/websocket.js');
  const built = fs.existsSync(path.join(ROOT, '.next/standalone/server.js'));
  if (built) {
    expect('S7 the current standalone has ws/lib/websocket.js', fs.existsSync(wsFile));
  } else {
    console.log('SKIP  S7 no standalone build present (run `next build` to exercise it)');
  }
}

console.log(`\nstandalone-boot: ${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
