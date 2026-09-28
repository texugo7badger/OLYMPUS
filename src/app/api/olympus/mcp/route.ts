/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
// MCP_API_REQUIREMENTS imported from @/lib/mcp-api-requirements (shared
// with the API Config dialog for consistent MCP grouping).
import { findMcpRequirement } from '@/lib/mcp-api-requirements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * MCP_API_REQUIREMENTS imported from @/lib/mcp-api-requirements.
 *
 * Each entry: { names: string[], envVars: McpEnvVarRequirement[], note?: string }
 * MCPs that share the same env var set are merged into a single entry so
 * the UI doesn't ask the user to enter the same credentials twice.
 */

/**
 * GET /api/olympus/mcp?name=<mcp>
 *
 * Returns the MCP metadata from .mcp.json (comment, command, args) plus
 * whether its required API key(s) are configured in:
 *   - ~/.olympus/api-configs.json
 *   - ~/.olympus/.env
 *   - process.env (fallback)
 *
 * Used by god-detail.tsx to render MCP chips + the mcp-detail-panel.
 */
export async function GET(req: NextRequest) {
  try {
    const name = new URL(req.url).searchParams.get('name') || '';
    if (!name || !/^[a-z0-9-]+$/.test(name)) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid ?name=' }, { status: 400 });
    }
    // Use process.cwd() instead of __dirname (ESM compatibility).
    // process.cwd() returns the project root in both `next dev` and `next build`.
    const root = process.cwd();
    const mcpJsonPath = path.join(/*turbopackIgnore: true*/ root, '.mcp.json');
    if (!fs.existsSync(mcpJsonPath)) {
      return NextResponse.json({ ok: false, error: '.mcp.json not found' }, { status: 404 });
    }
    const mcpJson = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    const mcpServers = mcpJson.mcpServers || mcpJson.servers || {};
    const entry = mcpServers[name];
    if (!entry) {
      return NextResponse.json({ ok: false, error: `MCP "${name}" not in .mcp.json` }, { status: 404 });
    }

    // Check API key configuration.
    const apiConfigsPath = path.join(os.homedir(), '.olympus', 'api-configs.json');
    const envPath = path.join(os.homedir(), '.olympus', '.env');
    let apiConfigs: Record<string, string> = {};
    if (fs.existsSync(apiConfigsPath)) {
      try { apiConfigs = JSON.parse(fs.readFileSync(apiConfigsPath, 'utf-8')); } catch { /* ignore */ }
    }
    let envFile: Record<string, string> = {};
    if (fs.existsSync(envPath)) {
      try {
        for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
          const t = line.trim();
          if (!t || t.startsWith('#')) continue;
          const eq = t.indexOf('=');
          if (eq < 0) continue;
          envFile[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        }
      } catch { /* ignore */ }
    }

    const requirement = findMcpRequirement(name);
    const requiresApiKey = !!requirement;
    const envVarKeys = requirement?.envVars.map(v => v.key) ?? [];
    const configuredEnvVars: Record<string, boolean> = {};
    let allConfigured = true;
    if (requirement) {
      for (const k of envVarKeys) {
        const present = !!(apiConfigs[k] || envFile[k] || process.env[k]);
        configuredEnvVars[k] = present;
        if (!present) allConfigured = false;
      }
    }

    return NextResponse.json({
      ok: true,
      name,
      command: entry.command,
      args: entry.args,
      env: entry.env,
      comment: entry._comment || '',
      requiresApiKey,
      requiredEnvVars: envVarKeys,
      note: requirement?.note,
      configuredEnvVars,
      allConfigured,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
