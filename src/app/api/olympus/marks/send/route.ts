/**
 * /api/olympus/marks/send — v0.1.1: marks go to Apollo's ONE terminal.
 *
 * The v0.0.94 route wrote a god inbox and ran a detached background turn —
 * a parallel chat that split the conversation. v0.1.1 formats the batch once,
 * enqueues it in the shared prompt queue as a HIGH Apollo item, and the
 * terminal drains it (visible in the queue, one consolidated prompt). No
 * inbox, no modal, no second planning lane.
 *
 * POST { slug, marks?, previewUrl? } -> { ok, queued, queueId, count }
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { markUserActivity } from '@/lib/user-activity';
import { readMarks } from '@/lib/marks-store';
import { enqueuePrompt } from '@/lib/prompt-queue';
import { marksPrompt, type PreviewMark } from '@/lib/marks-format';

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
  const previewUrl = body?.previewUrl ? String(body.previewUrl).slice(0, 1000) : undefined;

  const incoming: PreviewMark[] = Array.isArray(body?.marks) ? body.marks : readMarks(slug);
  const marks = incoming
    .filter((m) => Number.isFinite(Number(m?.x)) && Number.isFinite(Number(m?.y)) && String(m?.instruction ?? '').trim())
    .slice(0, 20);
  if (marks.length === 0) {
    return NextResponse.json({ ok: false, error: 'no valid marks to send' }, { status: 400 });
  }

  markUserActivity(120_000);
  const prompt = marksPrompt(slug, marks, previewUrl, 'apollo');
  const item = enqueuePrompt(slug, prompt, Date.now(), {
    source: 'markview',
    priority: 'high',
    god: 'apollo',
  });
  if (!item) {
    return NextResponse.json({ ok: true, queued: false, duplicate: true, count: marks.length, message: 'This mark batch is already queued for Apollo.' });
  }

  return NextResponse.json({
    ok: true,
    queued: true,
    target: 'apollo',
    count: marks.length,
    queueId: item.id,
    message: `${marks.length} mark${marks.length === 1 ? '' : 's'} sent to Apollo in the terminal — one consolidated batch.`,
  });
}
