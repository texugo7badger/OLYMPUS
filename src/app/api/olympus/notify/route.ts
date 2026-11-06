/**
 * /api/olympus/notify — v0.0.32 (Epic M): the tray notification bridge.
 *
 * POST { type, title, body } → one line appended to the desktop-notifications
 * JSONL the Electron main tails. Any surface can call it (routes, walker,
 * external tools) with no IPC and no renderer dependency.
 *
 * GET ?limit=20 → the recent events (debug / a future preferences panel).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse, NextRequest } from 'next/server';
import fs from 'node:fs';
import { appendDesktopNotify, isNotifyType, readDesktopNotifications, notifyFilePath } from '@/lib/desktop-notify';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { requireAuth, requireReadAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // v0.0.85 — the phone reads this same feed; one read gate for both.
  const authError = requireReadAuth(req);
  if (authError) return authError;
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 20));
  return NextResponse.json({ ok: true, events: readDesktopNotifications(limit) }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  if (!isNotifyType(body?.type)) {
    return NextResponse.json({ ok: false, error: `type must be one of ready|error|design|walk|compact|curate` }, { status: 400 });
  }
  const ok = appendDesktopNotify({
    type: body.type,
    title: typeof body?.title === 'string' ? body.title : 'OLYMPUS',
    body: typeof body?.body === 'string' ? body.body : '',
    ...(typeof body?.hop === 'string' ? { hop: body.hop } : {}),
    ...(typeof body?.god === 'string' ? { god: body.god } : {}),
    ...(typeof body?.slug === 'string' ? { slug: body.slug } : {}),
    ...(typeof body?.status === 'string' ? { status: body.status } : {}),
  });
  return NextResponse.json({ ok }, { headers: NO_CACHE_HEADERS });
}

/** v0.0.52 — clear the archive so a stale badge cannot survive a restart. */
export async function DELETE(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  try {
    fs.writeFileSync(notifyFilePath(), '', 'utf-8');
    return NextResponse.json({ ok: true, cleared: true }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
