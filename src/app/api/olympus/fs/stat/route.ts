/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { resolveSafeRoot, resolveSafePath, formatStat } from '../_helpers';
import { requireReadAuth } from '@/lib/auth';

/**
 * GET /api/olympus/fs/stat?path=<relative>&root=<optional-safe-root>
 *
 * Returns metadata for a file or directory without reading its content.
 */
export async function GET(req: NextRequest) {
  // Issue #29: the fs/* family had no auth. Reads use requireReadAuth,
  // mutators requireAuth.
  const authError = requireReadAuth(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const relative = url.searchParams.get('path') || '';
  const rootHint = url.searchParams.get('root');

  const safeRoot = resolveSafeRoot(rootHint);
  const target = resolveSafePath(safeRoot, relative);
  if (!target) {
    return NextResponse.json(
      { error: 'Path is outside the safe root.' },
      { status: 403 },
    );
  }

  try {
    if (!fs.existsSync(target)) {
      return NextResponse.json(
        { error: 'Path does not exist.', path: target },
        { status: 404 },
      );
    }
    const stat = fs.statSync(target);
    return NextResponse.json({
      ...formatStat(stat, target),
      path: relative,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to stat path.' },
      { status: 500 },
    );
  }
}
