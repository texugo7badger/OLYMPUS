/**
 * POST /api/vault/file/write
 *   Body: { path: string, content: string }
 *   → { ok: true, path }
 *
 * Writes a single vault file as UTF-8 text via the VaultAPI facade.
 * Path is vault-relative (e.g. "02_Projects/foo/notes.md"). Path traversal
 * is rejected explicitly (the facade also rejects it, but we double-check
 * here for defense-in-depth and to return a clearer error).
 *
 * Replaces the deprecated `/api/vault/file` POST route (which used the
 * old fs-only `writeVaultFile` helper from `@/lib/olympus`).
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getVaultApi } from '@/lib/vault/_api-singleton';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hasPathTraversal(p: string): boolean {
  return p.includes('..') || p.includes('\\..') || p.includes('/..') || p.includes('%2e%2e');
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  try {
    const { path: relPath, content } = await req.json();
    if (!relPath || typeof content !== 'string') {
      return NextResponse.json({ error: 'path and content required' }, { status: 400 });
    }

    if (hasPathTraversal(relPath)) {
      return NextResponse.json({ error: 'path traversal detected' }, { status: 400 });
    }

    const api = await getVaultApi();
    await api.write(relPath, content, { mkdirp: true });
    return NextResponse.json({ ok: true, path: relPath });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
