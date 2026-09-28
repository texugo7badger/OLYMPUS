/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveSafeRoot, resolveSafePath } from '../_helpers';

/**
 * GET /api/olympus/fs/quick-open?root=<optional-safe-root>&limit=<int>
 *
 * Returns a flat list of all files in the safe root,
 * excluding build/dependency directories. Used by the QuickOpen component
 * (Cmd/Ctrl+P) for fuzzy file search.
 *
 * The list is cached for 60 seconds (the FileExplorer's SSE watcher
 * handles real-time updates; this endpoint is only called on demand when
 * the user opens the quick-open dialog).
 *
 * Returns: { files: string[], root: string }
 *   files: array of relative paths (e.g. "src/app/page.tsx")
 *
 * Limits:
 *   - Default cap: 2000 files (configurable via ?limit=)
 *   - Max cap: 5000 files
 *   - Skips: node_modules, .next, .git, dist, build, dist-electron, etc.
 *   - Skips: files larger than 10MB (not useful for quick-open)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'build',
  'dist-electron', 'dist-electron-tsc', '.turbo', '.cache',
  '.svelte-kit', '.nuxt', '.output', '.vercel',
  'coverage', '.nyc_output', '__pycache__', '.pytest_cache',
  'target', 'bin', 'obj',
  '.DS_Store', 'Thumbs.db',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rootHint = url.searchParams.get('root');
  const limitParam = parseInt(url.searchParams.get('limit') || '2000', 10);
  const limit = Math.min(Math.max(limitParam, 100), 5000);

  const safeRoot = resolveSafeRoot(rootHint);

  const files: string[] = [];
  let visited = 0;

  function walk(dir: string, depth: number) {
    if (files.length >= limit) return;
    if (depth > 20) return; // safety limit

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= limit) return;
      visited++;
      if (visited > 50000) return; // safety limit

      if (entry.name.startsWith('.') && SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > MAX_FILE_SIZE) continue;
          const rel = path.relative(safeRoot, fullPath);
          files.push(rel.replace(/\\/g, '/')); // normalize for Windows
        } catch {}
      }
    }
  }

  walk(safeRoot, 0);

  return NextResponse.json({
    files,
    root: safeRoot,
    count: files.length,
    truncated: visited > 50000,
  });
}
