/**
 * Build info — #120 (PLANO-MASTER-1 B6a): the build banner.
 *
 * The B1 verdict (c): the user's 13:40 app was a MIXED build (an Oct-3
 * Electron main + a live-source renderer) and NO surface said so — "which
 * build is serving" cost the mission its diagnosis. The banner names BOTH
 * halves: the renderer's git rev (the code the Next server compiles) + the
 * Electron main's compile date (dist-electron-tsc/main.js mtime — the main
 * carries no rev; its build time is the honest marker).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const cwd = process.cwd();
  let rev: string | null = null;
  try {
    rev = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', cwd }).trim() || null;
  } catch {
    rev = null; // packaged builds may not carry git — the banner says unknown, never lies
  }
  let mainBuiltAt: string | null = null;
  try {
    mainBuiltAt = statSync(join(cwd, 'dist-electron-tsc', 'main.js')).mtime.toISOString();
  } catch {
    mainBuiltAt = null;
  }
  let version: string | null = null;
  try {
    version = String(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8')).version ?? '') || null;
  } catch {
    version = null;
  }
  return NextResponse.json({ ok: true, rev, mainBuiltAt, version }, {
    headers: { 'Cache-Control': 'no-store, max-age=0, must-revalidate' },
  });
}
