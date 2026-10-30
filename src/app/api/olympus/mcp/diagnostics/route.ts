/**
 * GET /api/olympus/mcp/diagnostics — WHY a row is not green (v0.0.25).
 *
 * One JSON the user can read (or paste into an issue): per server, the
 * expanded command, cwd, required env keys with present/missing, the
 * dependency verdict, the probe result and the last error. Secrets are
 * never echoed — only their PRESENCE.
 *
 * Query: ?probe=1 also runs the probe (slower; the panel does not use it).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { listMcpServers } from '@/lib/mcp-registry';
import { expandMcpPlaceholders, type McpCanonicalEntry } from '@/lib/mcp-shape';
import { probeMcp, readConfiguredMcpKeys } from '@/lib/mcp-probe';
import { checkMcpDependency } from '@/lib/mcp-deps';
import { findOlympusRoot } from '@/lib/opencode-spawn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const doProbe = req.nextUrl.searchParams.get('probe') === '1';
    const root = (() => { try { return findOlympusRoot(); } catch { return process.cwd(); } })();
    const keys = readConfiguredMcpKeys();
    const { servers } = listMcpServers();

    const rows: Array<Record<string, unknown>> = [];
    for (const s of servers) {
      const dep = await checkMcpDependency(s, process.env, keys);
      const envKeys = Object.keys(s.environment ?? {});
      const required = s.requires?.kind === 'key' ? (s.requires.envVars ?? s.apiKeyEnvVars ?? []) : [];
      const row: Record<string, unknown> = {
        name: s.name,
        enabled: s.enabled,
        type: s.type,
        registry: s.registry,
        requires: s.requires ?? null,
        dependency: dep,
        configIssues: s.configIssues,
        command: (s.command ?? []).map((c) => expandMcpPlaceholders(c, { lane: root })),
        cwd: s.cwd ? expandMcpPlaceholders(s.cwd, { lane: root }) : root,
        url: s.url ?? null,
        environmentKeys: envKeys,
        requiredKeys: required,
        keysConfigured: Object.fromEntries(required.map((k) => [k, keys.has(k)])),
      };
      if (doProbe && s.enabled) {
        row.probe = await probeMcp(s as McpCanonicalEntry, { cwd: root, timeoutMs: 12_000 });
      }
      rows.push(row);
    }

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      root,
      total: rows.length,
      enabled: rows.filter((r: any) => r.enabled).length,
      rows,
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
