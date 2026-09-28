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
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT_ROOT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
const FEED_PATH = path.join(VAULT_ROOT, '06_Activity_Feed', 'live.jsonl');

/**
 * Read the last N lines of live.jsonl (tail-style).
 */
function tailLines(filePath: string, maxLines = 50): string[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

/**
 * GET — returns the latest pending design-review request.
 * The UI polls this (or watches via WebSocket) to detect when Athena has
 * surfaced design candidates.
 */
export async function GET(_req: NextRequest) {
  try {
    const lines = tailLines(FEED_PATH, 100);
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
