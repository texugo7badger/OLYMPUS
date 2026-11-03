/**
 * POST /api/olympus/ui-references/learn — v0.0.61.
 *
 * A god that studies a NEW source inside a project can add it to the catalog
 * without a release: the row is validated, deduped against the 939 built-ins,
 * and appended to ~/.olympus/ui-references-user.json (0600). The References
 * tab merges it on the next load. The user can commit the file into the repo
 * later if they want it permanent.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UI_REFERENCES } from '@/lib/ui-references';
import { requireAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILE = path.join(process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'ui-references-user.json');
const LIBS = new Set(['originkit', 'skiper', 'magicui', 'aceternity']);

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch { /* invalid */ }
  const name = String(body?.name || '').trim().slice(0, 80);
  const demoUrl = String(body?.demoUrl || '').trim();
  const library = String(body?.library || '').trim();
  if (!name || !/^https:\/\//.test(demoUrl) || !LIBS.has(library)) {
    return NextResponse.json({ ok: false, error: 'name, an https demoUrl and a known library are required' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const id = String(body?.id || `${library}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`).slice(0, 80);
  const row = {
    id,
    name,
    library,
    category: String(body?.category || 'Uncategorized').trim().slice(0, 48),
    what: String(body?.what || 'A learned reference — study the source before adapting it.').trim().slice(0, 240),
    demoUrl,
    fetchLane: String(body?.fetchLane || `learned from ${demoUrl}`).trim().slice(0, 160),
    free: body?.free !== false,
  };
  try {
    let current: any = { references: [] };
    try { current = JSON.parse(fs.readFileSync(FILE, 'utf-8')); } catch { /* new file */ }
    const list: any[] = Array.isArray(current?.references) ? current.references : [];
    const dup = UI_REFERENCES.some((r) => r.id === id || r.demoUrl === demoUrl || r.name.toLowerCase() === name.toLowerCase())
      || list.some((r) => r.id === id || r.demoUrl === demoUrl || String(r.name).toLowerCase() === name.toLowerCase());
    if (dup) return NextResponse.json({ ok: true, duplicate: true, id }, { headers: NO_CACHE_HEADERS });
    list.push(row);
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ references: list }, null, 2) + '\n', { mode: 0o600 });
    return NextResponse.json({ ok: true, learned: row, total: UI_REFERENCES.length + list.length }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'write failed' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
