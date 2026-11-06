/**
 * /api/olympus/screenshots — v0.0.85: the user's eyes on the live project.
 *
 * GET  ?slug=aime&viewport=mobile  → the last captured PNG (read auth).
 * POST { slug, viewports? }        → capture mobile + desktop now (write auth).
 *
 * The capture targets the project's OWN live preview (the manager/probe is the
 * source of truth). If the preview is not running, the route refuses with the
 * honest reason — it never photographs a different port or an old image.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { getProject } from '@/lib/project-context';
import { probeDevServer } from '@/lib/dev-server-probe';
import { capturePreview, screenshotFile, type CaptureResult, type ScreenshotViewport } from '@/lib/screenshot';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isViewport(value: unknown): value is ScreenshotViewport {
  return value === 'mobile' || value === 'desktop';
}

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;
  const slug = String(req.nextUrl.searchParams.get('slug') || '').trim();
  const viewport = req.nextUrl.searchParams.get('viewport');
  if (!slug || !isViewport(viewport)) {
    return NextResponse.json({ ok: false, error: 'slug and viewport=mobile|desktop are required' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const file = screenshotFile(slug, viewport);
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) throw new Error('empty');
    return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-store, max-age=0',
        'X-OLYMPUS-Captured-At': stat.mtime.toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: `no ${viewport} capture for ${slug} yet`, slug, viewport },
      { status: 404, headers: NO_CACHE_HEADERS },
    );
  }
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const slug = String(body?.slug || '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400, headers: NO_CACHE_HEADERS });
  const project = getProject(slug);
  if (!project) return NextResponse.json({ ok: false, error: `project '${slug}' not found` }, { status: 404, headers: NO_CACHE_HEADERS });

  const port = project.livePreviewPort || 3000;
  const probe = await probeDevServer(port, 2_000);
  if (!probe.running) {
    return NextResponse.json(
      { ok: false, error: `the live preview is not running on :${port} — start it from OLYMPUS first`, port, slug },
      { status: 409, headers: NO_CACHE_HEADERS },
    );
  }

  const requested: ScreenshotViewport[] = Array.isArray(body?.viewports) ? (body.viewports as unknown[]).filter(isViewport) : [];
  const viewports: ScreenshotViewport[] = requested.length > 0 ? [...new Set(requested)] : ['mobile', 'desktop'];
  const captures: CaptureResult[] = [];
  for (const viewport of viewports) {
    captures.push(await capturePreview(probe.url, viewport, screenshotFile(slug, viewport)));
  }
  const ok = captures.some((capture) => capture.ok);
  return NextResponse.json(
    {
      ok,
      slug,
      previewUrl: probe.url,
      captures,
      ...(ok ? {} : { error: captures.map((capture) => capture.error).filter(Boolean).join(' · ') || 'capture failed' }),
    },
    { status: ok ? 200 : 502, headers: NO_CACHE_HEADERS },
  );
}
