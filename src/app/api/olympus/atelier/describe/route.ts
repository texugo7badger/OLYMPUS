/**
 * POST /api/olympus/atelier/describe — #149: run the vision-describer VLM cascade on a
 * vault asset. Body: { id: string } — the asset id from /atelier/upload.
 * Returns { ok, asset } with description/tags/colors filled, or the honest
 * cascade-exhaustion error.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { describeAsset, listAssets, type MediaAsset } from '@/lib/media-vault';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    // Resolve the asset (fresh read so the entry state is current).
    const asset = findAsset(id);
    if (!asset) {
      return NextResponse.json({ ok: false, error: `no asset '${id}' in the vault` }, { status: 404, headers: NO_CACHE_HEADERS });
    }
    const described = await describeAsset(asset);
    return NextResponse.json({ ok: true, asset: described }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 502, headers: NO_CACHE_HEADERS });
  }
}

function findAsset(id: string): MediaAsset | null {
  const all = listAssets(1000);
  return all.find((a) => a.id === id) ?? null;
}
