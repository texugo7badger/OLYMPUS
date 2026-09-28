/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveSafeRoot, resolveSafePath } from '../_helpers';

/**
 * POST /api/olympus/fs/rename
 * Body: { from: string, to: string, root?: string }
 *
 * Renames or moves a file/directory. Both `from` and `to` must resolve
 * inside the safe root. Refuses to overwrite an existing destination
 * unless ?force=true is passed (or `force: true` in the body).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { from: fromRel, to: toRel, root: rootHint, force = false } = body;

    if (typeof fromRel !== 'string' || typeof toRel !== 'string') {
      return NextResponse.json(
        { error: 'Missing "from" or "to" in body.' },
        { status: 400 },
      );
    }

    const safeRoot = resolveSafeRoot(rootHint);
    const from = resolveSafePath(safeRoot, fromRel);
    const to = resolveSafePath(safeRoot, toRel);
    if (!from || !to) {
      return NextResponse.json(
        { error: 'Source or destination is outside the safe root.' },
        { status: 403 },
      );
    }

    if (!fs.existsSync(from)) {
      return NextResponse.json(
        { error: 'Source path does not exist.', from },
        { status: 404 },
      );
    }
    if (fs.existsSync(to) && !force) {
      return NextResponse.json(
        { error: 'Destination already exists. Pass force:true to overwrite.', to },
        { status: 409 },
      );
    }

    // Ensure destination's parent directory exists.
    const parent = path.dirname(to);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }

    fs.renameSync(from, to);
    return NextResponse.json({
      ok: true,
      from: fromRel,
      to: toRel,
      absoluteFrom: from,
      absoluteTo: to,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to rename path.' },
      { status: 500 },
    );
  }
}
