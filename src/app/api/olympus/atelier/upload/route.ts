/**
 * POST /api/olympus/atelier/upload — #149 MEDIA-VAULT-1: drop an image from
 * ANY AI (or the user's own) into the Media Vault. multipart/form-data:
 *   image: File (required) — png/jpg/gif/webp/bmp/svg
 *   source: string (optional) — 'midjourney' | 'dalle' | 'user' | ...
 *
 * Returns { ok, asset } — the entry lands pending-description; the client
 * then calls /atelier/describe to run the vision-describer VLM cascade.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { saveAsset } from '@/lib/media-vault';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
  // W-C FORGE-2D/3D: the model mimes — GLB/GLTF enter the vault (the 3D
  // lane's input channel; model-viewer renders them, the vision-describer honestly skips
  // the VLM pass for 3D binaries).
  'model/gltf-binary', 'model/gltf+json']);
const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('image');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ ok: false, error: 'image file required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const f = file as File;
    // The .glb sniff: browsers often send model files as
    // application/octet-stream (or empty) — the filename is the truth.
    const sniffed = /\.glb$/i.test(f.name) ? 'model/gltf-binary'
      : /\.gltf$/i.test(f.name) ? 'model/gltf+json'
      : f.type;
    if (!ALLOWED.has(sniffed)) {
      return NextResponse.json({ ok: false, error: `unsupported type: ${sniffed || f.type}` }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: `too large: ${f.size} > ${MAX_BYTES}` }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const source = typeof form.get('source') === 'string' ? String(form.get('source')) : 'upload';
    const buf = Buffer.from(await f.arrayBuffer());
    const asset = saveAsset(buf, sniffed, source);
    return NextResponse.json({ ok: true, asset, model: sniffed.startsWith('model/') ? sniffed : null }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
