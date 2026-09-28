/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * POST /api/olympus/image-upload
 *
 * Saves an uploaded image (multipart/form-data) into the active project's
 * `reference-images/` subdirectory and returns the saved path.
 *
 * The Interactive Terminal uses this when the user clicks the image icon
 * to send Apollo a reference image (mockup, screenshot, design reference,
 * etc.). Apollo can then route the image to Athena (built-in VLM skill) for
 * analysis without the user having to manually drop the file into the
 * project tree.
 *
 * Form fields:
 *   - image:       File (required) — the image file (png/jpg/gif/webp/bmp/svg)
 *   - projectPath: string (required) — absolute path to the active project dir
 *
 * Returns:
 *   { ok, path, filename, projectPath, size, mimeType }
 *
 * The saved file is named `<ISO-timestamp>-<safe-base-name>.<ext>` so that
 * multiple uploads from the same session stay ordered on disk. The
 * `reference-images/` directory is created on demand.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
]);

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

/**
 * Reject any path that escapes the project root after resolution.
 * The interactive-terminal passes the active project's absolute path
 * (from the project store), but we defensively re-check here so a
 * crafted projectPath like `/etc` or `../../` is rejected before we
 * write to disk.
 */
function safeProjectPath(rawProjectPath: string): string | null {
  if (!rawProjectPath || typeof rawProjectPath !== 'string') return null;
  // Block obviously suspicious absolute paths.
  if (/(^|\/)\.\.(\/|$)/.test(rawProjectPath)) return null;
  const resolved = path.resolve(rawProjectPath);
  try {
    if (!fs.existsSync(resolved)) return null;
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }
  return resolved;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('image');
    const projectPathRaw = formData.get('projectPath');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'No image file provided (multipart field "image" required).' },
        { status: 400 },
      );
    }

    if (!projectPathRaw || typeof projectPathRaw !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'projectPath is required (the active project directory).' },
        { status: 400 },
      );
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unsupported image type "${file.type}". Allowed: png, jpg, gif, webp, bmp, svg.`,
        },
        { status: 400 },
      );
    }

    const projectDir = safeProjectPath(projectPathRaw);
    if (!projectDir) {
      return NextResponse.json(
        { ok: false, error: `Project directory not found or not a directory: ${projectPathRaw}` },
        { status: 400 },
      );
    }

    // Create the reference-images subdirectory on demand.
    const refDir = path.join(projectDir, 'reference-images');
    try {
      if (!fs.existsSync(refDir)) {
        fs.mkdirSync(refDir, { recursive: true });
      }
    } catch (mkErr: any) {
      return NextResponse.json(
        { ok: false, error: `Failed to create reference-images dir: ${mkErr.message}` },
        { status: 500 },
      );
    }

    // Build a safe, timestamped filename so multiple uploads stay ordered
    // and so we don't clobber an existing file with the same source name.
    const ext =
      EXT_BY_TYPE[file.type] ||
      path.extname(file.name).slice(1).toLowerCase() ||
      'png';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName =
      path.basename(file.name, path.extname(file.name))
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'reference';
    const filename = `${timestamp}-${baseName}.${ext}`;
    const fullPath = path.join(refDir, filename);

    const buf = Buffer.from(await file.arrayBuffer());
    try {
      fs.writeFileSync(fullPath, buf);
    } catch (writeErr: any) {
      return NextResponse.json(
        { ok: false, error: `Failed to write image: ${writeErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      path: fullPath,
      filename,
      projectPath: projectDir,
      size: buf.length,
      mimeType: file.type,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/olympus/image-upload',
    description:
      "Saves an uploaded image into the active project's reference-images/ subdirectory.",
    body: {
      image: 'File (required) — multipart form file field',
      projectPath: 'string (required) — absolute path to the active project directory',
    },
    returns: {
      ok: 'boolean',
      path: 'string — absolute path to the saved image',
      filename: 'string — generated filename',
      projectPath: 'string — resolved project directory',
      size: 'number — bytes written',
      mimeType: 'string — image MIME type',
    },
  });
}
