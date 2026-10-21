/**
 * GET /api/olympus/craft-apps/serve/[...path] — W-M CRAFT-VENDOR
 * (v0.0.8): the OLYMPUS-origin static server for the vendored web
 * builds. `<app>/<file…>` resolves inside ~/.olympus/craft-apps/web/
 * <app>/current (the traversal guard is absolute — resolve + root
 * prefix; the serve root is the only window). The .wasm MIME is
 * load-bearing: a WebAssembly build served as octet-stream dies in the
 * embed. Nothing vendored → the honest 404 JSON (the panel offers the
 * Get button, never a dead frame).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { getServeFile } from '@/lib/craft-vendor';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segs } = await params;
  const [appId, ...rest] = segs ?? [];
  if (!appId) {
    return NextResponse.json({ ok: false, error: 'the serve lane is /craft-apps/serve/<app>/<file>' }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  const file = getServeFile(appId, (rest ?? []).join('/'));
  if (!file) {
    return NextResponse.json({ ok: false, error: `'${appId}' is not vendored — download it in the Craft apps pane` }, { status: 404, headers: NO_CACHE_HEADERS });
  }
  const stream = Readable.toWeb(createReadStream(file.abs)) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    headers: {
      'Content-Type': file.mime,
      'Cross-Origin-Resource-Policy': 'same-origin',
      ...NO_CACHE_HEADERS,
    },
  });
}
