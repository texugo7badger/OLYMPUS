/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { listMcpServers, setMcpEnabled } from '@/lib/mcp-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/mcp/state
 *   Returns the RUNTIME enabled map (the truth OpenCode reads), not the
 *   legacy mcp-state.json. Kept for API compatibility.
 *
 * POST /api/olympus/mcp/state
 *   Body: { name: string, enabled: boolean }
 *   Writes the canonical opencode.json entry + ~/.olympus/mcp-state.json
 *   (the per-tool-call gate). A catalog-only entry is materialized.
 */
export async function GET() {
  try {
    const { servers } = listMcpServers();
    const enabled: Record<string, boolean> = {};
    for (const s of servers) enabled[s.name] = s.enabled;
    return NextResponse.json({ enabled }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, enabled } = body;
    if (typeof name !== 'string' || typeof enabled !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'Missing or invalid { name, enabled }' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const result = setMcpEnabled(name, enabled);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error || 'toggle failed' }, { status: 500, headers: NO_CACHE_HEADERS });
    }
    return NextResponse.json({
      ok: true,
      name,
      enabled,
      registry: result.registry,
      opencodeFlagFlipped: result.opencodeFlagFlipped,
      state: result.state,
      /** OpenCode reads the config at spawn; a warm session keeps the old list. */
      restartHint: 'The running OpenCode session keeps its current tool list — start a new session (or Reset) to apply the change.',
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
