/**
 * mcp-probe.ts — ONE MCP HANDSHAKE, THREE CONSUMERS (v0.0.24).
 *
 * The panel's health dot, the audit script and the test fixtures all probe
 * the SAME way:
 *   - spawn the FULL canonical `command` array (never `command[0]` alone);
 *   - merge `environment` (expanded);
 *   - send JSON-RPC `initialize`, then `tools/list`;
 *   - a remote server gets a real Streamable-HTTP POST, not a HEAD request
 *     (the old HEAD probe reported every remote MCP as "dead" with 405).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { McpCanonicalEntry } from './mcp-shape';
import { expandMcpPlaceholders } from './mcp-shape';

export type McpProbeStatus = 'alive' | 'dead' | 'disabled' | 'needs-auth' | 'needs-service' | 'unprobed';

export interface McpProbeResult {
  name: string;
  status: McpProbeStatus;
  latencyMs: number;
  tools?: number | null;
  error?: string;
  checkedAt: number;
}

export interface ProbeOptions {
  /** Default cwd for local servers (the lane/project root). */
  cwd?: string;
  /** Per-server timeout. Default 12s (context7 needs ~7s through the compressor). */
  timeoutMs?: number;
  /** Expand {env:}/{${}} placeholders before spawning. Default true. */
  expand?: boolean;
}

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'olympus-mcp-probe', version: '0.0.24' },
  },
};

function expanded(value: string, opts: ProbeOptions): string {
  return opts.expand === false ? value : expandMcpPlaceholders(value, { lane: opts.cwd });
}

function probeLocal(entry: McpCanonicalEntry, opts: ProbeOptions): Promise<McpProbeResult> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const startedAt = Date.now();
  const name = entry.name;
  const command = (entry.command ?? []).map((c) => expanded(c, opts));
  if (command.length === 0) {
    return Promise.resolve({ name, status: 'dead', latencyMs: 0, error: 'no command', checkedAt: Date.now() });
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(entry.environment ?? {})) env[k] = expanded(v, opts);
  const cwd = entry.cwd ? expanded(entry.cwd, opts) : opts.cwd;

  return new Promise((resolve) => {
    let settled = false;
    let tools: number | null = null;
    let stderr = '';
    let buf = '';
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command[0], command.slice(1), {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e: any) {
      resolve({ name, status: 'dead', latencyMs: Date.now() - startedAt, error: `spawn failed: ${e?.message || e}`, checkedAt: Date.now() });
      return;
    }

    const finish = (status: McpProbeStatus, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      resolve({
        name,
        status,
        latencyMs: Date.now() - startedAt,
        tools,
        error: error ? String(error).slice(0, 500) : undefined,
        checkedAt: Date.now(),
      });
    };

    const timer = setTimeout(() => {
      finish('dead', `timeout after ${timeoutMs}ms (no initialize reply)${stderr ? ` — ${stderr.slice(-200)}` : ''}`);
    }, timeoutMs);

    child.on('error', (e: Error) => finish('dead', e.message));
    child.on('exit', (code) => {
      if (settled) return;
      // olympus-craft's storm cap: the server is already running in another
      // OpenCode process and refused to spawn a duplicate. That is a healthy
      // server, not a dead one — the probe must not paint it red.
      if (/storm cap reached/i.test(stderr)) {
        finish('alive', 'already running (storm cap — probe did not spawn a duplicate)');
        return;
      }
      finish('dead', `exited early (code ${code})${stderr ? ` — ${stderr.slice(-200)}` : ''}`);
    });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      for (const line of buf.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('{')) continue;
        let msg: any;
        try { msg = JSON.parse(t); } catch { continue; }
        if (msg.id === 1 && (msg.result || msg.error)) {
          if (msg.error) { finish('dead', `initialize error: ${JSON.stringify(msg.error).slice(0, 300)}`); return; }
          try {
            child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
          } catch { finish('alive'); return; }
        }
        if (msg.id === 2) {
          tools = Array.isArray(msg.result?.tools) ? msg.result.tools.length : 0;
          finish('alive');
          return;
        }
      }
    });

    try {
      child.stdin?.write(JSON.stringify(INIT) + '\n');
    } catch (e: any) {
      finish('dead', `stdin write failed: ${e?.message || e}`);
    }
  });
}

