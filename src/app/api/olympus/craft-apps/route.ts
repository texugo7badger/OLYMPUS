/**
 * GET /api/olympus/craft-apps — W-M CRAFT-VENDOR (v0.0.8): the Craft
 * Apps catalog with the VENDORED truth (what is downloaded, what is
 * served from the OLYMPUS origin, what has an update) + the live-probe
 * fallback lane (W-G, v0.0.7 — their site, only when nothing is
 * vendored). The first GET also starts the background auto-updater
 * (one timer per process; the user's directive: auto-update ON).
 *
 *   GET                     → { apps (catalog + vendor status), studio,
 *                              probes (the live fallback), disk }
 *   GET ?app=<id>           → one app: probe + vendor status (the open click)
 *   GET ?action=job&id=<id> → the install/update job the panel polls
 *   POST { action:'install', app, lane:'web'|'native' }   → { ok, jobId }
 *   POST { action:'update-all' }                           → { ok }
 *   POST { action:'launch', app, file? }                  → { ok, pid }
 *   POST { action:'exec', app, args }                      → the agent lane
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  CRAFT_APPS, ARTCRAFT_STUDIO, probeCraftApp, probeAllCraftApps,
} from '@/lib/craft-apps';
import {
  startVendorAutoUpdater, getVendorStatus, getJob, createJob,
  installWebApp, installNativeApp, autoUpdateSweep, launchNativeApp, execNativeApp,
} from '@/lib/craft-vendor';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // W-M: the auto-updater rides the first panel open (one timer, the
  // process-lazy guard is inside startVendorAutoUpdater).
  startVendorAutoUpdater();

  const action = req.nextUrl.searchParams.get('action');
  if (action === 'job') {
    const job = getJob(req.nextUrl.searchParams.get('id') || '');
    return NextResponse.json({ ok: !!job, job }, { headers: NO_CACHE_HEADERS });
  }

  const app = req.nextUrl.searchParams.get('app');
  if (app) {
    if (app === ARTCRAFT_STUDIO.id) {
      const probe = await probeCraftApp(ARTCRAFT_STUDIO.url);
      return NextResponse.json({ ok: true, probe }, { headers: NO_CACHE_HEADERS });
    }
    const target = CRAFT_APPS.find((a) => a.id === app);
    if (!target) {
      return NextResponse.json({ ok: false, error: `unknown craft app '${app}'` }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const probe = await probeCraftApp(target.url);
    const vendor = (await getVendorStatus()).find((s) => s.id === app) ?? null;
    return NextResponse.json({ ok: true, probe, vendor }, { headers: NO_CACHE_HEADERS });
  }

  const [probes, vendor] = await Promise.all([
    probeAllCraftApps(),
    getVendorStatus(req.nextUrl.searchParams.get('check') === '1'),
  ]);
  return NextResponse.json({ ok: true, apps: CRAFT_APPS, studio: ARTCRAFT_STUDIO, probes, vendor }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: any = null;
  try { body = await req.json(); } catch { /* the honest empty action */ }
  const action = body?.action;

  if (action === 'install') {
    const app = String(body?.app || '');
    const lane = body?.lane === 'native' ? 'native' : 'web';
    if (!CRAFT_APPS.find((a) => a.id === app)) {
      return NextResponse.json({ ok: false, error: `unknown craft app '${app}'` }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const job = createJob(app, lane);
    const run = lane === 'native' ? installNativeApp(app, job.id) : installWebApp(app, job.id);
    void run.catch(() => {});
    return NextResponse.json({ ok: true, jobId: job.id }, { headers: NO_CACHE_HEADERS });
  }

  if (action === 'update-all') {
    void autoUpdateSweep(true).catch(() => {});
    return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
  }

  if (action === 'launch') {
    const app = String(body?.app || '');
    const file = typeof body?.file === 'string' ? body.file : undefined;
    const r = launchNativeApp(app, file);
    return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: NO_CACHE_HEADERS });
  }

  if (action === 'exec') {
    const app = String(body?.app || '');
    const args: string[] = Array.isArray(body?.args) ? body.args.map(String) : [];
    const r = await execNativeApp(app, args);
    return NextResponse.json({ ok: r.ok, code: r.code, stdout: r.stdout, stderr: r.stderr }, { headers: NO_CACHE_HEADERS });
  }

  return NextResponse.json({ ok: false, error: `unknown action '${action ?? ''}'` }, { status: 400, headers: NO_CACHE_HEADERS });
}
