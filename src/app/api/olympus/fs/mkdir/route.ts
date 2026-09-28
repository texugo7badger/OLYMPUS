/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveSafeRoot, resolveSafePath } from '../_helpers';

/**
 * POST /api/olympus/fs/mkdir
 * Body: { path: string, root?: string, recursive?: boolean }
 *
 * Creates a directory relative to the safe root.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { path: relative, root: rootHint, recursive = true } = body;

    if (typeof relative !== 'string') {
      return NextResponse.json(
        { error: 'Missing "path" in body.' },
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

    if (fs.existsSync(target)) {
      return NextResponse.json(
        { error: 'Path already exists.', path: target },
        { status: 409 },
      );
    }

    if (recursive) {
      fs.mkdirSync(target, { recursive: true });
    } else {
      fs.mkdirSync(target);
    }
    return NextResponse.json({
      ok: true,
      path: relative,
      absolutePath: target,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to create directory.' },
      { status: 500 },
    );
  }
}
