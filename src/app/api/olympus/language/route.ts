/**
 * /api/olympus/language — v0.0.61: the device-independent language choice.
 *
 * The desktop keeps its instant copy in localStorage; this file lets the
 * phone (and any second surface) speak the SAME language. The mobile mic and
 * TTS read it, so a Portuguese user no longer gets English dictation just
 * because the phone's browser is English.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILE = path.join(process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus'), 'language.json');
// Keep this list in sync with src/lib/i18n.ts (the client module is not
// importable from a server route: it touches window at module scope).
const IDS = new Set(['en', 'pt-BR', 'es', 'fr', 'de', 'ja', 'zh']);

export async function GET() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    const language = IDS.has(raw?.language) ? raw.language : 'en';
    // v0.0.63 — the stamp lets the desktop decide who is newer instead of
    // blindly overwriting the other surface.
    const updatedAt = typeof raw?.updatedAt === 'string' ? raw.updatedAt : null;
    return NextResponse.json({ ok: true, language, updatedAt }, { headers: NO_CACHE_HEADERS });
  } catch {
    return NextResponse.json({ ok: true, language: 'en', updatedAt: null }, { headers: NO_CACHE_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* invalid */ }
  const language = String(body?.language || '');
  if (!IDS.has(language as any)) {
    return NextResponse.json({ ok: false, error: `language must be one of ${[...IDS].join(', ')}` }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ language, updatedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
    return NextResponse.json({ ok: true, language }, { headers: NO_CACHE_HEADERS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'write failed' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
