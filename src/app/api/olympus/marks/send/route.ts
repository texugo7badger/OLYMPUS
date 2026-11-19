/**
 * /api/olympus/marks/send — v0.0.94: durable background plan.
 *
 * POST { slug, marks?, target?, previewUrl? } → { ok, queued, inboxId, count }
 * The batch is written to the god's inbox immediately; the turn runs in the
 * background. Poll /api/olympus/marks/plan?inboxId=… for the plan. A closed
 * window no longer loses the batch or the plan.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { markUserActivity } from '@/lib/user-activity';
import { appendGodInbox, updateGodInbox } from '@/lib/god-inbox';
import { readMarks } from '@/lib/marks-store';
import { MARK_BOOT_ID, startMarkPlan, type MarkTarget } from '@/lib/marks-run';
import type { PreviewMark } from '@/lib/marks-format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  let body: any = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const slug = String(body?.slug ?? '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required' }, { status: 400 });
  const target: MarkTarget = body?.target === 'athena' ? 'athena' : 'apollo';
  const previewUrl = body?.previewUrl ? String(body.previewUrl).slice(0, 1000) : undefined;

  const incoming: PreviewMark[] = Array.isArray(body?.marks) ? body.marks : readMarks(slug);
  const marks = incoming
    .filter((m) => Number.isFinite(Number(m?.x)) && Number.isFinite(Number(m?.y)) && String(m?.instruction ?? '').trim())
    .slice(0, 20);
  if (marks.length === 0) {
    return NextResponse.json({ ok: false, error: 'no valid marks to send' }, { status: 400 });
  }

  markUserActivity(120_000);
  const dispatchId = `marks-${target}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inboxEntry = appendGodInbox(target, {
    role: 'you',
    text: `${marks.length} mark(s) — ${marks[0].instruction.slice(0, 300)}`,
    source: 'mark',
    status: 'pending',
    meta: {
      dispatchId,
      slug,
      target,
      batch: true,
      count: marks.length,
      previewUrl: previewUrl || null,
      startedAt: new Date().toISOString(),
      bootId: MARK_BOOT_ID,
      marks: marks.map((m) => ({ x: m.x, y: m.y, page: m.page, instruction: m.instruction, viewport: m.viewport ?? null })),
    },
  });

  updateGodInbox(target, inboxEntry.id, { status: 'running' });
  startMarkPlan({ target, slug, marks, previewUrl, inboxId: inboxEntry.id, dispatchId });

  return NextResponse.json({
    ok: true,
    queued: true,
    target,
    count: marks.length,
    inboxId: inboxEntry.id,
    dispatchId,
    message: `${marks.length} mark${marks.length === 1 ? '' : 's'} queued for ${target}; the plan survives a closed window.`,
  });
}
