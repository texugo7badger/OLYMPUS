/**
 * /api/olympus/preview/share — v0.0.79: create, list and revoke share links.
 *
 * POST   { project, ttlHours? } → a scoped, expiring link to the running preview
 * GET    ?project               → the metadata (never the token/hash)
 * DELETE { id }                 → revoke (the record stays, revokedAt set)
 *
 * The link is a capability for ONE preview; it never carries the OLYMPUS
 * session. The public URL is built from the request host (the tunnel when the
 * request came through it), so the same call works locally and remotely.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { status as managerStatus } from '@/lib/dev-server-manager';
import { createShare, listShares, revokeShare } from '@/lib/preview-share';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function publicOrigin(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '') || 'http';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const project = req.nextUrl.searchParams.get('project') || undefined;
  return NextResponse.json({ ok: true, shares: listShares(project) }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const project = String(body?.project || '').trim();
  if (!project) return NextResponse.json({ ok: false, error: 'project is required' }, { status: 400 });

  const st = await managerStatus(project).catch(() => null);
  if (!st?.running || !st.port) {
    return NextResponse.json({ ok: false, error: 'the preview is not running — start it first' }, { status: 409 });
  }

  const ttlHours = Number(body?.ttlHours) || 24;
  const { share, token } = createShare({ project, port: st.port, url: st.url || `http://127.0.0.1:${st.port}/`, ttlHours });
  const url = `${publicOrigin(req)}/share/preview/${token}`;
  return NextResponse.json({
    ok: true,
    id: share.id,
    url,
    expiresAt: share.expiresAt,
    project,
    port: st.port,
  }, { headers: NO_CACHE_HEADERS });
}

export async function DELETE(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const id = String(body?.id || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });
  const revoked = revokeShare(id);
  return NextResponse.json({ ok: revoked, id }, { status: revoked ? 200 : 404, headers: NO_CACHE_HEADERS });
}
