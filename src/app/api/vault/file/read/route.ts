/**
 * GET /api/vault/file/read?path=<relPath>
 *   → { path, content, stat }
 *
 * GET /api/vault/file/read  (no path)
 *   → { files: VaultEntry[] }   (top-level vault listing)
 *
 * Reads a single vault file as UTF-8 text via the VaultAPI facade.
 * Path is vault-relative (e.g. "02_Projects/foo/notes.md"). Path traversal
 * is rejected by the facade itself (it doesn't accept absolute paths or
 * `..` segments).
 *
 * Replaces the deprecated `/api/vault/file` GET route (which used the
 * old fs-only `listVaultFiles / readVaultFile` helpers from `@/lib/olympus`).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { getVaultApi } from '@/lib/vault/_api-singleton';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hasPathTraversal(p: string): boolean {
  return p.includes('..') || p.includes('\\..') || p.includes('/..') || p.includes('%2e%2e');
}

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;

  const relPath = req.nextUrl.searchParams.get('path');

  try {
    const api = await getVaultApi();

    // No path → list top-level vault entries.
    if (!relPath) {
      const listResult = await api.list('');
      return NextResponse.json({ files: listResult.items });
    }

    // Reject path traversal attempts.
    if (hasPathTraversal(relPath)) {
      return NextResponse.json({ error: 'path traversal detected' }, { status: 400 });
    }

    // Read file as text (api.read returns {content, path, size}).
    // `stat` is fetched AFTER `read` so a missing file throws
    // ENOENT from `read` first (which the catch block maps to 404). The
    // previous order could surface a non-ENOENT error from `stat` if the
    // vault index was stale, returning 500 instead of 404 to the document
    // viewer modal.
    const result = await api.read(relPath);
    const stat = await api.stat(relPath);
    return NextResponse.json({ path: relPath, content: result.content, stat });
  } catch (e: any) {
    // Robustly detect "file not found" so the document viewer
    // gets a 404 (not a 500) when an instinct/knowledge/project file doesn't
    // exist on disk. We check the error message AND the errno code, since
    // Node's fs.readFile throws an error with `code: 'ENOENT'` but the
    // message string can vary across platforms.
    const msg = (e && typeof e.message === 'string') ? e.message : String(e || '');
    const code = (e && typeof e.code === 'string') ? e.code : '';
    const isNotFound = /not found|enoent/i.test(msg) || /enoent/i.test(code);
    const status = isNotFound ? 404 : 500;
    return NextResponse.json({ error: msg || 'unknown error', path: relPath }, { status });
  }
}
