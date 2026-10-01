/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 *
 * POST /api/olympus/upload
 *
 * Saves one or more uploaded files (multipart field `files`) into
 * ~/OLYMPUS-VAULT/uploads/ and returns their vault-relative paths.
 *
 * The Interactive Terminal's paperclip button uses this for .md, .zip and
 * other project files. Archives (.zip, .7z, .rar, .tar.gz, …) are saved
 * AS-IS — NOT extracted at upload time. The prompt prefix tells Apollo to
 * extract them via bash + 7-Zip (see interactive-terminal.tsx
 * buildUploadPrefix), which is more robust than JS archive libraries.
 *
 * Form fields:
 *   - files: File (required, repeatable) — one or more files
 *
 * Returns:
 *   { ok, files: [{ name, path, size, mimeType, extracted: false }] }
 *
 * `path` is vault-relative (uploads/<timestamp>-<safe-name>), matching the
 * "~/OLYMPUS-VAULT/${f.path}" convention used by the Interactive Terminal.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT_ROOT = getVaultRoot();
const UPLOADS_DIR = path.join(VAULT_ROOT, 'uploads');

// Soft per-file guard — this is a local desktop app (Electron + persistent
// disk), not a serverless deployment, so there is no proxy body limit in
// play. Kept generous: reference dumps and zip archives can be large.
const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB

function safeStoredName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 16);
  const base = path
    .basename(originalName, path.extname(originalName))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${base}${ext}`;
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `Invalid multipart body: ${e.message || 'could not parse form data'}` },
      { status: 400 },
    );
  }

  const rawFiles = formData.getAll('files');
  if (rawFiles.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No files provided (multipart field "files" required).' },
      { status: 400 },
    );
  }

  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (mkErr: any) {
    return NextResponse.json(
      { ok: false, error: `Failed to create vault uploads dir: ${mkErr.message}` },
      { status: 500 },
    );
  }

  const files: Array<{
    name: string;
    path: string;
    size: number;
    mimeType: string;
    extracted: false;
  }> = [];

  for (const entry of rawFiles) {
    if (!(entry instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid multipart entry — expected a File for field "files".' },
        { status: 400 },
      );
    }
    if (entry.size === 0) {
      return NextResponse.json(
        { ok: false, error: `"${entry.name}" is empty — nothing to upload.` },
        { status: 400 },
      );
    }
    if (entry.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: `"${entry.name}" is too large (${entry.size} bytes — limit ${MAX_FILE_BYTES}).` },
        { status: 413 },
      );
    }

    const storedName = safeStoredName(entry.name);
    const target = path.join(UPLOADS_DIR, storedName);
    try {
      const buf = Buffer.from(await entry.arrayBuffer());
      fs.writeFileSync(target, buf);
    } catch (wErr: any) {
      return NextResponse.json(
        { ok: false, error: `Failed to save "${entry.name}": ${wErr.message}` },
        { status: 500 },
      );
    }

    files.push({
      name: entry.name,
      path: `uploads/${storedName}`,
      size: entry.size,
      mimeType: entry.type || 'application/octet-stream',
      extracted: false,
    });
  }

  return NextResponse.json({ ok: true, files });
}
