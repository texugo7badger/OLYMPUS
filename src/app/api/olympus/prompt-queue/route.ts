/**
 * /api/olympus/prompt-queue — v0.0.64: the creative screen's shared queue.
 *
 * GET    ?project=aime        → the project's queued prompts (oldest first)
 * POST   { project, text }    → enqueue
 * PATCH  { id, status:'sent' } → mark sent (after Apollo accepted it)
 * DELETE ?id=...              → remove a queued item
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { listQueue, enqueuePrompt, markQueueItem, removeQueueItem } from '@/lib/prompt-queue';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;
  const project = req.nextUrl.searchParams.get('project') || undefined;
  return NextResponse.json({ ok: true, items: listQueue(project) }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch { /* invalid */ }
  const item = enqueuePrompt(String(body?.project || ''), String(body?.text || ''), Date.now(), {
    source: body?.source === 'creative' ? 'creative' : body?.source === 'terminal' ? 'terminal' : body?.source === 'phone' ? 'phone' : undefined,
    god: typeof body?.god === 'string' ? body.god : undefined,
  });
  if (!item) return NextResponse.json({ ok: false, error: 'project and text are required' }, { status: 400, headers: NO_CACHE_HEADERS });
  return NextResponse.json({ ok: true, item, items: listQueue(item.project) }, { headers: NO_CACHE_HEADERS });
}

export async function PATCH(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch { /* invalid */ }
  const id = String(body?.id || '');
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  const item = markQueueItem(id, 'sent');
  if (!item) return NextResponse.json({ ok: false, error: 'item not found' }, { status: 404, headers: NO_CACHE_HEADERS });
  return NextResponse.json({ ok: true, item }, { headers: NO_CACHE_HEADERS });
}

export async function DELETE(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  return NextResponse.json({ ok: removeQueueItem(id) }, { headers: NO_CACHE_HEADERS });
}
