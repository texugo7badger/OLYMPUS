/**
 * GET  /api/olympus/atelier/deeplink — #154: list the detected targets.
 * POST /api/olympus/atelier/deeplink — { target: 'artcraft'|'godot'|...,
 * assetId? } — open the asset in the external tool (spawn) or hand the
 * web fallback URL (the renderer opens it in the default browser).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { detectDeeplinkTargets, openExternal } from '@/lib/deeplink';
import { MEDIA_VAULT_DIR } from '@/lib/media-vault';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, targets: detectDeeplinkTargets() }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const { target, assetId } = await req.json();
    if (typeof target !== 'string' || !target) {
      return NextResponse.json({ ok: false, error: 'target required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    let assetPath: string | undefined;
    if (typeof assetId === 'string' && assetId) {
      const safe = assetId.replace(/[^a-zA-Z0-9-]/g, '');
      const dir = path.join(MEDIA_VAULT_DIR, 'images');
      try {
        const hit = fs.readdirSync(dir).find((f) => f.replace(/\.[^.]+$/, '') === safe);
        if (hit) assetPath = path.join(dir, hit);
      } catch { /* no asset */ }
    }
    const result = openExternal(target, assetPath);
    const res: Record<string, unknown> = { ok: true, result: result.kind, target: result.target.label };
    if (result.kind === 'web') res.url = result.url;
    if (result.kind === 'spawned') res.arg = result.arg;
    if (result.kind === 'missing') res.hint = `not detected on this box — install it or use the web lane`;
    return NextResponse.json(res, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
