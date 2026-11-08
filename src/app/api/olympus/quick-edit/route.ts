/**
 * /api/olympus/quick-edit — v0.0.91: the 60-second lane.
 *
 * The mark already has a planning lane (Athena → approval → hop override).
 * This route is the fast lane: one bounded Athena turn writes the patch, the
 * server runs typecheck/lint, and the live preview hot-reloads. A patch that
 * is too large or fails verification is reverted from the snapshot.
 *
 * Body:
 *   { slug, instruction, mark?, viewport?, route?, previewUrl?, timeoutMs? }
 *   { slug, undo: true, backupRoot }
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveDispatchCwd } from '@/lib/opencode-spawn';
import { runQuickEdit, undoQuickEdit } from '@/lib/quick-edit';
import { markUserActivity } from '@/lib/user-activity';
import { appendGodInbox } from '@/lib/god-inbox';
import { appendActivity } from '@/lib/activity-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  markUserActivity(120_000);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  const slug = String(body?.slug || '').trim().replace(/[^a-zA-Z0-9._-]/g, '');
  if (!slug) {
    return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400 });
  }
  const laneRoot = resolveDispatchCwd(slug);

  // Deterministic undo.
  if (body?.undo === true) {
    const backupRoot = String(body?.backupRoot || '');
    if (!backupRoot) return NextResponse.json({ ok: false, error: 'backupRoot is required' }, { status: 400 });
    const result = undoQuickEdit(laneRoot, backupRoot);
    appendGodInbox('athena', {
      role: 'system',
      text: result.ok ? `Quick edit reverted: ${result.restored.length} file(s).` : `Quick edit undo failed: ${result.error}`,
      source: 'quick-edit',
      status: result.ok ? 'done' : 'failed',
      meta: { projectSlug: slug, backupRoot },
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }

  const instruction = String(body?.instruction || '').trim();
  if (!instruction) {
    return NextResponse.json({ ok: false, error: 'instruction is required' }, { status: 400 });
  }

  const result = await runQuickEdit({
    slug,
    laneRoot,
    instruction,
    mark: body?.mark && typeof body.mark.x === 'number' && typeof body.mark.y === 'number'
      ? { x: body.mark.x, y: body.mark.y }
      : undefined,
    viewport: body?.viewport,
    route: typeof body?.route === 'string' ? body.route : '/',
    previewUrl: typeof body?.previewUrl === 'string' ? body.previewUrl : undefined,
    timeoutMs: typeof body?.timeoutMs === 'number' ? Math.min(300_000, Math.max(30_000, body.timeoutMs)) : undefined,
  });

  appendGodInbox('athena', {
    role: 'system',
    text: result.ok
      ? `Quick edit applied — ${result.changedFiles.length + result.addedFiles.length} file(s), ${result.changedLines} line(s). ${result.message}`
      : `Quick edit reverted — ${result.error || result.message}`,
    source: 'quick-edit',
    status: result.ok ? 'done' : 'failed',
    meta: {
      projectSlug: slug,
      backupRoot: result.backupRoot,
      changedFiles: [...result.changedFiles, ...result.addedFiles],
      durationMs: result.durationMs,
      restored: result.restored,
    },
  });

  try {
    appendActivity({
      god: 'athena',
      action: result.ok ? 'milestone' : 'park',
      project: slug,
      msg: result.ok
        ? `Quick edit: ${result.changedFiles.length + result.addedFiles.length} file(s), ${result.changedLines} line(s) in ${Math.round(result.durationMs / 1000)}s`
        : `Quick edit reverted: ${result.error || result.message}`,
      meta: { kind: 'quick-edit', backupRoot: result.backupRoot, changedFiles: result.changedFiles },
    });
  } catch { /* best effort */ }

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/olympus/quick-edit',
    description: 'Direct <=3-file / <=200-line patch with typecheck + lint and deterministic undo.',
  });
}
