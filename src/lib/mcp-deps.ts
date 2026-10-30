/**
 * mcp-deps.ts — THE DEPENDENCY PREFLIGHT (v0.0.25).
 *
 * THE SPECIMEN (the user's panel): enabling `docker`, `postgres`, `kubernetes`,
 * `mcp-gateway`, `rea`, `serena`, `tamp` … painted them RED as "dead". They
 * were never broken — their DEPENDENCY is absent (no Docker daemon, no
 * DATABASE_URL, no cluster, no binary, no REAPER, no active project).
 *
 * This module answers one question BEFORE anything is spawned:
 *   "can this server possibly work on THIS machine, right now?"
 *
 * A server whose dependency is absent is reported with its honest status
 * (needs-auth / needs-service / needs-binary / needs-app) and is NOT
 * spawned — which also keeps the panel fast (no 12s timeouts per dead row).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { McpCanonicalEntry, McpServerRequirement } from './mcp-shape';
import type { McpProbeStatus } from './mcp-probe';
import { readConfiguredMcpKeys } from './mcp-probe';

export interface DependencyVerdict {
  /** 'ok' means "the declared dependency looks satisfied — probe it". */
  status: 'ok' | Extract<McpProbeStatus, 'needs-auth' | 'needs-service' | 'needs-binary' | 'needs-app'>;
  detail: string;
}

/** True when `bin` exists on PATH (fast, synchronous, no process spawn). */
export function whichSync(bin: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const dirs = (env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32'
    ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean)
    : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, bin + ext);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch { /* unreadable dir */ }
    }
  }
  return null;
}

function tcpReachable(host: string, port: number, timeoutMs = 700): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function execWithTimeout(cmd: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, encoding: 'utf-8' }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}`.trim() });
    });
  });
}

function envPresent(keys: string[], env: NodeJS.ProcessEnv): boolean {
  return keys.some((k) => typeof env[k] === 'string' && (env[k] as string).length > 0);
}

/**
 * The service/app dependency table. Every entry states what must be TRUE on
 * this machine before the server is spawned. Unknown kinds are treated as
 * optional (probe, never pre-block).
 */
async function checkService(name: string, env: NodeJS.ProcessEnv): Promise<DependencyVerdict> {
  switch (name) {
    case 'docker': {
      if (!whichSync('docker', env)) {
        return { status: 'needs-binary', detail: 'the Docker CLI is not on PATH' };
      }
      const r = await execWithTimeout('docker', ['info', '--format', '{{.ServerVersion}}'], 2_500);
      return r.ok
        ? { status: 'ok', detail: `Docker ${r.out.trim() || 'daemon'}` }
        : { status: 'needs-service', detail: 'the Docker daemon is not running (start Docker, then probe)' };
    }
    case 'postgres': {
      const keys = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL', 'PG_URL', 'PGHOST'];
      if (!envPresent(keys, env)) {
        return { status: 'needs-service', detail: 'no DATABASE_URL (or PG* connection) is configured' };
      }
      return { status: 'ok', detail: 'a database connection string is configured' };
    }
    case 'kubernetes': {
      const kubeconfig = env.KUBECONFIG || path.join(os.homedir(), '.kube', 'config');
      if (!fs.existsSync(kubeconfig)) {
        return { status: 'needs-service', detail: 'no kubeconfig (~/.kube/config) — no cluster is reachable' };
      }
      return { status: 'ok', detail: 'a kubeconfig is present' };
    }
    case 'comfyui': {
      const url = env.COMFYUI_URL || 'http://127.0.0.1:8188';
      try {
        const u = new URL(url);
        const reachable = await tcpReachable(u.hostname, Number(u.port || 80), 800);
        return reachable
          ? { status: 'ok', detail: `ComfyUI answers on ${u.host}` }
          : { status: 'needs-service', detail: `no ComfyUI server on ${u.host}` };
      } catch {
        return { status: 'needs-service', detail: 'COMFYUI_URL is not a valid URL' };
      }
    }
    case 'grafana': {
      // Key-gated first; the key kind is handled before this function.
      return { status: 'ok', detail: 'grafana credentials are configured' };
    }
    default:
      return { status: 'ok', detail: '' };
  }
}

async function checkApp(name: string, env: NodeJS.ProcessEnv): Promise<DependencyVerdict> {
  const bins: Record<string, string[]> = {
    godot: ['godot', 'godot4', 'Godot'],
    blender: ['blender'],
    rea: ['reaper', 'REAPER'],
  };
  const list = bins[name] ?? [];
  if (list.length === 0) return { status: 'ok', detail: '' };
  for (const bin of list) {
    if (whichSync(bin, env)) return { status: 'ok', detail: `${bin} found on PATH` };
  }
  const label = name === 'rea' ? 'REAPER' : name.charAt(0).toUpperCase() + name.slice(1);
  return { status: 'needs-app', detail: `${label} is not installed (or not on PATH)` };
}

/**
 * The preflight. `requires` is the registry's honest requirement metadata:
 *   key | service | binary | app | optional.
 */
export async function checkMcpDependency(
  entry: McpCanonicalEntry,
  env: NodeJS.ProcessEnv = process.env,
  keys: Set<string> = readConfiguredMcpKeys(),
): Promise<DependencyVerdict> {
  const req: McpServerRequirement | undefined = entry.requires;
  if (!req) return { status: 'ok', detail: '' };

  if (req.kind === 'key') {
    const required = req.envVars ?? (entry.apiKeyEnvVars ?? []);
    const missing = required.filter((k) => !keys.has(k));
    if (missing.length > 0) {
      return { status: 'needs-auth', detail: `needs ${missing.join(', ')} — add the key in API Keys` };
    }
    return { status: 'ok', detail: `${required.join(', ') || 'key'} configured` };
  }

  if (req.kind === 'binary') {
    const bin = req.binary || req.label.match(/`([^`]+)`/)?.[1] || entry.command?.[0] || '';
    if (bin && !whichSync(bin, env)) {
      return { status: 'needs-binary', detail: `the \`${bin}\` binary is not on PATH` };
    }
    return { status: 'ok', detail: bin ? `${bin} found` : '' };
  }

  if (req.kind === 'app') return checkApp(entry.name, env);
  if (req.kind === 'service') return checkService(entry.name, env);

  // 'optional' — always probeable; a failure is reported as optional, never dead.
  return { status: 'ok', detail: req.label || 'optional' };
}
