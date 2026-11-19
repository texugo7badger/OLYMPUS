/**
 * /api/olympus/marks/retry — v0.0.94: retry a failed/legacy mark batch.
 *
 * POST { inboxId, slug?, target? } → queues the same marks again in the
 * background; the old failure stays in the inbox as history.
 *
 * This is how the 2026-11-16 five-mark batch (Apollo timed out at 300s) can
 * be recovered instead of asking the user to copy it into the chat.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { planFor } from '@/lib/marks-plan';
import { MARK_BOOT_ID, startMarkPlan, type MarkTarget } from '@/lib/marks-run';
import { updateGodInbox } from '@/lib/god-inbox';
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
  const inboxId = String(body?.inboxId || '').trim();
  if (!inboxId) return NextResponse.json({ ok: false, error: 'inboxId is required' }, { status: 400 });
  const requestedTarget: MarkTarget | undefined = body?.target === 'athena' ? 'athena' : body?.target === 'apollo' ? 'apollo' : undefined;
  const view = planFor(inboxId, requestedTarget ?? null);
  if (!view) return NextResponse.json({ ok: false, error: 'batch not found' }, { status: 404 });
  if (view.status === 'running' || view.status === 'pending') {
    return NextResponse.json({ ok: true, queued: true, alreadyRunning: true, inboxId, target: view.target });
  }
  const raw = Array.isArray(view.user.meta?.marks) ? view.user.meta!.marks as any[] : [];
  const marks: PreviewMark[] = raw
    .filter((m) => Number.isFinite(Number(m?.x)) && Number.isFinite(Number(m?.y)) && String(m?.instruction ?? '').trim())
    .map((m, i) => ({
      id: String(m?.id ?? `retry-${inboxId}-${i}`),
      x: Number(m.x),
      y: Number(m.y),
      page: String(m?.page ?? '/'),
      instruction: String(m.instruction),
      viewport: m?.viewport ?? undefined,
      createdAt: new Date().toISOString(),
    }));
  if (marks.length === 0) return NextResponse.json({ ok: false, error: 'the batch has no marks to retry' }, { status: 409 });
  const slug = String(body?.slug || view.slug || '').trim();
  if (!slug) return NextResponse.json({ ok: false, error: 'slug is required to retry a legacy batch' }, { status: 400 });
  const target = (body?.target === 'athena' ? 'athena' : view.target) as MarkTarget;
  const previewUrl = typeof view.user.meta?.previewUrl === 'string' ? view.user.meta.previewUrl : undefined;
  const dispatchId = `marks-retry-${target}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  updateGodInbox(target, inboxId, { status: 'running', meta: { ...(view.user.meta ?? {}), startedAt: new Date().toISOString(), bootId: MARK_BOOT_ID } });
  startMarkPlan({ target, slug, marks, previewUrl, inboxId, dispatchId });
  return NextResponse.json({ ok: true, queued: true, retried: true, inboxId, target, count: marks.length, dispatchId });
}
