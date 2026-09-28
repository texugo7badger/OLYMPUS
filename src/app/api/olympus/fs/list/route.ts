/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveSafeRoot, resolveSafePath, formatStat } from '../_helpers';

/**
 * GET /api/olympus/fs/list?path=<relative>&root=<optional-safe-root>
 *
 * Lists the contents of a directory relative to the safe root. Returns
 * { entries: Array<{ name, path, isDirectory, isFile, size, mtime }> }.
 *
 * Hidden files (starting with `.`) are included by default — pass
 * `?includeHidden=false` to exclude them. This matches VS Code's default.
 *
 * Used by the FileExplorer component to render the project's directory tree.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const relative = url.searchParams.get('path') || '';
  const rootHint = url.searchParams.get('root');
  const includeHidden = (url.searchParams.get('includeHidden') ?? 'true') !== 'false';

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
    if (!stat.isDirectory()) {
      return NextResponse.json(
        { error: 'Path is not a directory.', path: target },
        { status: 400 },
      );
    }

    const entries = fs.readdirSync(target, { withFileTypes: true })
      .filter((entry) => includeHidden || !entry.name.startsWith('.'))
      .map((entry) => {
        const fullPath = path.join(target, entry.name);
        try {
          const s = fs.statSync(fullPath);
          return {
            name: entry.name,
            path: path.relative(safeRoot, fullPath),
            absolutePath: fullPath,
            isDirectory: s.isDirectory(),
            isFile: s.isFile(),
            isSymbolicLink: entry.isSymbolicLink(),
            size: s.size,
            mtime: s.mtime.toISOString(),
          };
        } catch {
          // stat failed (broken symlink, permission denied, etc.) — skip
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      // Directories first, then files, alphabetical within each group.
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json({
      root: safeRoot,
      path: path.relative(safeRoot, target),
      absolutePath: target,
      stat: formatStat(stat, target),
      entries,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to list directory.' },
      { status: 500 },
    );
  }
}
