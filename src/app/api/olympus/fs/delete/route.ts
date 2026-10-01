/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { resolveSafeRoot, resolveSafePath } from '../_helpers';
import { requireAuth } from '@/lib/auth';

/**
 * DELETE /api/olympus/fs/delete?path=<relative>&root=<optional-safe-root>&recursive=<bool>
 *
 * Deletes a file or directory. Directories require ?recursive=true to delete
 * non-empty contents (matching `rm -rf`). Refuses to delete the safe root
 * itself (would wipe the project).
 */
export async function DELETE(req: NextRequest) {
  // Issue #29: the fs/* family had no auth. Reads use requireReadAuth,
  // mutators requireAuth.
  const authError = requireAuth(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const relative = url.searchParams.get('path') || '';
  const rootHint = url.searchParams.get('root');
  const recursive = url.searchParams.get('recursive') === 'true';

  const safeRoot = resolveSafeRoot(rootHint);
  const target = resolveSafePath(safeRoot, relative);
  if (!target) {
    return NextResponse.json(
      { error: 'Path is outside the safe root.' },
      { status: 403 },
    );
  }
  // Refuse to delete the safe root itself.
  if (target === safeRoot) {
    return NextResponse.json(
      { error: 'Refusing to delete the project root.' },
      { status: 400 },
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
    if (stat.isDirectory()) {
      if (recursive) {
        fs.rmSync(target, { recursive: true, force: true });
      } else {
        // Only delete if empty.
        try {
          fs.rmdirSync(target);
        } catch (e: any) {
          return NextResponse.json(
            { error: 'Directory is not empty. Pass ?recursive=true to delete anyway.' },
            { status: 400 },
          );
        }
      }
    } else {
      fs.unlinkSync(target);
    }
    return NextResponse.json({ ok: true, path: relative });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to delete path.' },
      { status: 500 },
    );
  }
}
