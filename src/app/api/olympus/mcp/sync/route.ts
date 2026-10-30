/**
 * POST /api/olympus/mcp/sync — canonicalize BOTH MCP registries.
 *
 * v0.0.24: this is no longer the old "add 22 broken entries" path. It:
 *   - normalizes every entry to the OpenCode v2 shape (type/command array/
 *     environment/numeric timeout);
 *   - materializes catalog entries that are missing (disabled by default);
 *   - writes only when something changed (idempotent — no config churn on
 *     every panel open);
 *   - backs up opencode.json before the first change.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { syncMcpConfig } from '@/lib/mcp-registry';
import { findOlympusRoot } from '@/lib/opencode-spawn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const root = findOlympusRoot();
    const result = syncMcpConfig({ olympusRoot: root });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500, headers: NO_CACHE_HEADERS });
    }
    return NextResponse.json({
      ok: true,
      changed: result.changed,
      added: result.added,
      normalized: result.normalized,
      total: result.total,
      backup: result.backup,
      // The detail rows are useful for the "Repair" affordance; cap them.
      details: result.details.filter((d) => d.action !== 'unchanged').slice(0, 40),
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
