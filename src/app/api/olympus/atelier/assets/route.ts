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
import { searchSemantic } from '@/lib/media-vault-vec';
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
      // W-C: the model mimes serve as themselves — a .glb is
      // model/gltf-binary (model-viewer's contract), never image/glb.
      const mime = hit.endsWith('.glb') ? 'model/gltf-binary'
        : hit.endsWith('.gltf') ? 'model/gltf+json'
        : hit.endsWith('.jpg') ? 'image/jpeg' : hit.endsWith('.svg') ? 'image/svg+xml' : `image/${hit.split('.').pop()}`;
      return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' } });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 404, headers: NO_CACHE_HEADERS });
    }
  }
  const q = sp.get('q');
  const limit = Number(sp.get('limit') ?? 200);
  if (q) {
    // #150: the semantic lane first (a Pollinations key indexes the vault);
    // without one — or on any miss — the honest keyword pass answers.
    const ids = await searchSemantic(q, limit).catch(() => null);
    if (ids) {
      const all = listAssets(1000);
      const byId = new Map(all.map((a) => [a.id, a]));
      const hits = ids.map((id) => byId.get(id)).filter(Boolean);
      return NextResponse.json({ ok: true, assets: hits, total: hits.length, mode: 'semantic' }, { headers: NO_CACHE_HEADERS });
    }
    const assets = searchAssets(q, limit);
    return NextResponse.json({ ok: true, assets, total: assets.length, mode: 'keyword' }, { headers: NO_CACHE_HEADERS });
  }
  const assets = listAssets(limit);
  return NextResponse.json({ ok: true, assets, total: assets.length }, { headers: NO_CACHE_HEADERS });
}
