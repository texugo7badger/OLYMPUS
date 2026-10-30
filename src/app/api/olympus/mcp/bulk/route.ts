/**
 * POST /api/olympus/mcp/bulk — THE ONE-CLICK CURES (v0.0.25).
 *
 * The au-user's arsenal state after enabling everything: 11 healthy,
 * 165 tools (over the 128 cap), 12 "dead" rows that were really absent
 * dependencies. Toggling 28 rows one by one is not a cure.
 *
 * Actions:
 *   reset-curated       enable the measured six, disable everything else
 *   disable-unavailable disable every enabled server whose dependency is absent
 *   enable-available    enable every server whose dependency IS satisfied
 *                       (never exceeds the tool budget silently — reports it)
 *
 * Body: { action: 'reset-curated' | 'disable-unavailable' | 'enable-available' }
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { CURATED_MCP_SERVERS, listMcpServers, setMcpEnabled } from '@/lib/mcp-registry';
import { readConfiguredMcpKeys } from '@/lib/mcp-probe';
import { checkMcpDependency } from '@/lib/mcp-deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    if (!['reset-curated', 'disable-unavailable', 'enable-available'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const { servers } = listMcpServers();
    const keys = readConfiguredMcpKeys();
    const changed: Array<{ name: string; enabled: boolean; reason?: string }> = [];

    const apply = (name: string, enabled: boolean, reason?: string) => {
      const r = setMcpEnabled(name, enabled);
      if (r.ok) changed.push({ name, enabled, reason });
    };

    if (action === 'reset-curated') {
      for (const s of servers) {
        const want = (CURATED_MCP_SERVERS as readonly string[]).includes(s.name);
        if (s.enabled !== want) apply(s.name, want, want ? 'curated' : 'not curated');
      }
    }

    if (action === 'disable-unavailable') {
      for (const s of servers) {
        if (!s.enabled) continue;
        const dep = await checkMcpDependency(s, process.env, keys);
        if (dep.status !== 'ok') apply(s.name, false, dep.detail);
      }
    }

    if (action === 'enable-available') {
      for (const s of servers) {
        if (s.enabled) continue;
        const dep = await checkMcpDependency(s, process.env, keys);
        if (dep.status === 'ok') apply(s.name, true, 'dependency satisfied');
      }
    }

    const after = listMcpServers().servers;
    return NextResponse.json({
      ok: true,
      action,
      changed,
      enabled: after.filter((s) => s.enabled).map((s) => s.name),
      total: after.length,
      /** The panel re-probes after a bulk change; a warm session keeps its tools. */
      restartHint: 'Start a new session (or Reset) so OpenCode reloads the tool list.',
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
