/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectAllEditors, loadEditorConfig, resolveEditor, buildLaunchArgs } from '@/lib/editor-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/olympus/editor/launch
 *
 * Body: { projectPath: string, projectSlug?: string }
 *
 * Resolves the user's configured external editor (Zed, VSCode, VSCodium,
 * Cursor, or custom) and spawns it on the project path. The spawn happens
 * via the Electron main process's `olympus:spawn-external-editor` IPC handler
 * (so the editor survives OLYMPUS quitting).
 *
 * Returns:
 *   { ok: true, editorId, editorName, binPath, args, cwd, pid }
 *   { ok: false, error: string, detected: DetectedEditor[] }
 *
 * If no editor is detected, the response includes the full detection list so
 * the renderer can show install links for each missing editor.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const projectPath = body.projectPath;
    if (!projectPath || typeof projectPath !== 'string') {
      return NextResponse.json({ ok: false, error: 'projectPath is required' }, { status: 400 });
    }

    const cfg = loadEditorConfig();
    const detected = detectAllEditors();
    const resolved = resolveEditor(cfg, detected);

    if (!resolved) {
      return NextResponse.json({
        ok: false,
        error: 'No external editor detected. Install Zed, VSCode, VSCodium, or Cursor — or set a custom binary path in Settings.',
        detected,
      }, { status: 404 });
    }

    const { entry, binPath, detected: detectedInfo } = resolved;
    const args = buildLaunchArgs(entry, projectPath);

    // Spawn the editor directly via Node's child_process. The editor is
    // detached so it survives OLYMPUS quitting. We use spawn (not exec) so
    // the editor's stdio doesn't get piped into the Next.js log stream.
    //
    // The Electron main process has a parallel `olympus:spawn-external-editor`
    // IPC handler (electron/main.ts) that the renderer's Editor Bridge tab
    // can use directly for lower latency (no HTTP round-trip). This route
    // is the canonical entry point for the New Project dialog and for any
    // future non-renderer callers (e.g. a CLI subcommand).
    try {
      const { spawn } = await import('node:child_process');
      const child = spawn(binPath, args, {
        cwd: projectPath,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.on('error', (err: any) => {
        console.error(`[editor/launch] spawn error: ${err.message}`);
      });
      child.unref();
      return NextResponse.json({
        ok: true,
        editorId: entry.id,
        editorName: entry.displayName,
        binPath,
        args,
        cwd: projectPath,
        pid: child.pid ?? null,
      });
    } catch (err: any) {
      return NextResponse.json({
        ok: false,
        error: `Editor spawn failed: ${err.message}`,
        editorId: entry.id,
        editorName: entry.displayName,
        binPath,
        detected,
      }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'launch failed' }, { status: 500 });
  }
}
