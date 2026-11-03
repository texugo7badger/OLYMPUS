/**
 * /api/olympus/theme — v0.0.32: the private appearance store.
 *
 * GET  → { ok, state } (defaults when absent)
 * POST → persist the normalized state in ~/.olympus/theme.json
 *
 * The palette/icons live in src/lib/theme.ts (one source); this route only
 * stores the user's choice. No secrets, no repo writes.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse, NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_THEME, normalizeThemeState, resolvePalette } from '@/lib/theme';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function themePath(): string {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  return path.join(home, 'theme.json');
}

export async function GET() {
  try {
    const raw = JSON.parse(fs.readFileSync(themePath(), 'utf-8'));
    // v0.0.60 — the stamp is how the desktop notices a change made on the
    // phone (and how the phone knows its copy is stale).
    return NextResponse.json(
      { ok: true, state: normalizeThemeState(raw), updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null },
      { headers: NO_CACHE_HEADERS },
    );
  } catch {
    return NextResponse.json({ ok: true, state: DEFAULT_THEME, updatedAt: null }, { headers: NO_CACHE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const state = normalizeThemeState(body);
  const palette = resolvePalette(state);
  const updatedAt = new Date().toISOString();
  try {
    const file = themePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // The resolved palette rides the file so the Electron main (splash, tray,
    // window icon) can theme itself without importing src/.
    fs.writeFileSync(file, JSON.stringify({ ...state, palette, updatedAt }, null, 2) + '\n', 'utf-8');
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, state, updatedAt }, { headers: NO_CACHE_HEADERS });
}
