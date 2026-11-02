/**
 * /api/olympus/atelier/proof — v0.0.44 (R44-01).
 *
 * The Atelier's honest "agents can actually reach the media" check: the media
 * vault directory exists, is readable and writable, and the newest asset can
 * be opened. It also names the two MCP lanes that see the vault (filesystem +
 * olympus-craft) and the generation lanes' price posture.
 *
 * GET only. No generation, no cost.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_VAULT_DIR, listAssets } from '@/lib/media-vault';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const imagesDir = path.join(MEDIA_VAULT_DIR, 'images');
  let readable = false;
  let writable = false;
  let newest: { path: string; bytes: number; mtime: string } | null = null;
  try {
    fs.accessSync(MEDIA_VAULT_DIR, fs.constants.R_OK);
    readable = true;
  } catch { /* missing */ }
  try {
    fs.accessSync(MEDIA_VAULT_DIR, fs.constants.W_OK);
    writable = true;
  } catch { /* read-only */ }
  try {
    const files = fs.readdirSync(imagesDir)
      .filter((f) => /\.(png|jpe?g|webp|gif|avif|glb|gltf)$/i.test(f))
      .map((f) => {
        const full = path.join(imagesDir, f);
        const st = fs.statSync(full);
        return { path: full, bytes: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
    newest = files[0] ?? null;
  } catch { /* no images yet */ }

  let assets = 0;
  try { assets = listAssets(1000).length; } catch { /* honest zero */ }

  // The agent lane is only proven when a real byte can be read.
  let newestReadable = false;
  if (newest) {
    try {
      const fd = fs.openSync(newest.path, 'r');
      const buf = Buffer.alloc(8);
      fs.readSync(fd, buf, 0, 8, 0);
      fs.closeSync(fd);
      newestReadable = true;
    } catch { /* unreadable */ }
  }

  const ok = readable && newestReadable;
  return NextResponse.json({
    ok,
    dir: MEDIA_VAULT_DIR,
    assets,
    readable,
    writable,
    newest,
    newestReadable,
    mcp: ['filesystem', 'olympus-craft'],
    lanes: [
      { id: 'pollinations', label: 'Pollinations', price: '$0', needsKey: false, note: 'free default' },
      { id: 'fal', label: 'fal.ai', price: 'BYOK · per model', needsKey: true, note: 'paid rung, price shown before generate' },
      { id: 'google', label: 'Google', price: 'BYOK · per model', needsKey: true, note: 'paid rung, price shown before generate' },
    ],
    at: new Date().toISOString(),
  }, { headers: NO_CACHE_HEADERS });
}
