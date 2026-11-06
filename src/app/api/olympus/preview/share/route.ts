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
import { startPreviewTunnel, stopPreviewTunnel } from '@/lib/preview-tunnel';
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
  // v0.0.84 — the share link must be the ANIMATED app, not the HTML-rewriting
  // proxy. The proxy is fine for a static page, but a Next app needs its JS
  // chunks, API calls, client router and animations at the ROOT of the host.
  // The cloudflared quick tunnel gives exactly that, scoped to this preview
  // port; the OLYMPUS session/vault is never behind it.
  const tunnel = await startPreviewTunnel(st.port).catch(() => null);
  const directUrl = tunnel?.running ? tunnel.url : null;
  const { share, token } = createShare({ project, port: st.port, url: directUrl || st.url || `http://127.0.0.1:${st.port}/`, ttlHours });
  const proxyUrl = `${publicOrigin(req)}/share/preview/${token}`;
  const url = directUrl || proxyUrl;
  return NextResponse.json({
    ok: true,
    id: share.id,
    url,
    proxyUrl,
    mode: directUrl ? 'live-tunnel' : 'proxy',
    live: Boolean(directUrl),
    expiresAt: share.expiresAt,
    project,
    port: st.port,
    note: directUrl
      ? 'Live animated app through an unguessable quick tunnel. Revoke kills the tunnel; the OLYMPUS session/vault is never exposed.'
      : 'The preview tunnel is unavailable; this is the read-only proxy fallback.',
  }, { headers: NO_CACHE_HEADERS });
}

export async function DELETE(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const id = String(body?.id || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });
  const share = listShares().find((s) => s.id === id);
  const revoked = revokeShare(id);
  // v0.0.84 — revoke means the animated link dies too, not just the audit row.
  if (share?.port) {
    try { stopPreviewTunnel(share.port); } catch { /* the tunnel is best-effort */ }
  }
  return NextResponse.json({ ok: revoked, id, tunnelStopped: Boolean(share?.port) }, { status: revoked ? 200 : 404, headers: NO_CACHE_HEADERS });
}
