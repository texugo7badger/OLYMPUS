/**
 * GET /api/olympus/boot-health — v0.0.98-11.
 *
 * One read for the Boot Health screen: the app's own health latency, the
 * Electron-written boot record (Next PID, watchdog respawns), the OpenCode
 * port, and the MCP git children that used to survive shutdown.
 *
 * No secrets. No process is started here; every probe is read-only.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isPortListening, probeHttp } from '@/lib/port-probe';
import { listProcesses } from '@/lib/process-group';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function home(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T; } catch { return fallback; }
}

export async function GET() {
  const port = Number(process.env.PORT || process.env.OLYMPUS_PORT || 3737);
  const opencodePort = Number(process.env.OLYMPUS_OPENCODE_PORT || 3777);
  const boot = readJson<any>(path.join(home(), 'boot-health.json'), null);
  const health = await probeHttp(`http://127.0.0.1:${port}/api/olympus/health`, 1_800);
  const portAlive = await isPortListening('127.0.0.1', port, 750);
  const opencodeAlive = await isPortListening('127.0.0.1', opencodePort, 500);
  let mcpGit: Array<{ pid: number; ppid: number; etimes: number }> = [];
  try {
    mcpGit = listProcesses('uvx mcp-server-git', 20).map((p) => ({ pid: p.pid, ppid: p.ppid, etimes: p.etimes }));
  } catch { /* read-only evidence */ }
  let errorLog: { bytes: number; rotated: boolean; lastErrorAt: string | null } = { bytes: 0, rotated: false, lastErrorAt: null };
  try {
    const file = path.join(home(), 'errors.log');
    const st = fs.statSync(file);
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    const last = lines.length ? (() => { try { return JSON.parse(lines[lines.length - 1]); } catch { return null; } })() : null;
    errorLog = {
      bytes: st.size,
      rotated: fs.existsSync(`${file}.1`),
      lastErrorAt: typeof last?.ts === 'string' ? last.ts : null,
    };
  } catch { /* no log yet */ }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    app: {
      version: boot?.appVersion || (() => { try { return fs.readFileSync(path.join(process.cwd(), 'VERSION'), 'utf-8').trim(); } catch { return 'unknown'; } })(),
      port,
      portAlive,
      health,
      mode: boot?.mode ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    },
    boot: boot ? {
      at: boot.at ?? null,
      bootId: boot.bootId ?? null,
      electronPid: boot.electronPid ?? null,
      nextPid: boot.nextPid ?? null,
      nextExternal: boot.nextExternal === true,
      watchdogRespawns: Number(boot.watchdogRespawns ?? 0),
      lastRespawnAt: boot.lastRespawnAt ?? null,
      lastWatchdogAt: boot.lastWatchdogAt ?? null,
    } : null,
    opencode: { port: opencodePort, alive: opencodeAlive },
    mcpGit,
    errorLog,
  });
}
