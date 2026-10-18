/**
 * POST /api/olympus/atelier/generate — #151 PYGMALION-GEN: text-to-image via
 * the generation cascade. Free first (Pollinations), the BYOK price ladder
 * behind keys (W2 continuation). Body: { prompt, width?, height?, seed? }.
 * The generated image lands in the Media Vault (the same Argos describe can
 * then tag it — the full loop).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { saveAsset } from '@/lib/media-vault';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { prompt, width, height, seed } = await req.json();
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ ok: false, error: 'prompt required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const w = Math.min(Math.max(Number(width) || 768, 256), 1536);
    const h = Math.min(Math.max(Number(height) || 768, 256), 1536);
    // THE FREE LANE: the Pollinations legacy endpoint — anonymous, ~1 img/15s,
    // no key. The cascade's paid rungs (SDXL-turbo/FLUX BYOK) land with the
    // key UX; the free tier carries today's release.
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.trim())}` +
      `?width=${w}&height=${h}&nologo=true` +
      (typeof seed === 'number' && Number.isFinite(seed) ? `&seed=${Math.floor(seed)}` : '');
    const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `Pollinations free lane: HTTP ${r.status} (rate-limited? retry in ~15s)` },
        { status: 502, headers: NO_CACHE_HEADERS },
      );
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get('content-type')?.startsWith('image/png') ? 'image/png' : 'image/jpeg';
    const asset = saveAsset(buf, mime, 'pollinations/flux');
    return NextResponse.json({ ok: true, asset, model: 'pollinations/flux (free)', prompt: prompt.trim() }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
