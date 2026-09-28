/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ONBOARDING_FILE = join(homedir(), '.olympus', 'onboarding-completed');

/**
 * GET /api/olympus/onboarding
 *   Returns { completed: boolean, completedAt: string | null }.
 *   Used by page.tsx to decide whether to show the onboarding wizard.
 */
export async function GET() {
  try {
    if (existsSync(ONBOARDING_FILE)) {
      const data = readFileSync(ONBOARDING_FILE, 'utf-8').trim();
      return NextResponse.json({ ok: true, completed: true, completedAt: data });
    }
    return NextResponse.json({ ok: true, completed: false, completedAt: null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/olympus/onboarding
 *   Body: { completed: boolean }
 *   Writes the onboarding-completed flag to ~/.olympus/onboarding-completed.
 *   When completed=true, the wizard won't show again on next launch.
 *   When completed=false, the wizard will show again (used by Settings →
 *   "Run onboarding wizard again").
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const completed = body.completed === true;
    mkdirSync(dirname(ONBOARDING_FILE), { recursive: true });
    if (completed) {
      writeFileSync(ONBOARDING_FILE, new Date().toISOString(), 'utf-8');
    } else {
      // Delete the file so the wizard shows again.
      try {
        const { unlinkSync } = await import('node:fs');
        if (existsSync(ONBOARDING_FILE)) unlinkSync(ONBOARDING_FILE);
      } catch {}
    }
    return NextResponse.json({ ok: true, completed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
