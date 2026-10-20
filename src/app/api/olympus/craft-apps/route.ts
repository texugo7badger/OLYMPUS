/**
 * GET /api/olympus/craft-apps — W-G CRAFT-EMBED (v0.0.7): the Craft Apps
 * catalog + the LIVE probe truth (reachability + embedability per app —
 * the panel never trusts a stale manifest; this is the auto-update layer).
 * `?app=<id>` probes a single app (the panel's open click); the default
 * probes the full set in parallel.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { CRAFT_APPS, ARTCRAFT_STUDIO, probeCraftApp, probeAllCraftApps } from '@/lib/craft-apps';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const app = req.nextUrl.searchParams.get('app');
  if (app) {
    const target =
      app === ARTCRAFT_STUDIO.id ? ARTCRAFT_STUDIO.url
      : CRAFT_APPS.find((a) => a.id === app)?.url ?? null;
    if (!target) {
      return NextResponse.json({ ok: false, error: `unknown craft app '${app}'` }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const probe = await probeCraftApp(target);
    return NextResponse.json({ ok: true, probe }, { headers: NO_CACHE_HEADERS });
  }
  const probes = await probeAllCraftApps();
  return NextResponse.json({ ok: true, apps: CRAFT_APPS, studio: ARTCRAFT_STUDIO, probes }, { headers: NO_CACHE_HEADERS });
}
