/**
 * POST /api/olympus/atelier/generate — #151 PYGMALION-GEN + W-B IMAGE-GEN
 * (v0.0.6-premio): text-to-image via the LIVE ladder. Body:
 * { prompt, width?, height?, seed?, model? }. The model resolves against
 * the keys in hand: the FREE anonymous Pollinations lane is the always-on
 * default; the BYOK rungs (SDXL-turbo / FLUX schnell / Nano Banana) unlock
 * behind FAL_KEY / GOOGLE_AI_KEY in the API Keys dialog. A locked rung is
 * refused HONESTLY (the key env named) — never a silent fallback that
 * pretends the premium lane ran. The generated image lands in the Media
 * Vault (the Argos describe tags it — the full loop).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { saveAsset } from '@/lib/media-vault';
import {
  readImageProviderKeys, availableImageModels, buildGenerationRequest,
  parseProviderResponse, resolveImageBytes,
} from '@/lib/image-providers';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { prompt, width, height, seed, model } = await req.json();
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ ok: false, error: 'prompt required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const keys = readImageProviderKeys();
    const catalog = availableImageModels(keys);
    const chosen = catalog.find((m) => m.id === model) ?? catalog.find((m) => m.available)!;
    if (!chosen.available) {
      return NextResponse.json({
        ok: false,
        error: `model '${chosen.id}' needs ${chosen.needsKey} (set it in the API Keys dialog — the free lane is always available)`,
        needsKey: chosen.needsKey,
      }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const built = buildGenerationRequest(chosen.id, { prompt, width, height, seed, keys });
    const r = await fetch(built.method === 'GET' ? built.url : built.url, {
      method: built.method,
      headers: built.headers,
      ...(built.body ? { body: built.body } : {}),
      signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        error: `${chosen.label} lane: HTTP ${r.status}${r.status === 429 ? ' (rate-limited — the free lane is ~1 img/15s; retry)' : ''}`,
      }, { status: 502, headers: NO_CACHE_HEADERS });
    }
    const raw = Buffer.from(await r.arrayBuffer());
    const parsed = parseProviderResponse(r.headers.get('content-type') || '', raw);
    const { buf, mime } = await resolveImageBytes(parsed);
    const asset = saveAsset(buf, mime, chosen.id);
    return NextResponse.json({
      ok: true, asset,
      model: chosen.id, label: chosen.label, tier: chosen.tier, priceHint: chosen.priceHint,
      prompt: prompt.trim(),
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
