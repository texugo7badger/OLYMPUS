/**
 * POST /api/olympus/power/request-hibernate — v0.0.96.
 * Writes a local request file; the Electron main performs the actual gated
 * hibernate (active turns settle, idle previews stop, HUD appears). Useful for
 * the phone, a CLI, and the live drill; no credentials are stored.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  const file = path.join(home, 'hibernate-request.json');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let forceFree = false;
    try { const body = await req.json(); forceFree = body?.forceFree === true; } catch { /* no body */ }
    fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), forceFree }) + '\n', { mode: 0o600 });
    return NextResponse.json({ ok: true, requested: true, note: 'The Electron main will hibernate after the active chat turn settles.' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
