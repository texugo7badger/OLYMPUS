/**
 * POST /api/olympus/power/request-wake — v0.0.96.
 * Writes a local request file; the Electron main recreates the window and
 * restores the preview servers that hibernate stopped.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  const file = path.join(home, 'wake-request.json');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString() }) + '\n', { mode: 0o600 });
    return NextResponse.json({ ok: true, requested: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
