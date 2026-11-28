#!/usr/bin/env node
/**
 * boot-health.test.mjs — v0.0.98-11: the socket is the ownership proof.
 *
 * The 2026-11-23 audit found 174 EADDRINUSE lines and five orphan MCP git
 * children. This suite proves the two cures are wired:
 *
 *   1. a TCP listener is detected even when HTTP is not;
 *   2. the watchdog single-flights and probes the socket before spawn;
 *   3. the boot-health record and the /boot-health route exist;
 *   4. the warm-serve shutdown signals the PROCESS GROUP, not one PID;
 *   5. the orphan reaper only targets ppid 1 and >30 min.
 *
 * Run: npx tsx scripts/boot-health.test.mjs   (exit 0 = pass)
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OLYMPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function expect(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' — ' + String(detail).slice(0, 260)}`);
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function main() {
  const probe = await import(OLYMPUS + '/src/lib/port-probe.ts');
  const pg = await import(OLYMPUS + '/src/lib/process-group.ts');

  // ── 1. TCP says listening even without an HTTP handler ───────────────────
  {
    const server = net.createServer((sock) => sock.end());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    expect('a listening TCP socket is detected', await probe.isPortListening('127.0.0.1', port, 500));
    await new Promise((resolve) => server.close(resolve));
    const closed = await probe.probeHttp('http://127.0.0.1:1/health', 400);
    expect('a closed HTTP endpoint is not green', closed.ok === false && closed.status === null, JSON.stringify(closed));
    expect('a closed socket is not listening', !(await probe.isPortListening('127.0.0.1', port, 250)));
  }

  // ── 2. HTTP probe reports latency + status ───────────────────────────────
  {
    const server = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const r = await Promise.race([
      probe.probeHttp(`http://127.0.0.1:${port}/`, 800),
      sleep(2500).then(() => ({ ok: false, status: null, ms: 2500, error: 'test-timeout' })),
    ]);
    expect('HTTP probe is green', r.ok && r.status === 200 && r.ms >= 0, JSON.stringify(r));
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }

  // ── 3. process group owns the children ───────────────────────────────────
  {
    const code = `const {spawn}=require('child_process');
const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
console.log(c.pid);
setInterval(()=>{},1000);`;
    const parent = spawn(process.execPath, ['-e', code], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
    parent.unref();
    const childPid = await new Promise((resolve) => {
      let buf = '';
      parent.stdout.on('data', (d) => {
        buf += String(d);
        const line = buf.split('\n').find((l) => /^\d+$/.test(l.trim()));
        if (line) resolve(Number(line.trim()));
      });
      setTimeout(() => resolve(0), 2_000);
    });
    await sleep(250);
    expect('parent and child are alive before the group kill', alive(parent.pid) && alive(childPid), `${parent.pid}/${childPid}`);
    pg.killProcessGroup(parent.pid, 'SIGTERM');
    await sleep(800);
    expect('the group kill reaps the parent', !alive(parent.pid));
    expect('the group kill reaps the MCP-style child', !alive(childPid));
    if (alive(parent.pid)) pg.killProcessGroup(parent.pid, 'SIGKILL');
    if (alive(childPid)) { try { process.kill(childPid, 'SIGKILL'); } catch { /* gone */ } }
  }

  // ── 4. the reaper is bounded to orphaned, old processes ──────────────────
  {
    const src = fs.readFileSync(path.join(OLYMPUS, 'src/lib/process-group.ts'), 'utf-8');
    expect('the reaper only targets ppid 1', /row\.ppid !== 1/.test(src));
    expect('the reaper has a 30-minute floor by default', /olderThanSec = 1_800/.test(src));
    expect('the group kill prefers the negative PID', /process\.kill\(-pid, signal\)/.test(src));
  }

  // ── 5. the watchdog + boot health are wired ──────────────────────────────
  {
    const main = fs.readFileSync(path.join(OLYMPUS, 'electron/main.ts'), 'utf-8');
    const sess = fs.readFileSync(path.join(OLYMPUS, 'src/lib/opencode-session.ts'), 'utf-8');
    const route = fs.readFileSync(path.join(OLYMPUS, 'src/app/api/olympus/boot-health/route.ts'), 'utf-8');
    const ui = fs.readFileSync(path.join(OLYMPUS, 'src/components/olympus/logs-dashboard.tsx'), 'utf-8');
    expect('the watchdog checks the TCP port before spawn', /isPortListening\('127\.0\.0\.1', PORT/.test(main));
    expect('the spawn veto is TCP-only (HTTP 500 cannot force a second server)', /const portAlive = \(await isPortListening\('127\.0\.0\.1', PORT, 750\)\) \|\| \(await isNextAlreadyRunning\(\)\)/.test(main));
    expect('the watchdog is single-flight', /watchdogBusy/.test(main) && /finally[\s\S]{0,120}watchdogBusy = false/.test(main));
    expect('the boot-health record is written', /BOOT_HEALTH_FILE/.test(main) && /writeBootHealth/.test(main));
    expect('the warm-serve kill signals the group', /killProcessGroup\(serverChild/.test(sess) || /killProcessGroup\(pid/.test(sess));
    expect('the serve reaps orphan MCP children', /reapOrphanProcesses\('uvx mcp-server-git'/.test(sess));
    expect('the boot-health API reads the record + probes', /boot-health\.json/.test(route) && /isPortListening/.test(route));
    // v0.1.6 — Boot health moved from Logs to Settings → System & release.
    const settings = fs.readFileSync(path.join(OLYMPUS, 'src/components/olympus/settings-dialog.tsx'), 'utf-8');
    const systemCard = fs.readFileSync(path.join(OLYMPUS, 'src/components/olympus/system-health-card.tsx'), 'utf-8');
    expect('Boot health lives in Settings, not Logs', /SystemHealthCard/.test(settings) && /boot-health/.test(systemCard) && !/id: 'boot'/.test(ui));
  }

  console.log('');
  if (failures > 0) {
    console.log(`boot-health: ${failures} FAIL`);
    process.exit(1);
  }
  console.log('boot-health: all checks PASS');
}
await main();
