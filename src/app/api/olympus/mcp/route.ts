/**
 * GET /api/olympus/mcp?name=<mcp>
 *
 * The single-server detail used by god-detail chips + the MCP detail panel.
 * v0.0.24: reads the canonical merged registry (no duplicate owners), reports
 * the honest requirement, and checks the key stores the API Keys dialog
 * writes.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { listMcpServers } from '@/lib/mcp-registry';
import { readConfiguredMcpKeys } from '@/lib/mcp-probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const name = new URL(req.url).searchParams.get('name') || '';
    if (!name || !/^[a-z0-9-]+$/.test(name)) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid ?name=' }, { status: 400 });
    }
    const { servers } = listMcpServers();
    const entry = servers.find((s) => s.name === name);
    if (!entry) {
      return NextResponse.json({ ok: false, error: `MCP "${name}" not in any registry` }, { status: 404 });
    }

    const keys = readConfiguredMcpKeys();
    const requiredEnvVars = entry.requires?.kind === 'key' ? (entry.requires.envVars ?? []) : [];
    const configuredEnvVars: Record<string, boolean> = {};
    let allConfigured = true;
    for (const k of requiredEnvVars) {
      const present = keys.has(k);
      configuredEnvVars[k] = present;
      if (!present) allConfigured = false;
    }

    return NextResponse.json({
      ok: true,
      name,
      registry: entry.registry,
      runtime: entry.runtime,
      type: entry.type,
      command: entry.command,
      args: [], // canonical shape: the full command array is authoritative
      env: entry.environment ?? {},
      url: entry.url,
      headers: entry.headers,
      enabled: entry.enabled,
      comment: entry.description || '',
      description: entry.description || '',
      requiresApiKey: requiredEnvVars.length > 0,
      requiredEnvVars,
      requires: entry.requires,
      configIssues: entry.configIssues,
      note: entry.requires?.label,
      configuredEnvVars,
      allConfigured,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
