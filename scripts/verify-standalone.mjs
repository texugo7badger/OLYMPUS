#!/usr/bin/env node
/**
 * verify-standalone.mjs — THE STANDALONE OUTPUT GATE (v0.0.25).
 *
 * THE SPECIMEN (2026-10-30): `olympus start` booted the packaged Next server
 * and died with
 *
 *   Error: An error occurred while loading instrumentation hook:
 *   Cannot find module './websocket'
 *   Require stack: .next/standalone/node_modules/ws/lib/stream.js
 *
 * `ws/lib/stream.js` requires './websocket' at module load, but Turbopack's
 * tracer never saw `ws` (the instrumentation hook loaded it via eval), so
 * the standalone copy shipped 10 of the 12 lib files. A rebuild could
 * "fix" it by copying one more file — the failure was nondeterministic and
 * only surfaced at boot, in front of the user.
 *
 * This gate runs AFTER `next build` and BEFORE packaging. It fails the build
 * (exit 1) when:
 *   1. the standalone tree is missing;
 *   2. `ws` cannot be REQUIRED from the standalone package (the exact crash);
 *   3. the required ws files are absent;
 *   4. BUILD_ID differs from .next/BUILD_ID (a stale standalone);
 *   5. no static chunks were copied (the panes would 404 their JS);
 *   6. `server.js` does not answer HTTP within the boot budget, or its log
 *      carries a MODULE_NOT_FOUND / instrumentation error.
 *
 * Usage: node scripts/verify-standalone.mjs [--no-boot]
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const WS_LIB = path.join(STANDALONE, 'node_modules', 'ws', 'lib');
const BOOT = !process.argv.includes('--no-boot');

let failures = 0;
function ok(name, detail = '') {
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  failures++;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function check(name, cond, detail = '') {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

// ── 1. the tree ────────────────────────────────────────────────────────────
check('standalone tree exists', fs.existsSync(STANDALONE), STANDALONE);
if (!fs.existsSync(STANDALONE)) {
  console.error('\nverify-standalone: run `next build` first.');
  process.exit(1);
}

// ── 2. ws REQUIRES from the standalone tree (the exact crash) ──────────────
{
  const req = createRequire(path.join(STANDALONE, 'package.json'));
  try {
    const ws = req('ws');
    check('require("ws") from the standalone tree', typeof ws === 'function' || typeof ws.WebSocketServer === 'function');
    check('WebSocketServer is constructible', typeof ws.WebSocketServer === 'function');
  } catch (e) {
    fail('require("ws") from the standalone tree', e?.message || String(e));
  }
}

// ── 3. the required files ─────────────────────────────────────────────────
for (const f of ['websocket.js', 'websocket-server.js', 'stream.js', 'receiver.js', 'sender.js']) {
  check(`ws/lib/${f} is packed`, fs.existsSync(path.join(WS_LIB, f)));
}

// ── 4. BUILD_ID parity (a stale standalone serves the wrong chunks) ────────
{
  const readId = (p) => { try { return fs.readFileSync(p, 'utf-8').trim(); } catch { return null; } };
  const a = readId(path.join(STANDALONE, '.next', 'BUILD_ID'));
  const b = readId(path.join(ROOT, '.next', 'BUILD_ID'));
  check('BUILD_ID matches .next/BUILD_ID', !!a && a === b, `${a ?? 'missing'} vs ${b ?? 'missing'}`);
}

// ── 5. static assets ──────────────────────────────────────────────────────
{
  const chunks = path.join(STANDALONE, '.next', 'static', 'chunks');
  let n = 0;
  try { n = fs.readdirSync(chunks).length; } catch { n = 0; }
  check('static chunks are copied', n > 50, `${n} chunks`);
}

// ── 6. boot smoke ─────────────────────────────────────────────────────────
async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function bootSmoke() {
  const port = await freePort();
  const log = [];
  const child = spawn(process.execPath, [path.join(STANDALONE, 'server.js')], {
    cwd: STANDALONE,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      OLYMPUS_ROOT: ROOT,
      // The WS bridge would fight a running dev app on 3738; the probe checks
      // the HTTP server, and the require above already proved the module.
      OLYMPUS_VERIFY_BOOT: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));

  const deadline = Date.now() + 60_000;
  let answered = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/olympus/build-info`, { signal: AbortSignal.timeout(3000) });
      if (res.status > 0) { answered = true; break; }
    } catch { /* not ready */ }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  try { child.kill('SIGKILL'); } catch { /* gone */ }
  await new Promise((r) => setTimeout(r, 300));

  const text = log.join('');
  check('standalone server.js answers HTTP', answered, answered ? '' : text.slice(-400));
  check('no MODULE_NOT_FOUND in the boot log', !/MODULE_NOT_FOUND|Cannot find module/.test(text), text.match(/Cannot find module[^\n]*/)?.[0] ?? 'clean');
  check('no instrumentation error in the boot log', !/loading instrumentation hook/i.test(text));
}

if (BOOT) await bootSmoke();
else ok('boot smoke skipped (--no-boot)');

if (failures > 0) {
  console.error(`\nverify-standalone: ${failures} check(s) FAILED — the packaged app would crash.`);
  process.exit(1);
}
console.log('\nverify-standalone: the standalone output is complete and boots.');
