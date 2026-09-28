/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectStacks } from '@/lib/stack-detector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/olympus/stack/scan
 *   Body: { path: string }
 *   Returns: { stacks, markers, path, ts }
 *
 * Scans the given directory for marker files (Cargo.toml, package.json,
 * pyproject.toml, etc.) and returns the detected stacks. Used by the
 * New Project dialog to pre-fill the stacks field.
 *
 * Security: the path must exist and be a directory. We do NOT follow
 * symlinks or scan outside the given path.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.path || typeof body.path !== 'string') {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }
    const fs = await import('fs');
    if (!fs.existsSync(body.path)) {
      return NextResponse.json(
        { error: `path does not exist: ${body.path}` },
        { status: 404 },
      );
    }
    const stat = fs.statSync(body.path);
    if (!stat.isDirectory()) {
      return NextResponse.json(
        { error: `path is not a directory: ${body.path}` },
        { status: 400 },
      );
    }
    const detection = await detectStacks(body.path);
    return NextResponse.json(detection);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'scan failed' }, { status: 500 });
  }
}
