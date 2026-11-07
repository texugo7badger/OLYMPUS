/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveDispatchCwd } from '@/lib/opencode-spawn';
import { getVaultRoot } from '@/lib/vault-root';
import { markUserActivity } from '@/lib/user-activity';
import { runGodTurn } from '@/lib/god-run';
import { appendGodInbox, updateGodInbox } from '@/lib/god-inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAULT_ROOT = getVaultRoot();

/**
 * POST /api/olympus/athena/edit
 *
 * Dispatches a click-to-element edit request to Athena (athena).
 * The user clicked an element in the live preview, described the change,
 * and this endpoint sends the instruction to Athena who uses the impeccable
 * skill to process it.
 *
 * Body:
 *   {
 *     x: number,            — x coordinate of the click (relative to preview)
 *     y: number,            — y coordinate of the click
 *     instruction: string,  — user's natural language description of the change
 *     projectSlug: string,  — active project slug (or null)
 *     viewport: { width, height, devicePixelRatio },
 *     route: string         — current URL path in the iframe
 *   }
 *
 * Returns:
 *   { ok, dispatchId, message }
 *
 * v0.0.86 — the mark LIVES IN ATHENA'S TERMINAL. The request is written to
 * her durable inbox (the Parthenon's god chat renders it) with status
 * `pending`, her turn runs in the background, and the reply (or the failure)
 * is appended to the same thread. Nothing is `stdio: 'ignore'` any more: the
 * user can watch the mark being worked, and the instruction is framed as a
 * steering request for the work Athena is already doing.
 */
export async function POST(req: NextRequest) {
  markUserActivity(120_000);
  try {
    const body = await req.json();
    const { x, y, instruction, projectSlug, viewport, route } = body;

    // Validate required fields
    if (typeof x !== 'number' || typeof y !== 'number') {
      return NextResponse.json(
        { ok: false, error: 'x and y must be numbers' },
        { status: 400 }
      );
    }
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return NextResponse.json(
        { ok: false, error: 'instruction is required' },
        { status: 400 }
      );
    }

    // Generate a dispatch ID for tracking
    const dispatchId = `athena-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build the instruction for Athena
    const athenaInstruction = `Click-to-element edit request:

**Coordinates:** (${x}, ${y}) relative to the live preview iframe
**Viewport:** ${viewport?.width || '?'}x${viewport?.height || '?'} (DPR ${viewport?.devicePixelRatio || 1})
**Route:** ${route || '/'}
**Project:** ${projectSlug || '(browsing mode)'}

**User's instruction:**
${instruction}

## This is a steering request for your CURRENT work

If you are already working on this project (a hop, a task, or a live preview
fix), treat this mark as an adjustment to that work: apply it in place before
starting anything new, and keep the current task moving. If nothing is in
flight, apply the edit directly.

## Your Task

1. Use the impeccable skill to process this edit request.
2. If the instruction is a trivial change (set-text, set-style), apply it client-side via /impeccable live preview.
3. If the instruction is a structural change, use /impeccable live to generate 3 variants, then accept the best one.
4. After applying the change, run /impeccable audit to verify design quality.
5. Log the result to the activity feed.

## Context

The user clicked at (${x}, ${y}) on the live preview running at ${route || '/'}.
The dev server is running on the project's livePreviewPort.
Use serena MCP if you need to find the component by symbol name.
Use context7 MCP if you need library documentation.`;

    // Append to activity feed
    const feedPath = path.join(VAULT_ROOT, '06_Activity_Feed', 'live.jsonl');
    try {
      const dir = path.dirname(feedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const event = {
        ts: new Date().toISOString(),
        god: 'athena',
        action: 'delegation',
        msg: `Click-to-element dispatch: "${instruction.slice(0, 100)}" at (${x}, ${y})`,
        project: projectSlug || null,
        meta: {
          dispatchId,
          x, y,
          instruction: instruction.slice(0, 500),
          viewport,
          route,
        },
      };
      fs.appendFileSync(feedPath, JSON.stringify(event) + '\n', 'utf-8');
    } catch {
      // Non-fatal
    }

    // v0.0.86 — THE MARK IS IN ATHENA'S TERMINAL.
    // One inbox row is the user's mark (pending); her turn runs in the
    // background and its reply lands in the same thread. `resolveDispatchCwd`
    // keeps the cwd in the PROJECT lane (never the OLYMPUS repo, #99/#104).
    const inboxEntry = appendGodInbox('athena', {
      role: 'you',
      text: instruction,
      source: 'mark',
      status: 'pending',
      meta: { dispatchId, x, y, route: route || '/', viewport, projectSlug: projectSlug || null },
    });

    const lane = resolveDispatchCwd(projectSlug);
    void (async () => {
      updateGodInbox('athena', inboxEntry.id, { status: 'running' });
      try {
        const turn = await runGodTurn('athena', athenaInstruction, lane, 300_000);
        if (turn.ok) {
          appendGodInbox('athena', {
            role: 'god',
            text: turn.text,
            source: 'mark',
            status: 'done',
            replyTo: inboxEntry.id,
            meta: { dispatchId, projectSlug: projectSlug || null },
          });
          updateGodInbox('athena', inboxEntry.id, { status: 'done' });
          try {
            fs.appendFileSync(feedPath, JSON.stringify({
              ts: new Date().toISOString(),
              god: 'athena',
              action: 'response',
              msg: `Mark handled: ${turn.text.slice(0, 300)}`,
              project: projectSlug || null,
              meta: { dispatchId, inboxId: inboxEntry.id, durationMs: turn.durationMs },
            }) + '\n', 'utf-8');
          } catch { /* non-fatal */ }
        } else {
          appendGodInbox('athena', {
            role: 'system',
            text: `mark failed: ${turn.error}`,
            source: 'mark',
            status: 'failed',
            replyTo: inboxEntry.id,
            meta: { dispatchId, projectSlug: projectSlug || null },
          });
          updateGodInbox('athena', inboxEntry.id, { status: 'failed' });
        }
      } catch (err: any) {
        appendGodInbox('athena', {
          role: 'system',
          text: `mark failed: ${err?.message || String(err)}`,
          source: 'mark',
          status: 'failed',
          replyTo: inboxEntry.id,
          meta: { dispatchId, projectSlug: projectSlug || null },
        });
        updateGodInbox('athena', inboxEntry.id, { status: 'failed' });
      }
    })();

    return NextResponse.json({
      ok: true,
      dispatchId,
      inboxId: inboxEntry.id,
      message: `In Athena's terminal. She will apply it to the current work: "${instruction.slice(0, 100)}"`,
      coordinates: { x, y },
      project: projectSlug || null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/olympus/athena/edit
 * Returns endpoint info.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/olympus/athena/edit',
    description: 'Dispatches a click-to-element edit request to Athena (athena).',
    body: {
      x: 'number (required) — x coordinate of the click',
      y: 'number (required) — y coordinate of the click',
      instruction: 'string (required) — user\'s natural language description',
      projectSlug: 'string (optional) — active project slug',
      viewport: 'object (optional) — { width, height, devicePixelRatio }',
      route: 'string (optional) — current URL path in the iframe',
    },
  });
}