async function probeRemote(entry: McpCanonicalEntry, opts: ProbeOptions): Promise<McpProbeResult> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const startedAt = Date.now();
  const name = entry.name;
  if (!entry.url) {
    return { name, status: 'dead', latencyMs: 0, error: 'no url', checkedAt: Date.now() };
  }
  const url = expanded(entry.url, opts);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  for (const [k, v] of Object.entries(entry.headers ?? {})) headers[k] = expanded(v, opts);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(INIT),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.status === 401 || res.status === 403) {
      return { name, status: 'needs-auth', latencyMs: Date.now() - startedAt, error: `HTTP ${res.status} — authorize the server (opencode mcp auth ${name})`, checkedAt: Date.now() };
    }
    if (!res.ok) {
      return { name, status: 'dead', latencyMs: Date.now() - startedAt, error: `HTTP ${res.status}`, checkedAt: Date.now() };
    }
    const text = await res.text();
    const ct = res.headers.get('content-type') ?? '';
    let parsed: any = null;
    if (ct.includes('text/event-stream')) {
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const msg = JSON.parse(payload);
          if (msg?.result || msg?.error) { parsed = msg; break; }
        } catch { /* keep scanning */ }
      }
    } else {
      try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    }
    if (parsed?.error) {
      return { name, status: 'dead', latencyMs: Date.now() - startedAt, error: `initialize error: ${JSON.stringify(parsed.error).slice(0, 300)}`, checkedAt: Date.now() };
    }
    if (parsed?.result) {
      return { name, status: 'alive', latencyMs: Date.now() - startedAt, tools: null, checkedAt: Date.now() };
    }
    // A reachable server that answered without an MCP result is still
    // reachable; report it alive but name the shape so the audit is honest.
    return { name, status: 'alive', latencyMs: Date.now() - startedAt, tools: null, error: 'reachable (no JSON-RPC result in the reply)', checkedAt: Date.now() };
  } catch (e: any) {
    clearTimeout(timer);
    const msg = e?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : (e?.message || String(e));
    return { name, status: 'dead', latencyMs: Date.now() - startedAt, error: msg, checkedAt: Date.now() };
  }
}

/** Probe one server. Disabled entries are never spawned. */
export async function probeMcp(entry: McpCanonicalEntry, opts: ProbeOptions = {}): Promise<McpProbeResult> {
  if (!entry.enabled) {
    return { name: entry.name, status: 'disabled', latencyMs: 0, checkedAt: Date.now() };
  }
  return entry.type === 'remote' ? probeRemote(entry, opts) : probeLocal(entry, opts);
}

/** Probe a batch with bounded concurrency (the panel never spawns 28 at once). */
export async function probeMcpBatch(
  entries: McpCanonicalEntry[],
  opts: ProbeOptions & { concurrency?: number } = {},
): Promise<McpProbeResult[]> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 8));
  const out: McpProbeResult[] = [];
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    out.push(...await Promise.all(batch.map((e) => probeMcp(e, opts))));
  }
  return out;
}

/** Resolve the probe cwd: the active project home, else the OLYMPUS root. */
export function defaultProbeCwd(root: string): string {
  return process.env.OLYMPUS_PROJECT_ROOT || process.env.OLYMPUS_WORKSPACE || root || process.cwd();
}

export function probeCwdForLane(lane: string | undefined, root: string): string {
  if (lane && path.isAbsolute(lane)) return lane;
  return defaultProbeCwd(root);
}

/**
 * Which MCP env vars are configured right now.
 *
 * Same stores the API Keys dialog writes: ~/.olympus/api-configs.json, the
 * legacy ~/.olympus/.env, and process.env. Used to render "locked" without
 * spawning a server that cannot authenticate.
 */
export function readConfiguredMcpKeys(home = process.env.HOME || ''): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string' && v.length > 0) keys.add(k);
  }
  const olympusHome = process.env.OLYMPUS_HOME || (home ? path.join(home, '.olympus') : '');
  if (!olympusHome) return keys;
  const configPath = path.join(olympusHome, 'api-configs.json');
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string' && v) keys.add(k);
  } catch { /* absent */ }
  const envPath = path.join(olympusHome, '.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq > 0) {
        const k = t.slice(0, eq).trim();
        const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (v) keys.add(k);
      }
    }
  } catch { /* absent */ }
  return keys;
}
