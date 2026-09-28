/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const BRAIN_GC_DIR = path.join(VAULT, '09_Archive', 'brain_gc');
const UNDO_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * POST /api/olympus/compact/undo
 * Body: { runId: string }
 *
 * Restores a compacted brain snapshot from
 * ~/OLYMPUS-VAULT/09_Archive/brain_gc/<runId>/ back into the live instinct
 * directories. The 5-minute undo window is enforced by checking the
 * snapshot directory's mtime — older snapshots are refused.
 *
 * Callimachus's PRUNE stage writes soft-deleted instincts into the
 * brain_gc folder; this endpoint reverses that by moving them back.
 *
 * Returns:
 *   200 { ok: true, restored: true, runId, restoredFiles }
 *   400 { ok: false, error: 'runId required' | 'invalid runId format' }
 *   404 { ok: false, error: 'gc run not found' }
 *   409 { ok: false, error: 'undo window expired' }
 *   500 { ok: false, error: <message> }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { runId } = body;
    if (!runId || typeof runId !== 'string') {
      return NextResponse.json({ ok: false, error: 'runId required' }, { status: 400 });
    }

    // Validate runId format: alphanumeric + dashes (no path traversal).
    if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
      return NextResponse.json({ ok: false, error: 'invalid runId format' }, { status: 400 });
    }

    const snapshotDir = path.join(BRAIN_GC_DIR, runId);
    if (!fs.existsSync(snapshotDir)) {
      return NextResponse.json({ ok: false, error: 'gc run not found', runId }, { status: 404 });
    }

    // Enforce the 5-minute undo window via the snapshot dir's mtime.
    const stat = fs.statSync(snapshotDir);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > UNDO_WINDOW_MS) {
      return NextResponse.json(
        { ok: false, error: 'undo window expired', runId },
        { status: 409 },
      );
    }

    // Walk the snapshot tree and move every file back to its original
    // location under ~/OLYMPUS-VAULT/05_Auto_Learning/instincts/<god>/.
    const restoredFiles: string[] = [];
    const instinctsRoot = path.join(VAULT, '05_Auto_Learning', 'instincts');

    function walkAndRestore(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkAndRestore(full);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // The snapshot mirrors the instincts tree: <god>/{seed,empirical}/<file>.md
          const rel = path.relative(snapshotDir, full);
          const target = path.join(instinctsRoot, rel);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.renameSync(full, target);
          restoredFiles.push(rel);
        }
      }
    }

    walkAndRestore(snapshotDir);

    // Remove the now-empty snapshot directory.
    try { fs.rmSync(snapshotDir, { recursive: true, force: true }); } catch {}

    return NextResponse.json({
      ok: true,
      restored: true,
      runId,
      restoredFiles,
      message: `Restored ${restoredFiles.length} instinct(s) from snapshot ${runId}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message || String(e) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    msg: 'POST to this endpoint with { runId } to undo a brain compaction (within 5-minute window)',
  });
}
