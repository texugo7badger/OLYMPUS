/**
 * GET /api/olympus/design-review
 *   Returns the latest pending design-review request (or null if none).
 *
 * POST /api/olympus/design-review
 *   Body: { reviewId: string, selection: string }
 *   Writes a "design-review-selected" event to live.jsonl so Athena picks
 *   up the user's choice as a follow-up in the conversation.
 *
 * The design-review UI feature.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getVaultRoot } from '@/lib/vault-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT_ROOT = getVaultRoot();
const FEED_PATH = path.join(VAULT_ROOT, '06_Activity_Feed', 'live.jsonl');

/**
 * #196 — byte-offset tail of live.jsonl. The 2s poll never full-reads the
 * feed: module state tracks the last seen size and only NEW bytes are read
 * (capped per catch-up at TAIL_CAP_BYTES). A rolling window of the last
 * TAIL_KEEP_LINES parsed lines replaces the old full-file `tailLines`.
 * Reset on shrink (rotation/truncation) and on first read (seeded with a
 * capped tail so a pending review from before the process started is
 * still found).
 */
const TAIL_CAP_BYTES = 256 * 1024;
const TAIL_KEEP_LINES = 100;
const tail = {
  started: false,
  size: 0,
  partial: '',
  lines: [] as string[],
};

function tailLines(): string[] {
  let st: fs.Stats;
  try { st = fs.statSync(FEED_PATH); } catch {
    tail.started = false; tail.size = 0; tail.partial = ''; tail.lines = [];
    return tail.lines;
  }
  // Reseed on first read or shrink (rotation/truncation): restart from a
  // capped tail window. Otherwise continue from the last seen size.
  const reseed = !tail.started || st.size < tail.size;
  const from = reseed ? Math.max(0, st.size - TAIL_CAP_BYTES) : tail.size;
  if (reseed) {
    tail.started = true;
    tail.partial = '';
    tail.lines = [];
  }
  if (st.size <= from) return tail.lines;
  // Read only the NEW bytes; if growth exceeds the cap, jump the window.
  const jumped = st.size - from > TAIL_CAP_BYTES;
  const readFrom = jumped ? st.size - TAIL_CAP_BYTES : from;
  try {
    const fh = fs.openSync(FEED_PATH, 'r');
    try {
      const buf = Buffer.alloc(st.size - readFrom);
      fs.readSync(fh, buf, 0, buf.length, readFrom);
      tail.size = st.size;
      let chunk = tail.partial + buf.toString('utf-8');
      // A reseeded/jumped window starts at an arbitrary byte — its first
      // line is partial and must be dropped. A boundary-continuing read
      // (partial === '', from === last size) keeps every new line.
      const midLine = (reseed || jumped) && readFrom > 0;
      if (midLine && tail.partial === '' && chunk.indexOf('\n') !== -1) {
        chunk = chunk.slice(chunk.indexOf('\n') + 1);
      }
      const parts = chunk.split('\n');
      tail.partial = parts.pop() || '';
      for (const l of parts) {
        if (!l.trim()) continue;
        tail.lines.push(l);
        if (tail.lines.length > TAIL_KEEP_LINES) tail.lines.shift();
      }
    } finally {
      fs.closeSync(fh);
    }
  } catch { /* keep whatever we already have */ }
  return tail.lines;
}

/**
 * GET — returns the latest pending design-review request.
 * The UI polls this (or watches via WebSocket) to detect when Athena has
 * surfaced design candidates.
 */
export async function GET(_req: NextRequest) {
  try {
    const lines = tailLines();
    // Walk backwards to find the latest "design-review-requested" event
    // that hasn't been followed by a "design-review-selected" for the same reviewId.
    const selectedIds = new Set<string>();
    for (const line of lines) {
      try {
        const evt = JSON.parse(line);
        if (evt.action === 'design-review-selected' && evt.review_id) {
          selectedIds.add(evt.review_id);
        }
      } catch {}
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const evt = JSON.parse(lines[i]);
        if (evt.action === 'design-review-requested' && evt.review_id) {
          if (!selectedIds.has(evt.review_id)) {
            return NextResponse.json({
              ok: true,
              review: {
                reviewId: evt.review_id,
                god: evt.god,
                taskContext: evt.task_context || evt.meta?.taskContext || '',
                candidates: evt.candidates || evt.meta?.candidates || [],
                ts: evt.ts,
              },
            });
          }
        }
      } catch {}
    }
    return NextResponse.json({ ok: true, review: null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST — the user has selected a design system.
 * Body: { reviewId: string, selection: string }
 * Writes a "design-review-selected" event to live.jsonl. The UI injects
 * "I selected [selection]. Please proceed with this design reference."
 * into the Apollo chat as a user message, so Athena picks it up naturally.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reviewId, selection } = body;
    if (!reviewId || !selection) {
      return NextResponse.json(
        { ok: false, error: 'Missing reviewId or selection' },
        { status: 400 },
      );
    }

    const dir = path.dirname(FEED_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const event = {
      ts: new Date().toISOString(),
      god: 'athena',
      action: 'design-review-selected',
      review_id: reviewId,
      selection,
      msg: `User selected design system: ${selection}`,
      meta: {
        reviewId,
        selection,
      },
    };
    fs.appendFileSync(FEED_PATH, JSON.stringify(event) + '\n', 'utf-8');

    return NextResponse.json({ ok: true, reviewId, selection });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
