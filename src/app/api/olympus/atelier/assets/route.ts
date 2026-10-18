/**
 * GET /api/olympus/atelier/assets — #149: list the Media Vault.
 *   ?q=<query>  — the search lane (#150's wrap)
 *   ?limit=N    — cap (default 200)
 *   ?id=<id>    — the raw image bytes for one asset (served for the gallery)
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { listAssets, searchAssets, MEDIA_VAULT_DIR } from '@/lib/media-vault';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get('id');
  if (id) {
    // The raw image bytes (the gallery <img> src).
    try {
      const safe = id.replace(/[^a-zA-Z0-9-]/g, '');
      const dir = `${MEDIA_VAULT_DIR}/images`;
      const hit = fs.readdirSync(dir).find((f) => f.startsWith(safe) && f.replace(/\.[^.]+$/, '') === safe);
      if (!hit) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404, headers: NO_CACHE_HEADERS });
      const buf = fs.readFileSync(`${dir}/${hit}`);
      const mime = hit.endsWith('.jpg') ? 'image/jpeg' : hit.endsWith('.svg') ? 'image/svg+xml' : `image/${hit.split('.').pop()}`;
      return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' } });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 404, headers: NO_CACHE_HEADERS });
    }
  }
  const q = sp.get('q');
  const limit = Number(sp.get('limit') ?? 200);
  const assets = q ? searchAssets(q, limit) : listAssets(limit);
  return NextResponse.json({ ok: true, assets, total: assets.length }, { headers: NO_CACHE_HEADERS });
}
