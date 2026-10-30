/**
 * GET /api/olympus/mcp/health — PROBE EVERY ENABLED MCP (v0.0.24).
 *
 * The 2026-10-30 specimen: the panel spawned `npx` with no package (it sent
 * only `command[0]`), probed `.mcp.json` entries OpenCode never loads, and
 * reported every remote MCP dead via a HEAD request. The result was a wall
 * of red dots with vertical "timeout after 5000ms" tooltips.
 *
 * Now:
 *   - the registry is DEDUPED (28 entries, not 50);
 *   - only ENABLED servers are spawned;
 *   - the FULL canonical command + environment + cwd are used;
 *   - remote servers get a real JSON-RPC POST;
 *   - a missing API key is `needs-auth`, not `dead`.
 *
 * Cached 60s; `?fresh=1` bypasses the cache (the panel's Probe all button).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';

import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { listMcpServers, type McpRegistryEntry } from '@/lib/mcp-registry';
import { probeMcpBatch, readConfiguredMcpKeys, type McpProbeResult } from '@/lib/mcp-probe';
import { findOlympusRoot } from '@/lib/opencode-spawn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 60_000;

let cache: { results: McpProbeResult[]; at: number } | null = null;

export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get('fresh') === '1';
  const now = Date.now();
  if (!fresh && cache && now - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({
      results: cache.results,
      cached: true,
      checkedAt: cache.at,
      summary: summarize(cache.results),
    }, { headers: NO_CACHE_HEADERS });
  }

  const registry = listMcpServers();
  const keys = readConfiguredMcpKeys();
  const root = (() => { try { return findOlympusRoot(); } catch { return process.cwd(); } })();

  const disabled = registry.servers.filter((s) => !s.enabled).map((s) => ({
    name: s.name,
    status: 'disabled' as const,
    latencyMs: 0,
    checkedAt: now,
  }));

  const enabled = registry.servers.filter((s) => s.enabled);
  const toProbe: McpRegistryEntry[] = [];
  const locked: McpProbeResult[] = [];
  for (const s of enabled) {
    const required = s.requires?.kind === 'key' ? (s.requires.envVars ?? []) : [];
    const missing = required.filter((k) => !keys.has(k));
    if (missing.length > 0) {
      locked.push({
        name: s.name,
        status: 'needs-auth',
        latencyMs: 0,
        error: `needs ${missing.join(', ')} — register the key in API Keys`,
        checkedAt: now,
      });
    } else {
      toProbe.push(s);
    }
  }

  const probed = await probeMcpBatch(toProbe, { cwd: root, timeoutMs: 12_000, concurrency: 4 });
  const results = [...probed, ...locked, ...disabled];
  cache = { results, at: now };

  return NextResponse.json({
    results,
    cached: false,
    checkedAt: now,
    summary: summarize(results),
  }, { headers: NO_CACHE_HEADERS });
}

function summarize(results: McpProbeResult[]) {
  const enabled = results.filter((r) => r.status !== 'disabled');
  return {
    total: results.length,
    enabled: enabled.length,
    alive: enabled.filter((r) => r.status === 'alive').length,
    dead: enabled.filter((r) => r.status === 'dead').length,
    needsAuth: enabled.filter((r) => r.status === 'needs-auth').length,
    tools: enabled.reduce((n, r) => n + (r.status === 'alive' ? (r.tools ?? 0) : 0), 0),
  };
}
