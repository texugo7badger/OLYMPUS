/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
// W-E MCP-UNIFY: the dual-store toggle — a .mcp.json entry flips
// mcp-state.json (the runtime gate); an opencode-native entry ALSO flips the
// surgical `enabled` flag in opencode.json (OpenCode reads it at spawn —
// without the flip the toggle would lie for that registry).
import { setMcpEnabled } from '@/lib/mcp-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_FILE = path.join(os.homedir(), '.olympus', 'mcp-state.json');

/**
 * GET /api/olympus/mcp/state
 *   Returns { enabled: { <mcpName>: boolean, ... } }
 *   MCPs not in the map default to enabled (first load; opencode-native
 *   entries default to their opencode.json `enabled` flag instead — the
 *   panel applies that).
 *
 * POST /api/olympus/mcp/state
 *   Body: { name: string, enabled: boolean }
 *   Updates the enabled state for a single MCP. Persists to
 *   ~/.olympus/mcp-state.json (the olympus-router runtime gate) AND — for
 *   opencode-native entries — the surgical enabled flip in opencode.json.
 */
export async function GET() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return NextResponse.json({ enabled: {} }, { headers: NO_CACHE_HEADERS });
    }
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    return NextResponse.json({ enabled: data.enabled || data || {} }, { headers: NO_CACHE_HEADERS });
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
      ok: true, name, enabled,
      registry: result.registry,
      opencodeFlagFlipped: result.opencodeFlagFlipped,
      state: result.state,
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
