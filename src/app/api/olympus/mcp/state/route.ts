/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_FILE = path.join(os.homedir(), '.olympus', 'mcp-state.json');

/**
 * GET /api/olympus/mcp/state
 *   Returns { enabled: { <mcpName>: boolean, ... } }
 *   MCPs not in the map default to enabled (first load).
 *
 * POST /api/olympus/mcp/state
 *   Body: { name: string, enabled: boolean }
 *   Updates the enabled state for a single MCP. Persists to ~/.olympus/mcp-state.json.
 *   The olympus-router plugin reads this file at runtime to block disabled MCPs.
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

    // Load existing state
    let state: Record<string, boolean> = {};
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        state = data.enabled || data || {};
      }
    } catch {}

    // Update + persist
    state[name] = enabled;
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ enabled: state }, null, 2), 'utf-8');

    return NextResponse.json({ ok: true, name, enabled, state }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
