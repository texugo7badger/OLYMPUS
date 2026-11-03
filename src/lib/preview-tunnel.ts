/**
 * preview-tunnel.ts — v0.0.63: the phone can SEE the project, not just the app.
 *
 * THE SPECIMEN: on the phone, `/m` built the preview URL as
 * `http://<window.location.hostname>:<livePreviewPort>`. Over the Cloudflare
 * tunnel the hostname is the tunnel's, the port is not exposed there, and the
 * page is HTTPS while the preview is HTTP — mixed content blocks it. The
 * "preview" button could never work remotely.
 *
 * This module manages ONE cloudflared quick tunnel PER preview port. The URL
 * is HTTPS, public but unguessable, and can be stopped from the phone. State
 * lives in `~/.olympus/preview-tunnels.json` (0600), so a tunnel survives an
 * app restart and a stale pid is never reported as running.
 *
 * LAN needs no tunnel: the phone on the same Wi-Fi opens
 * `http://<desktop-lan-ip>:<port>` directly.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { cloudflaredBinary } from './mobile-tunnel';

const HOME = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
const STATE = path.join(HOME, 'preview-tunnels.json');

export interface PreviewTunnelStatus {
  port: number;
  running: boolean;
  url: string | null;
  pid: number | null;
  startedAt: string | null;
  binary: string | null;
}

type StateFile = Record<string, { url: string; pid: number; startedAt: string }>;

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readState(): StateFile {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    return raw && typeof raw === 'object' ? raw as StateFile : {};
  } catch { return {}; }
}

function writeState(state: StateFile): void {
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  } catch { /* the tunnel still works for this process; the file is convenience */ }
}

export function previewTunnelStatus(port: number): PreviewTunnelStatus {
  const binary = cloudflaredBinary();
  const entry = readState()[String(port)];
  if (entry?.pid && alive(Number(entry.pid)) && typeof entry.url === 'string') {
    return { port, running: true, url: entry.url, pid: Number(entry.pid), startedAt: entry.startedAt ?? null, binary };
  }
  return { port, running: false, url: null, pid: null, startedAt: null, binary };
}

export function stopPreviewTunnel(port: number): PreviewTunnelStatus {
  const current = previewTunnelStatus(port);
  if (current.pid) {
    try { process.kill(-current.pid, 'SIGTERM'); } catch {
      try { process.kill(current.pid, 'SIGTERM'); } catch { /* gone */ }
    }
  }
  const state = readState();
  delete state[String(port)];
  writeState(state);
  return { ...current, running: false, url: null, pid: null };
}

export function stopAllPreviewTunnels(): void {
  for (const key of Object.keys(readState())) {
    const port = Number(key);
    if (Number.isFinite(port)) stopPreviewTunnel(port);
  }
}

/**
 * Start (or reuse) the quick tunnel for one preview port. Throws with an
 * honest message when cloudflared is absent or prints no URL in time.
 */
export async function startPreviewTunnel(port: number, timeoutMs = 30_000): Promise<PreviewTunnelStatus> {
  const current = previewTunnelStatus(port);
  if (current.running) return current;
  const binary = cloudflaredBinary();
  if (!binary) {
    throw new Error('cloudflared is not installed — install it in ~/.local/bin to open the preview outside the house (LAN preview works without it).');
  }
  const log = path.join(HOME, `preview-tunnel-${port}.log`);
  const offset = (() => { try { return fs.statSync(log).size; } catch { return 0; } })();
  fs.mkdirSync(HOME, { recursive: true });
  const out = fs.openSync(log, 'a');
  try {
    const child = spawn(binary, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
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
        const fd = fs.openSync(log, 'r');
        const size = fs.statSync(log).size;
        const buf = Buffer.alloc(Math.max(0, size - offset));
        fs.readSync(fd, buf, 0, buf.length, offset);
        fs.closeSync(fd);
        text = buf.toString('utf-8');
      } catch { /* keep polling */ }
      const url = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? null;
      if (url) {
        const state = readState();
        state[String(port)] = { url, pid: child.pid ?? 0, startedAt };
        writeState(state);
        return { port, running: true, url, pid: child.pid ?? null, startedAt, binary };
      }
      if (child.pid && !alive(child.pid)) break;
    }
    try { if (child.pid) process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
    throw new Error(`cloudflared did not print a URL within ${Math.round(timeoutMs / 1000)}s — see ${log}`);
  } finally {
    try { fs.closeSync(out); } catch { /* closed */ }
  }
}

/** The first non-internal IPv4 — the address a phone on the same Wi-Fi uses. */
export function lanAddress(): string | null {
  try {
    const nets = os.networkInterfaces();
    const candidates: string[] = [];
    for (const list of Object.values(nets)) {
      for (const net of list ?? []) {
        if (net.family !== 'IPv4' || net.internal) continue;
        if (/^169\.254\./.test(net.address)) continue; // link-local
        candidates.push(net.address);
      }
    }
    // Prefer the private ranges (a VPN/docker bridge is usually not the LAN).
    return candidates.find((a) => /^192\.168\./.test(a))
      ?? candidates.find((a) => /^10\./.test(a))
      ?? candidates.find((a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a))
      ?? candidates[0]
      ?? null;
  } catch { return null; }
}

/** True when the request arrived through a public host (the tunnel), not the LAN. */
export function isRemoteRequestHost(host: string | null, lan: string | null): boolean {
  const h = String(host || '').split(':')[0].toLowerCase();
  if (!h) return false;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return false;
  if (lan && h === lan.toLowerCase()) return false;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
  return true;
}
