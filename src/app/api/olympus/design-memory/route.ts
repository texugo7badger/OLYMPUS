/**
 * /api/olympus/design-memory — v0.0.43 (R43-04).
 *
 * GET    ?project=<slug> → { ok, memory: DesignMemoryEntry[] }
 * POST   { id, name, library?, category?, demoUrl?, note?, projectSlug? }
 * DELETE { id, projectSlug? }
 *
 * Local, bounded and atomic. No provider, no cost.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { listDesignMemory, removeDesignMemory, saveDesignMemory } from '@/lib/design-memory';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get('project');
  return NextResponse.json({ ok: true, memory: listDesignMemory(project) }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.id || !body?.name) {
      return NextResponse.json({ ok: false, error: 'id and name are required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const entry = saveDesignMemory(body);
    return NextResponse.json({ ok: true, entry }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function DELETE(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  const removed = removeDesignMemory(String(body.id), body.projectSlug ? String(body.projectSlug) : null);
  return NextResponse.json({ ok: true, removed }, { headers: NO_CACHE_HEADERS });
}
