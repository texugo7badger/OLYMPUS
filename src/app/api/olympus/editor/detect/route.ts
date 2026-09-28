/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { detectAllEditors, loadEditorConfig, saveEditorConfig, migrateVscodiumWorkspace } from '@/lib/editor-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/editor/detect
 *
 * Runs editor auto-detection (Zed, VSCode, VSCodium, Cursor) and returns
 * the results. Also returns the user's current editor config (preferred +
 * custom bin path) and a flag indicating whether the vscodium_workspace →
 * external_editor migration has been performed yet.
 *
 * Query params:
 *   ?migrate=1  Run the vscodium_workspace migration before returning. The
 *               result includes a `migration` object with the counts.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shouldMigrate = url.searchParams.get('migrate') === '1';

    let migration: { migrated: number; skipped: number; total: number } | undefined;
    if (shouldMigrate) {
      try {
        migration = migrateVscodiumWorkspace();
      } catch (err: any) {
        // Migration is best-effort — don't fail the whole endpoint.
        console.error('[editor/detect] migration failed:', err.message);
      }
    }

    const detected = detectAllEditors();
    const cfg = loadEditorConfig();

    // Update the cached detection result in the config (so the launcher
    // can use it without re-running detection on every launch).
    cfg.lastDetected = detected;
    cfg.lastDetectedAt = new Date().toISOString();
    saveEditorConfig(cfg);

    return NextResponse.json({
      detected,
      config: cfg,
      migration,
      platform: process.platform,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'detect failed' }, { status: 500 });
  }
}

/**
 * POST /api/olympus/editor/detect
 *
 * Body: { preferred: EditorId | 'auto', customBinPath?: string }
 * Saves the user's editor config. Returns the updated config + fresh detection
 * results.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cfg = loadEditorConfig();
    if (body.preferred === 'auto' || ['zed', 'vscode', 'vscodium', 'cursor'].includes(body.preferred)) {
      cfg.preferred = body.preferred;
    }
    if (typeof body.customBinPath === 'string') {
      cfg.customBinPath = body.customBinPath.trim() || undefined;
    }
    saveEditorConfig(cfg);

    const detected = detectAllEditors();
    cfg.lastDetected = detected;
    cfg.lastDetectedAt = new Date().toISOString();
    saveEditorConfig(cfg);

    return NextResponse.json({ ok: true, config: cfg, detected });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'save failed' }, { status: 500 });
  }
}
