/**
 * POST /api/olympus/atelier/inject — #165 PIPE-1 (v0.0.6): the asset-inject
 * route. A vault asset flows INTO a generated project: the binary copies to
 * <project>/public/assets/ (kebab-case, root-relative — the check-9
 * contract), the route returns the reference. The generated page cites it;
 * the exit gate verifies it ships.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { MEDIA_VAULT_DIR } from '@/lib/media-vault';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { assetId, projectPath, name } = await req.json();
    if (typeof assetId !== 'string' || !assetId) {
      return NextResponse.json({ ok: false, error: 'assetId required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    if (typeof projectPath !== 'string' || !projectPath.startsWith('/') || !fs.existsSync(projectPath)) {
      return NextResponse.json({ ok: false, error: 'projectPath must be an existing absolute path' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    // The asset binary (the vault's images dir, id-matched).
    const safeId = assetId.replace(/[^a-zA-Z0-9-]/g, '');
    const imgDir = path.join(MEDIA_VAULT_DIR, 'images');
    const hit = fs.readdirSync(imgDir).find((f) => f.replace(/\.[^.]+$/, '') === safeId);
    if (!hit) {
      return NextResponse.json({ ok: false, error: `no vault asset '${assetId}'` }, { status: 404, headers: NO_CACHE_HEADERS });
    }
    // The destination: <project>/public/assets/ — the check-9 shape
    // (root-relative refs resolve under public/).
    const destDir = path.join(projectPath, 'public', 'assets');
    fs.mkdirSync(destDir, { recursive: true });
    const base = (typeof name === 'string' && name ? name : safeId).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'asset';
    const ext = hit.split('.').pop() ?? 'png';
    const dest = path.join(destDir, `${base}.${ext}`);
    // NEVER overwrite silently (the skill contract): a collision gets a suffix.
    let final = dest;
    let n = 1;
    while (fs.existsSync(final) && fs.readFileSync(final).length !== fs.readFileSync(path.join(imgDir, hit)).length) {
      final = path.join(destDir, `${base}-${n++}.${ext}`);
    }
    fs.copyFileSync(path.join(imgDir, hit), final);
    const ref = `/assets/${path.basename(final)}`; // root-relative — check-9's contract
    return NextResponse.json({ ok: true, ref, dest: final, check: 'the ref is root-relative; the exit gate check 9 verifies the file ships' }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
