/**
 * /api/olympus/atlas/patrol — v0.0.87: Atlas watches the parks.
 *
 * GET  ?slug=aime            → the deterministic patrol (parked + stuck)
 * POST { slug, action: 'think',   hopId } → Atlas deep-reads one finding
 * POST { slug, action: 'escalate', hopId } → Apollo decides/replans
 *
 * The deterministic scan is free and runs on every tasks poll. The model
 * turns are explicit (the UI's "ask Atlas" / "ask Apollo"), never a hidden
 * turn on every park.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { getVaultRoot } from '@/lib/vault-root';
import { patrolLane, askAtlas, askApollo } from '@/lib/atlas-patrol';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function laneFor(slug: string): string | null {
  const safe = String(slug || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) return null;
  const lane = path.join(getVaultRoot(), '02_Projects', safe);
  return fs.existsSync(lane) ? lane : null;
}

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const slug = String(req.nextUrl.searchParams.get('slug') || '').trim();
  const lane = laneFor(slug);
  if (!lane) return NextResponse.json({ ok: false, error: `no lane for '${slug}'` }, { status: 404 });
  const report = patrolLane(lane);
  return NextResponse.json(report, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const lane = laneFor(String(body?.slug || ''));
  if (!lane) return NextResponse.json({ ok: false, error: `no lane for '${body?.slug || ''}'` }, { status: 404 });
  const action = String(body?.action || 'think');
  if (action !== 'think' && action !== 'escalate') {
    return NextResponse.json({ ok: false, error: `unknown action: ${action}` }, { status: 400 });
  }
  const report = patrolLane(lane);
  const hopId = String(body?.hopId || '');
  const finding = [...report.parked, ...report.stuck].find((f) => f.hopId === hopId)
    ?? report.parked[0] ?? report.stuck[0] ?? null;
  if (!finding) {
    return NextResponse.json({ ok: true, action, finding: null, text: 'No park or stuck hop — nothing to patrol.', lane }, { headers: NO_CACHE_HEADERS });
  }
  const turn = action === 'escalate' ? await askApollo(lane, finding) : await askAtlas(lane, finding);
  return NextResponse.json({
    ok: turn.ok, action, finding, text: turn.text, error: turn.error ?? null, lane,
  }, { headers: NO_CACHE_HEADERS });
}
