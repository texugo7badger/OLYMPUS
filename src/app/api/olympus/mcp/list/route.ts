/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
// W-E MCP-UNIFY: the merged registry — .mcp.json AND the opencode.json mcp
// block (godot/blender/comfyui/rea become visible, "like the others").
import { listMcpServers } from '@/lib/mcp-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/mcp/list
 *
 * The FULL list of MCP servers from BOTH registries, each entry tagged with
 * its `registry` (mcpjson | opencode) and — for opencode-native entries —
 * the honest `opencodeEnabled` default from opencode.json. Enriched with
 * requiresApiKey / apiKeyEnvVars / description (the _comment or
 * _olympus_note). Does NOT include toggle state — that comes from
 * /api/olympus/mcp/state.
 */
export async function GET() {
  try {
    const { servers } = listMcpServers();
    return NextResponse.json({ servers }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
