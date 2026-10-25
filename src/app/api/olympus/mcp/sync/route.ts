/**
 * POST /api/olympus/mcp/sync — SYNC ALL .mcp.json MCPs INTO opencode.json.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { findOlympusRoot } from '@/lib/opencode-spawn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUTH_REQUIRED = new Set(['fal', 'github', 'brave-search', 'figma', 'originkit', 'grafana']);
const SERVICE_REQUIRED = new Set(['comfyui', 'postgres', 'docker', 'kubernetes', 'playwright', 'chrome-devtools', 'blender']);

export async function POST() {
  const root = findOlympusRoot();
  const mcpJsonPath = path.join(root, '.mcp.json');
  const opencodeJsonPath = path.join(root, 'opencode.json');

  let mcpCfg: any;
  try {
    mcpCfg = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `cannot read .mcp.json: ${e.message}` }, { status: 500, headers: NO_CACHE_HEADERS });
  }

  const entries = mcpCfg.mcpServers || mcpCfg.servers || {};
  let ocCfg: any;
  try {
    ocCfg = JSON.parse(fs.readFileSync(opencodeJsonPath, 'utf-8'));
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `cannot read opencode.json: ${e.message}` }, { status: 500, headers: NO_CACHE_HEADERS });
  }

  if (!ocCfg.mcp || typeof ocCfg.mcp !== 'object') ocCfg.mcp = {};

  let added = 0;
  let skipped = 0;
  const results: Array<{ name: string; action: string; enabled: boolean }> = [];

  for (const [name, src] of Object.entries(entries as Record<string, any>)) {
    if (ocCfg.mcp[name]) {
      skipped++;
      results.push({ name, action: 'exists', enabled: ocCfg.mcp[name].enabled !== false });
      continue;
    }

    const translated: Record<string, unknown> = {};
    if (Array.isArray(src.command)) translated.command = src.command;
    else if (typeof src.command === 'string') translated.command = [src.command];
    if (Array.isArray(src.args)) translated.args = src.args;
    if (src.env && typeof src.env === 'object') translated.env = src.env;
    if (typeof src.url === 'string') translated.url = src.url;
    if (typeof src.type === 'string') translated.type = src.type;

    let enabled = true;
    if (AUTH_REQUIRED.has(name)) enabled = false;
    if (SERVICE_REQUIRED.has(name)) enabled = false;
    translated.enabled = enabled;

    ocCfg.mcp[name] = translated;
    added++;
    results.push({ name, action: 'added', enabled });
  }

  try {
    fs.writeFileSync(opencodeJsonPath, JSON.stringify(ocCfg, null, 2) + '\n');
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `cannot write opencode.json: ${e.message}` }, { status: 500, headers: NO_CACHE_HEADERS });
  }

  return NextResponse.json({
    ok: true,
    added,
    skipped,
    total: Object.keys(entries).length,
    results,
  }, { headers: NO_CACHE_HEADERS });
}
