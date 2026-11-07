/**
 * /api/olympus/design-builds/pack — v0.0.88: export/import a build pack.
 *
 * GET  ?ids=cache-layer,eval-harness → a signed-by-digest JSON pack
 * POST { pack, allowRisky? } → scan + import into the user registry
 *
 * The import writes ONLY valid builds to ~/.olympus/design-builds.json and
 * returns every scan finding; a high-severity finding blocks unless the
 * caller explicitly accepts the risk.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { SEED_DESIGN_BUILDS, normalizeUserBuild, type DesignBuild } from '@/lib/design-builds';
import { exportBuildPack, importBuildPack } from '@/lib/build-packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function home(): string { return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'); }
function userPath(): string { return path.join(home(), 'design-builds.json'); }
function readUser(): DesignBuild[] {
  try {
    const raw = JSON.parse(fs.readFileSync(userPath(), 'utf-8'));
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.builds) ? raw.builds : [];
    return list.filter((b: any) => b && typeof b.id === 'string' && typeof b.god === 'string');
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const ids = String(req.nextUrl.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ ok: false, error: 'ids is required' }, { status: 400 });
  const all = [...SEED_DESIGN_BUILDS, ...readUser()];
  const builds = ids.map((id) => all.find((b) => b.id === id)).filter(Boolean) as DesignBuild[];
  if (builds.length === 0) return NextResponse.json({ ok: false, error: 'no matching builds' }, { status: 404 });
  const pack = exportBuildPack(builds);
  return NextResponse.json({ ok: true, pack }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const result = importBuildPack(body?.pack ?? body, { allowRisky: body?.allowRisky === true });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, findings: result.findings }, { status: 422 });
  }
  const user = readUser();
  const imported: DesignBuild[] = [];
  for (const b of result.builds) {
    const normalized = normalizeUserBuild({ ...b, source: 'user' });
    if (!normalized) continue;
    const existing = user.findIndex((u) => u.id === normalized.id);
    if (existing >= 0) user[existing] = normalized; else user.push(normalized);
    imported.push(normalized);
  }
  try {
    fs.mkdirSync(path.dirname(userPath()), { recursive: true });
    fs.writeFileSync(userPath(), JSON.stringify({ version: 1, builds: user }, null, 2) + '\n');
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, imported: imported.map((b) => b.id), findings: result.findings }, { headers: NO_CACHE_HEADERS });
}
