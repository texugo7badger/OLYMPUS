/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { resolveSafeRoot, resolveSafePath } from '../_helpers';
import { requireReadAuth } from '@/lib/auth';

/**
 * GET /api/olympus/fs/read?path=<relative>&root=<optional-safe-root>&raw=1
 *
 * Reads a file relative to the safe root. Returns { content, stat, encoding }.
 *
 * Files are read as UTF-8 text. Binary files (>1MB or with null bytes in
 * the first 8KB) are rejected with 415 — only source files are served,
 * and we don't want to base64-encode large binaries into JSON.
 *
 * When `raw=1` is passed, the file is streamed as raw bytes
 * with the appropriate Content-Type. This is used by the image viewer to
 * render SVG/PNG/JPG/GIF/WebP files. Binary detection is SKIPPED in raw
 * mode (images are binary by nature).
 *
 * Used by the Editor Bridge when the user opens a file to preview it.
 */

// MIME type map for raw mode (image viewer).
const RAW_MIME_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

export async function GET(req: NextRequest) {
  const authError = requireReadAuth(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const relative = url.searchParams.get('path') || '';
  const rootHint = url.searchParams.get('root');
  const raw = url.searchParams.get('raw') === '1';

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
        { error: 'File does not exist.', path: target },
        { status: 404 },
      );
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      return NextResponse.json(
        { error: 'Path is a directory, not a file.', path: target },
        { status: 400 },
      );
    }

    // Raw mode: stream the file bytes directly.
    // Used by the image viewer (SVG/PNG/JPG/etc.). No binary detection
    // or size limit — images can be large and are always "binary".
    if (raw) {
      const ext = relative.split('.').pop()?.toLowerCase() || '';
      const contentType = RAW_MIME_TYPES[ext] || 'application/octet-stream';
      const data = fs.readFileSync(target);
      return new NextResponse(data as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-transform',
          'Content-Length': String(stat.size),
        },
      });
    }

    // Reject files larger than 5MB — these are for previewing source files,
    // not giant data files.
    if (stat.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File is too large (>5MB) for the in-app editor.' },
        { status: 413 },
      );
    }

    // Read the first 8KB to detect binary content.
    const fd = fs.openSync(target, 'r');
    try {
      const probeSize = Math.min(8192, stat.size);
      const probe = Buffer.alloc(probeSize);
      fs.readSync(fd, probe, 0, probeSize, 0);
      if (probe.includes(0)) {
        return NextResponse.json(
          { error: 'File appears to be binary — the in-app editor only supports text.' },
          { status: 415 },
        );
      }
    } finally {
      fs.closeSync(fd);
    }

    const content = fs.readFileSync(target, 'utf-8');
    return NextResponse.json({
      path: relative,
      absolutePath: target,
      content,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      encoding: 'utf-8',
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to read file.' },
      { status: 500 },
    );
  }
}
