/**
 * GET /share/preview/[token]/[[...path]] — v0.0.79: the public preview link.
 *
 * The recipient opens this URL on a phone or PC and sees the project's live
 * preview — never the OLYMPUS session, the terminal, the vault or the shell.
 *
 * - the token is the capability (random, hashed at rest, expiring, revocable);
 * - HTML is rewritten so every root-relative asset/link stays inside the share
 *   prefix (`/share/preview/<token>/_next/...`);
 * - only GET/HEAD; no cookies, no auth beyond the token, `noindex`.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveShare, noteView, rewriteHtml } from '@/lib/preview-share';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function proxy(req: NextRequest, token: string, segs: string[]): Promise<NextResponse> {
  const share = resolveShare(token);
  if (!share) {
    return new NextResponse('This preview link is expired or was revoked.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    });
  }

  const targetPath = segs.map((s) => encodeURIComponent(s)).join('/');
  const search = req.nextUrl.search || '';
  const target = `http://127.0.0.1:${share.port}/${targetPath}${search}`;
  const prefix = `/share/preview/${token}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: { accept: req.headers.get('accept') || '*/*' },
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return new NextResponse('The preview is not answering right now.', {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  // A redirect inside the preview stays inside the share prefix.
  if (upstream.status >= 300 && upstream.status < 400) {
    const loc = upstream.headers.get('location') || '/';
    const next = loc.startsWith('/') ? `${prefix}${loc}` : loc;
    return new NextResponse(null, { status: upstream.status, headers: { location: next, 'cache-control': 'no-store' } });
  }

  const ct = upstream.headers.get('content-type') || 'application/octet-stream';
  if (ct.includes('text/html')) {
    const html = rewriteHtml(await upstream.text(), prefix);
    noteView(share.id);
    return new NextResponse(html, {
      status: upstream.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
        'referrer-policy': 'no-referrer',
      },
    });
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  return new NextResponse(body as unknown as BodyInit, {
    status: upstream.status,
    headers: {
      'content-type': ct,
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; path?: string[] }> }) {
  const { token, path: segs = [] } = await params;
  return proxy(req, token, segs);
}

export async function HEAD(req: NextRequest, { params }: { params: Promise<{ token: string; path?: string[] }> }) {
  const { token, path: segs = [] } = await params;
  return proxy(req, token, segs);
}
