/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
// Shared MCP API requirements from @/lib/mcp-api-requirements.
import { findMcpRequirement, getMcpEnvVarKeys } from '@/lib/mcp-api-requirements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OLYMPUS_ROOT = process.env.OLYMPUS_ROOT || process.cwd();
const STATE_FILE = path.join(os.homedir(), '.olympus', 'mcp-state.json');

/**
 * MCP_API_REQUIREMENTS imported from @/lib/mcp-api-requirements.
 * See that file for the full structured data (labels, URLs, grouping).
 */

/**
 * GET /api/olympus/mcp/list
 *
 * Returns the full list of MCP servers from .mcp.json, enriched with:
 *   - requiresApiKey: boolean (true if the MCP is in MCP_API_REQUIREMENTS)
 *   - apiKeyEnvVars: string[] (the env vars it needs)
 *   - description: string (human-readable, derived from the config)
 *
 * Does NOT include enabled/disabled state — that comes from /api/olympus/mcp/state.
 */
export async function GET() {
  try {
    const mcpPath = path.join(OLYMPUS_ROOT, '.mcp.json');
    if (!fs.existsSync(mcpPath)) {
      return NextResponse.json({ ok: false, error: '.mcp.json not found' }, { status: 404, headers: NO_CACHE_HEADERS });
    }
    const cfg = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
    const servers = cfg.mcpServers || cfg.servers || {};

    const list = Object.entries(servers).map(([name, conf]: [string, any]) => {
      const req = findMcpRequirement(name);
      const requiresApiKey = !!req;
      const apiKeyEnvVars = getMcpEnvVarKeys(name);
      // Build a short description from the command/URL
      let description = '';
      if (conf.url) {
        description = `Remote: ${conf.url}`;
      } else if (conf.command) {
        description = `Local: ${conf.command}`;
      } else if (typeof conf === 'string') {
        description = `Wrapped: ${conf}`;
      }
      return {
        name,
        command: conf.command,
        url: conf.url,
        description,
        requiresApiKey,
        apiKeyEnvVars,
      };
    });

    return NextResponse.json({ servers: list }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
