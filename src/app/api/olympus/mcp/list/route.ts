/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { listMcpServers } from '@/lib/mcp-registry';
import { findOlympusRoot } from '@/lib/opencode-spawn';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/mcp/list
 *
 * The DEDUPED merged registry (28 entries, never 50). Each entry carries:
 *   - the canonical runtime shape (type/command/environment/url/enabled);
 *   - `registry` ('mcpjson' | 'opencode');
 *   - `requires` — the honest reason a server is off/locked;
 *   - `configIssues` — legacy fields repaired by the v0.0.24 normalizer;
 *   - `apiKeyEnvVars`.
 *
 * Toggle state is the runtime `enabled` flag: the panel no longer overrides
 * it with the stale ~/.olympus/mcp-state.json.
 */
export async function GET() {
  try {
    const { servers } = listMcpServers();
    // The registry SOURCE, surfaced so a 24-vs-28 mismatch can never be a
    // mystery again: which opencode.json was read, and how many entries it had.
    let source: { root: string; opencodeJson: string; runtimeEntries: number; catalogEntries: number } | null = null;
    try {
      const root = findOlympusRoot();
      source = {
        root,
        opencodeJson: path.join(root, 'opencode.json'),
        runtimeEntries: servers.filter((s) => s.runtime).length,
        catalogEntries: servers.filter((s) => s.catalog).length,
      };
    } catch { /* source is informational only */ }
    return NextResponse.json({
      servers,
      total: servers.length,
      enabled: servers.filter((s) => s.enabled).length,
      source,
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
