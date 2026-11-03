/**
 * mobile-tunnel.ts — v0.0.60: the remote companion lane.
 *
 * A Cloudflare quick tunnel gives the phone an HTTPS URL that works OUTSIDE
 * the house, with no account and no stored credential. The process is
 * detached so it survives an app restart; the URL is written to
 * `~/.olympus/mobile-tunnel.json` (the pairing dialog reads it back).
 *
 * Security: the tunnel is public but unguessable; the session token still
 * gates every mutation and rides the mobile URL fragment. Stop the tunnel
 * from the pairing dialog when it is not needed.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const STATE = path.join(HOME, 'mobile-tunnel.json');
const LOG = path.join(HOME, 'mobile-tunnel.log');

export interface TunnelStatus {
  running: boolean;
  url: string | null;
  pid: number | null;
  startedAt: string | null;
  binary: string | null;
}

function findBinary(): string | null {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'cloudflared'),
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared',
  ];
  return candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) ?? null;
}

/** v0.0.63 — shared with the preview tunnel (one binary discovery, one truth). */
export function cloudflaredBinary(): string | null {
  return findBinary();
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function tunnelStatus(): TunnelStatus {
  const binary = findBinary();
  try {
    const raw = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    if (raw?.pid && alive(Number(raw.pid)) && typeof raw.url === 'string') {
      return { running: true, url: raw.url, pid: Number(raw.pid), startedAt: raw.startedAt ?? null, binary };
    }
  } catch { /* no state or dead pid */ }
  return { running: false, url: null, pid: null, startedAt: null, binary };
}

export function stopTunnel(): TunnelStatus {
  const current = tunnelStatus();
  if (current.pid) {
    try { process.kill(-current.pid, 'SIGTERM'); } catch {
      try { process.kill(current.pid, 'SIGTERM'); } catch { /* gone */ }
    }
  }
  try { fs.unlinkSync(STATE); } catch { /* absent */ }
  return { ...current, running: false, url: null, pid: null };
}

export async function startTunnel(timeoutMs = 30_000): Promise<TunnelStatus> {
  const current = tunnelStatus();
  if (current.running) return current;
  const binary = findBinary();
  if (!binary) {
    throw new Error('cloudflared is not installed. Install it in ~/.local/bin (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).');
  }
  const offset = (() => { try { return fs.statSync(LOG).size; } catch { return 0; } })();
  const out = fs.openSync(LOG, 'a');
  try {
    const child = spawn(binary, ['tunnel', '--url', 'http://127.0.0.1:3737', '--no-autoupdate'], {
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...process.env },
    });
    child.unref();
    const startedAt = new Date().toISOString();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 700));
      let text = '';
      try {
        const fd = fs.openSync(LOG, 'r');
        const size = fs.statSync(LOG).size;
        const buf = Buffer.alloc(Math.max(0, size - offset));
        fs.readSync(fd, buf, 0, buf.length, offset);
        fs.closeSync(fd);
        text = buf.toString('utf-8');
      } catch { /* keep polling */ }
      const url = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? null;
      if (url) {
        fs.mkdirSync(HOME, { recursive: true });
        fs.writeFileSync(STATE, JSON.stringify({ url, pid: child.pid, startedAt }, null, 2) + '\n', { mode: 0o600 });
        return { running: true, url, pid: child.pid ?? null, startedAt, binary };
      }
      if (child.pid && !alive(child.pid)) break;
    }
    try { if (child.pid) process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
    throw new Error('cloudflared did not print a URL within 30s — see ~/.olympus/mobile-tunnel.log');
  } finally {
    try { fs.closeSync(out); } catch { /* closed */ }
  }
}
