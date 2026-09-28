/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveSafeRoot, resolveSafePath } from '../_helpers';

/**
 * POST /api/olympus/fs/write
 * Body: { path: string, content: string, root?: string, createIfMissing?: boolean }
 *
 * Writes text content to a file relative to the safe root. Creates the
 * file if it doesn't exist (and parent directories if needed).
 *
 * Used by the Editor Bridge's "Save" (Cmd/Ctrl+S) action when previewing a file.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { path: relative, content, root: rootHint, createIfMissing = true } = body;

    if (typeof relative !== 'string' || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Missing "path" or "content" in body.' },
        { status: 400 },
      );
    }

    const safeRoot = resolveSafeRoot(rootHint);
    const target = resolveSafePath(safeRoot, relative);
    if (!target) {
      return NextResponse.json(
        { error: 'Path is outside the safe root.' },
        { status: 403 },
      );
    }

    // If the file already exists and is a directory, refuse.
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      return NextResponse.json(
        { error: 'Cannot overwrite a directory with a file.' },
        { status: 400 },
      );
    }

    // Create parent directories if missing.
    const parent = path.dirname(target);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }

    if (!createIfMissing && !fs.existsSync(target)) {
      return NextResponse.json(
        { error: 'File does not exist and createIfMissing is false.' },
        { status: 404 },
      );
    }

    fs.writeFileSync(target, content, 'utf-8');
    const stat = fs.statSync(target);
    return NextResponse.json({
      ok: true,
      path: relative,
      absolutePath: target,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to write file.' },
      { status: 500 },
    );
  }
}
