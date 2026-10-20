/**
 * GET /api/olympus/atelier/models — W-B IMAGE-GEN (v0.0.6-premio): the model
 * catalog for the gen box's selector — the ladder with live availability
 * (the keys in hand decide; no key values ever leave the server).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { readImageProviderKeys, availableImageModels } from '@/lib/image-providers';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const keys = readImageProviderKeys();
  const models = availableImageModels(keys).map((m) => ({
    id: m.id, label: m.label, tier: m.tier, priceHint: m.priceHint,
    provider: m.provider, available: m.available, needsKey: m.needsKey, supportsEdit: m.supportsEdit,
  }));
  return NextResponse.json({ ok: true, models }, { headers: NO_CACHE_HEADERS });
}
