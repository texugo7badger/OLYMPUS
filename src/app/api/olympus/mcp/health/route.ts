/**
 * GET /api/olympus/mcp/health — PROBE EVERY ENABLED MCP, HONESTLY (v0.0.25).
 *
 * v0.0.24 fixed the probe itself (full command, environment, real remote
 * POST). v0.0.25 fixes the CLASSIFICATION, the specimen being the user's
 * panel: enabling `docker`, `postgres`, `kubernetes`, `mcp-gateway`, `rea`,
 * `serena`, `tamp` … painted them RED as "dead" when their dependency was
 * simply absent.
 *
 * Order of truth:
 *   1. disabled            → `disabled` (never spawned);
 *   2. dependency absent   → `needs-auth` / `needs-service` / `needs-binary` /
 *                            `needs-app` (never spawned — the panel stays fast);
 *   3. dependency present  → probe; `dead` is reserved for a REAL failure;
 *   4. optional server that fails → `optional-unavailable` (amber, not red).
 *
 * Also reports the tool budget: the provider registry caps at 128 tools, and
 * an all-on arsenal (165+) silently truncates. The panel renders the meter.
 *
 * Cached 60s; `?fresh=1` bypasses (the panel's Probe all button).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';

import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { listMcpServers, type McpRegistryEntry } from '@/lib/mcp-registry';
import { probeMcpBatch, readConfiguredMcpKeys, type McpProbeResult } from '@/lib/mcp-probe';
import { checkMcpDependency } from '@/lib/mcp-deps';
import { findOlympusRoot } from '@/lib/opencode-spawn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The provider-side registry cap (OpenCode/Anthropic-style tool limit). */
export const MCP_TOOL_BUDGET = 128;

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
      toolBudget: MCP_TOOL_BUDGET,
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
  const unavailable: McpProbeResult[] = [];

  for (const s of enabled) {
    const dep = await checkMcpDependency(s, process.env, keys);
    if (dep.status === 'ok') {
      toProbe.push(s);
    } else {
      unavailable.push({
        name: s.name,
        status: dep.status,
        latencyMs: 0,
        error: dep.detail,
        checkedAt: now,
      });
    }
  }

  const probed = await probeMcpBatch(toProbe, { cwd: root, timeoutMs: 12_000, concurrency: 4 });

  // An OPTIONAL server that fails is not a bug — it is an opt-in lane that
  // did not start. Red is reserved for a declared dependency that IS present
  // and still fails.
  const requiresBy = new Map(enabled.map((s) => [s.name, s.requires?.kind]));
  for (const r of probed) {
    if (r.status === 'dead' && requiresBy.get(r.name) === 'optional') {
      r.status = 'optional-unavailable';
    }
  }

  const results = [...probed, ...unavailable, ...disabled];
  cache = { results, at: now };

  return NextResponse.json({
    results,
    cached: false,
    checkedAt: now,
    summary: summarize(results),
    toolBudget: MCP_TOOL_BUDGET,
  }, { headers: NO_CACHE_HEADERS });
}

function summarize(results: McpProbeResult[]) {
  const enabled = results.filter((r) => r.status !== 'disabled');
  const unavailable = enabled.filter((r) =>
    r.status === 'needs-auth' || r.status === 'needs-service' ||
    r.status === 'needs-binary' || r.status === 'needs-app');
  const tools = enabled.reduce((n, r) => n + (r.status === 'alive' ? (r.tools ?? 0) : 0), 0);
  return {
    total: results.length,
    enabled: enabled.length,
    alive: enabled.filter((r) => r.status === 'alive').length,
    dead: enabled.filter((r) => r.status === 'dead').length,
    needsAuth: enabled.filter((r) => r.status === 'needs-auth').length,
    needsService: enabled.filter((r) => r.status === 'needs-service').length,
    needsBinary: enabled.filter((r) => r.status === 'needs-binary').length,
    needsApp: enabled.filter((r) => r.status === 'needs-app').length,
    unavailable: unavailable.length,
    optionalUnavailable: enabled.filter((r) => r.status === 'optional-unavailable').length,
    tools,
    toolBudget: MCP_TOOL_BUDGET,
    overBudget: tools > MCP_TOOL_BUDGET,
  };
}
