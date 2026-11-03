/**
 * POST /api/olympus/mcp/add — v0.0.53.
 *
 * Adds ONE MCP server to the root `opencode.json` in the OpenCode v2 shape
 * (`type` + `command` array or `url` + `environment`/`headers`). Refuses a
 * duplicate name; never overwrites silently.
 *
 * Body: { name, type:'local'|'remote', command?: string[], url?: string,
 *         environment?: Record<string,string>, headers?: Record<string,string> }
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function configPath(): string {
  return path.join(process.cwd(), 'opencode.json');
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const name = String(body?.name || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,48}$/.test(name)) {
    return NextResponse.json({ ok: false, error: 'name must be a short slug (a-z0-9-)' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const type = body?.type === 'remote' ? 'remote' : 'local';
  let entry: any;
  if (type === 'local') {
    const command = Array.isArray(body?.command) ? body.command.map(String).filter(Boolean) : [];
    if (command.length === 0) return NextResponse.json({ ok: false, error: 'command is required for a local server' }, { status: 400, headers: NO_CACHE_HEADERS });
    entry = { type: 'local', enabled: true, command, ...(body?.environment && typeof body.environment === 'object' ? { environment: body.environment } : {}) };
  } else {
    const url = String(body?.url || '');
    if (!/^https?:\/\//.test(url)) return NextResponse.json({ ok: false, error: 'a remote server needs an http(s) url' }, { status: 400, headers: NO_CACHE_HEADERS });
    entry = { type: 'remote', enabled: true, url, ...(body?.headers && typeof body.headers === 'object' ? { headers: body.headers } : {}), oauth: false };
  }
  try {
    const file = configPath();
    const cfg = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!cfg.mcp || typeof cfg.mcp !== 'object') cfg.mcp = {};
    if (cfg.mcp[name]) {
      return NextResponse.json({ ok: false, error: `MCP "${name}" already exists — edit it in opencode.json instead of overwriting` }, { status: 409, headers: NO_CACHE_HEADERS });
    }
    cfg.mcp[name] = entry;
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmp, file);
    return NextResponse.json({ ok: true, name, entry }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
