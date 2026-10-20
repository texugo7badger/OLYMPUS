/**
 * POST /api/olympus/atelier/edit — W-B IMAGE-GEN (v0.0.6-premio): the img2img
 * lane. Body: { assetId, prompt, model? }. The vault asset's binary rides to
 * the chosen editing rung: fal's Nano Banana edit (FAL_KEY) or Google's
 * Nano Banana inline-part edit (GOOGLE_AI_KEY) — the free anonymous lane
 * has no editing endpoint (honest: an edit request without keys names the
 * key, never a fake edit). The new image lands BACK in the vault as a new
 * asset (the lineage lives in the source frontmatter) — the vision-describer can tag it.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { MEDIA_VAULT_DIR, saveAsset } from '@/lib/media-vault';
import {
  readImageProviderKeys, availableImageModels, buildEditRequest,
  parseProviderResponse, resolveImageBytes,
} from '@/lib/image-providers';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { assetId, prompt, model } = await req.json();
    if (typeof assetId !== 'string' || !assetId) {
      return NextResponse.json({ ok: false, error: 'assetId required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ ok: false, error: 'prompt required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    // The source binary from the vault (id-matched, same resolution as inject).
    const safeId = assetId.replace(/[^a-zA-Z0-9-]/g, '');
    const imgDir = path.join(MEDIA_VAULT_DIR, 'images');
    let srcFile: string | null = null;
    try { srcFile = fs.readdirSync(imgDir).find((f) => f.replace(/\.[^.]+$/, '') === safeId) ?? null; } catch { srcFile = null; }
    if (!srcFile) {
      return NextResponse.json({ ok: false, error: `no vault asset '${assetId}'` }, { status: 404, headers: NO_CACHE_HEADERS });
    }
    const srcBuf = fs.readFileSync(path.join(imgDir, srcFile));
    const srcMime = srcFile.endsWith('.jpg') || srcFile.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    const imageDataUri = `data:${srcMime};base64,${srcBuf.toString('base64')}`;

    const keys = readImageProviderKeys();
    const catalog = availableImageModels(keys).filter((m) => m.supportsEdit);
    const chosen = catalog.find((m) => m.id === model) ?? catalog[0] ?? null;
    if (!chosen || !chosen.available) {
      const needs = chosen?.needsKey ?? 'FAL_KEY or GOOGLE_AI_KEY';
      return NextResponse.json({
        ok: false,
        error: `no editing lane available — set ${needs} in the API Keys dialog (the free anonymous lane has no img2img endpoint; the honest refusal)`,
        needsKey: chosen?.needsKey ?? null,
      }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const built = buildEditRequest(chosen.id, { prompt, imageDataUri, keys });
    const r = await fetch(built.url, {
      method: built.method,
      headers: built.headers,
      ...(built.body ? { body: built.body } : {}),
      signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: `${chosen.label} edit lane: HTTP ${r.status}` }, { status: 502, headers: NO_CACHE_HEADERS });
    }
    const raw = Buffer.from(await r.arrayBuffer());
    const parsed = parseProviderResponse(r.headers.get('content-type') || '', raw);
    const { buf, mime } = await resolveImageBytes(parsed);
    const asset = saveAsset(buf, mime, chosen.id);
    return NextResponse.json({
      ok: true, asset, sourceAssetId: safeId,
      model: chosen.id, label: chosen.label, tier: chosen.tier, priceHint: chosen.priceHint,
      prompt: prompt.trim(),
    }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
