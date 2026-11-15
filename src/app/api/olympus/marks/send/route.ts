/**
 * /api/olympus/marks/send — v0.0.92: send the whole mark batch to Apollo.
 *
 * The preview window's primary action. The marks are already persisted by
 * /api/olympus/marks; this route turns them into ONE consolidated planning
 * prompt, records it in the god's durable inbox, and runs a bounded turn.
 *
 * The reply is also written back to the inbox, so the batch survives a closed
 * window and can be read from Apollo's terminal later.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth } from '@/lib/auth';
import { resolveDispatchCwd } from '@/lib/opencode-spawn';
import { getVaultRoot } from '@/lib/vault-root';
import { markUserActivity } from '@/lib/user-activity';
import { runGodTurn, GO_FALLBACK_MODEL } from '@/lib/god-run';
import { appendGodInbox, updateGodInbox } from '@/lib/god-inbox';
import { readMarks } from '@/lib/marks-store';
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
  const target: 'apollo' | 'athena' = body?.target === 'athena' ? 'athena' : 'apollo';
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
  const prompt = marksPrompt(slug, marks, previewUrl, target);
  const lane = resolveDispatchCwd(slug);

  const inboxEntry = appendGodInbox(target, {
    role: 'you',
    text: `${marks.length} mark(s) — ${marks[0].instruction.slice(0, 300)}`,
    source: 'mark',
    status: 'pending',
    meta: {
      dispatchId,
      batch: true,
      count: marks.length,
      previewUrl: previewUrl || null,
      marks: marks.map((m) => ({ x: m.x, y: m.y, page: m.page, instruction: m.instruction })),
    },
  });

  updateGodInbox(target, inboxEntry.id, { status: 'running' });
  const startedAt = Date.now();
  try {
    const turn = await runGodTurn(
      target,
      prompt,
      lane,
      300_000,
      target === 'athena' ? { model: GO_FALLBACK_MODEL } : {},
    );
    if (!turn.ok) {
      appendGodInbox(target, {
        role: 'system',
        text: `mark batch failed: ${turn.error}`,
        source: 'mark',
        status: 'failed',
        replyTo: inboxEntry.id,
        meta: { dispatchId, slug, count: marks.length },
      });
      updateGodInbox(target, inboxEntry.id, { status: 'failed' });
      return NextResponse.json({ ok: false, error: turn.error, inboxId: inboxEntry.id, count: marks.length }, { status: 502 });
    }

    appendGodInbox(target, {
      role: 'god',
      text: turn.text,
      source: 'mark',
      status: 'done',
      replyTo: inboxEntry.id,
      meta: { dispatchId, slug, count: marks.length, durationMs: turn.durationMs },
    });
    updateGodInbox(target, inboxEntry.id, { status: 'done' });

    try {
      const feed = path.join(getVaultRoot(), '06_Activity_Feed', 'live.jsonl');
      fs.mkdirSync(path.dirname(feed), { recursive: true });
      fs.appendFileSync(feed, JSON.stringify({
        ts: new Date().toISOString(),
        god: target,
        action: 'delegation',
        msg: `${marks.length} mark(s) sent to ${target} for one consolidated plan`,
        project: slug,
        meta: { dispatchId, inboxId: inboxEntry.id, count: marks.length, lane, durationMs: turn.durationMs },
      }) + '\n', 'utf-8');
    } catch { /* non-fatal */ }

    return NextResponse.json({
      ok: true,
      target,
      count: marks.length,
      plan: turn.text,
      lane,
      durationMs: Date.now() - startedAt,
      inboxId: inboxEntry.id,
      dispatchId,
    });
  } catch (e: any) {
    appendGodInbox(target, {
      role: 'system',
      text: `mark batch failed: ${e?.message || String(e)}`,
      source: 'mark',
      status: 'failed',
      replyTo: inboxEntry.id,
      meta: { dispatchId, slug, count: marks.length },
    });
    updateGodInbox(target, inboxEntry.id, { status: 'failed' });
    return NextResponse.json({ ok: false, error: e?.message || String(e), inboxId: inboxEntry.id }, { status: 500 });
  }
}
