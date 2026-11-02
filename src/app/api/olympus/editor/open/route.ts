/**
 * /api/olympus/editor/open — v0.0.42 (R42-02): follow the agent.
 *
 * Opens ONE file (optionally at a line) in the user's configured external
 * editor. The caller is the follow-agent switch: when a god writes or edits a
 * file inside the active project, the editor mirrors that file.
 *
 * Safety: the target must resolve INSIDE the project root (realpath, no
 * traversal), and only a detected/configured editor is spawned. No shell.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { detectAllEditors, loadEditorConfig, resolveEditor } from '@/lib/editor-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function openArgs(editorId: string, target: string, line?: number): string[] {
  const at = line && line > 0 ? `${target}:${line}` : target;
  // VSCode-family supports `-g file:line`; Zed opens `file:line` directly.
  if (editorId === 'vscode' || editorId === 'vscodium' || editorId === 'cursor') return ['-g', at];
  return [at];
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const projectPath = String(body?.projectPath || '');
  const file = String(body?.file || '');
  const line = Number(body?.line);
  if (!projectPath || !file) {
    return NextResponse.json({ ok: false, error: 'projectPath and file are required' }, { status: 400 });
  }

  let root: string;
  let target: string;
  try {
    root = fs.realpathSync(projectPath);
    const candidate = path.isAbsolute(file) ? file : path.join(root, file);
    target = fs.realpathSync(candidate);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `file not found: ${e?.message || e}` }, { status: 404 });
  }
  if (!isInside(root, target)) {
    return NextResponse.json({ ok: false, error: 'refusing to open a file outside the project root' }, { status: 403 });
  }
  if (!fs.statSync(target).isFile()) {
    return NextResponse.json({ ok: false, error: 'target is not a file' }, { status: 400 });
  }

  const resolved = resolveEditor(loadEditorConfig(), detectAllEditors());
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'no external editor detected' }, { status: 404 });
  }
  const args = openArgs(resolved.entry.id, target, Number.isFinite(line) ? line : undefined);
  try {
    const child = spawn(resolved.binPath, args, {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.on('error', (err) => console.error(`[editor/open] ${err.message}`));
    child.unref();
    return NextResponse.json({ ok: true, editorId: resolved.entry.id, editorName: resolved.entry.displayName, file: path.relative(root, target), line: Number.isFinite(line) ? line : null, pid: child.pid ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `editor spawn failed: ${e?.message || e}` }, { status: 500 });
  }
}
