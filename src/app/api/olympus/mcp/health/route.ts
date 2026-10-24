/**
 * GET /api/olympus/mcp/health — PROBE EVERY ENABLED MCP.
 *
 * THE SPECIMEN (2026-10-24): the user reported "vários MCPs não estão
 * carregando dentro do opencode v2". The MCP Configuration panel only showed
 * enabled/disabled — never alive/dead. A dead MCP (missing binary, wrong
 * package, auth required) silently broke every tool call that depended on it.
 *
 * This route spawns each enabled MCP, sends the JSON-RPC `initialize`
 * request, and waits up to HEALTH_TIMEOUT_MS for a response. The result is
 * cached for CACHE_TTL_MS so a panel open does not spawn 22 processes.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';

import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { listMcpServers } from '@/lib/mcp-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEALTH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;

interface McpHealthResult {
  name: string;
  registry: string;
  enabled: boolean;
  status: 'alive' | 'dead' | 'disabled' | 'unprobed';
  error?: string;
  latencyMs?: number;
  checkedAt: number;
}

let cache: { results: McpHealthResult[]; at: number } | null = null;

async function probeOne(name: string, cfg: { command?: string[]; url?: string }): Promise<McpHealthResult> {
  const checkedAt = Date.now();
  if (cfg.url) {
    const url = cfg.url || '';
    if (!url) return { name, registry: '', enabled: true, status: 'dead', error: 'no url', checkedAt };
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
      const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(to);
      return { name, registry: '', enabled: true, status: r.ok || r.status < 500 ? 'alive' : 'dead', latencyMs: Date.now() - checkedAt, checkedAt };
    } catch (e: any) {
      return { name, registry: '', enabled: true, status: 'dead', error: e?.message || String(e), checkedAt };
    }
  }

  const cmd = Array.isArray(cfg.command) ? cfg.command : (cfg.command ? [cfg.command] : []);
  if (cmd.length === 0) {
    return { name, registry: '', enabled: true, status: 'dead', error: 'no command', checkedAt };
  }
  return new Promise<McpHealthResult>((resolve) => {
    const t0 = Date.now();
    let settled = false;
    const child = spawn(cmd[0], cmd.slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      resolve({ name, registry: '', enabled: true, status: 'dead', error: `timeout after ${HEALTH_TIMEOUT_MS}ms`, latencyMs: Date.now() - t0, checkedAt });
    }, HEALTH_TIMEOUT_MS);

    let buf = '';
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString();
      for (const line of buf.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('{')) continue;
        try {
          const msg = JSON.parse(t);
          if (msg.jsonrpc === '2.0' && (msg.result || msg.error)) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { child.kill('SIGTERM'); } catch { /* gone */ }
            resolve({ name, registry: '', enabled: true, status: 'alive', latencyMs: Date.now() - t0, checkedAt });
            return;
          }
        } catch { /* not JSON yet */ }
      }
    });
    child.on('error', (e: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ name, registry: '', enabled: true, status: 'dead', error: e.message, checkedAt });
    });
    child.on('exit', (code: number | null) => {
      if (settled) return;
      // Send initialize if nothing was received yet.
      if (buf.trim().length === 0) {
        try {
          const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'olympus', version: '0.0.15' } } });
          child.stdin?.write(init + '\n');
        } catch { /* gone */ }
      }
    });

    // Send initialize immediately (most MCPs need it).
    try {
      const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'olympus', version: '0.0.15' } } });
      child.stdin?.write(init + '\n');
    } catch { /* gone */ }
  });
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ results: cache.results, cached: true, checkedAt: cache.at }, { headers: NO_CACHE_HEADERS });
  }

  const registry = listMcpServers();
  const results: McpHealthResult[] = [];

  const enabled = registry.servers.filter((s: { opencodeEnabled?: boolean }) => s.opencodeEnabled !== false);
  const concurrency = 5;
  for (let i = 0; i < enabled.length; i += concurrency) {
    const batch = enabled.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((s) =>
        probeOne(s.name, { command: s.command ? [s.command] : undefined, url: s.url }).then((r) => ({ ...r, registry: s.registry })),
      ),
    );
    results.push(...batchResults);
  }

  for (const s of registry.servers.filter((s: { opencodeEnabled?: boolean }) => s.opencodeEnabled === false)) {
    results.push({ name: s.name, registry: s.registry, enabled: false, status: 'disabled', checkedAt: now });
  }

  cache = { results, at: now };
  return NextResponse.json({ results, cached: false, checkedAt: now }, { headers: NO_CACHE_HEADERS });
}
