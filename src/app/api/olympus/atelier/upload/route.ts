/**
 * POST /api/olympus/atelier/upload — #149 MEDIA-VAULT-1: drop an image from
 * ANY AI (or the user's own) into the Media Vault. multipart/form-data:
 *   image: File (required) — png/jpg/gif/webp/bmp/svg
 *   source: string (optional) — 'midjourney' | 'dalle' | 'user' | ...
 *
 * Returns { ok, asset } — the entry lands pending-description; the client
 * then calls /atelier/describe to run the Argos VLM cascade.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { saveAsset } from '@/lib/media-vault';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml']);
const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('image');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ ok: false, error: 'image file required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const f = file as File;
    if (!ALLOWED.has(f.type)) {
      return NextResponse.json({ ok: false, error: `unsupported type: ${f.type}` }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: `too large: ${f.size} > ${MAX_BYTES}` }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const source = typeof form.get('source') === 'string' ? String(form.get('source')) : 'upload';
    const buf = Buffer.from(await f.arrayBuffer());
    const asset = saveAsset(buf, f.type, source);
    return NextResponse.json({ ok: true, asset }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
