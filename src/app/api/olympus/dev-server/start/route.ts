/**
 * POST /api/olympus/dev-server/start — #100 (v0.0.6 MISSION-CONTROL-TRUE):
 * the Live Preview's durable host control. The panel (and any surface) can
 * start the managed dev server — the #86 manager IS the host (deps
 * install-first, patience windows, probe-verified claim, log tail on
 * failure). The response carries the probe evidence or the honest refusal
 * (#105: never a narrated "running").
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start as managerStart } from '@/lib/dev-server-manager';
import { getActiveProjectSlug } from '@/lib/project-context';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // v0.0.96 — a real quit must not race the walk into restarting the
    // preview it just stopped. The marker is cleared on the next boot.
    const stoppingFile = path.join(process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'stopping.json');
    if (fs.existsSync(stoppingFile)) {
      return NextResponse.json({ ok: false, error: 'OLYMPUS is quitting — the preview will not start.' }, { status: 409, headers: NO_CACHE_HEADERS });
    }
    const body = await req.json().catch(() => ({}));
    const slug = (typeof body?.slug === 'string' && body.slug) || getActiveProjectSlug();
    if (!slug) {
      return NextResponse.json({ ok: false, error: 'No active project to host a dev server for (select a project first).' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const port = typeof body?.port === 'number' && Number.isFinite(body.port) ? body.port : undefined;
    const result = await managerStart(slug, port);
    return NextResponse.json({ ok: result.ok, slug, result }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
