/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveDispatchCwd } from '@/lib/opencode-spawn';
import { getVaultRoot } from '@/lib/vault-root';
import { markUserActivity } from '@/lib/user-activity';
import { runGodTurn, GO_FALLBACK_MODEL } from '@/lib/god-run';
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
    const { x, y, instruction, projectSlug, viewport, route, previewUrl } = body;

    // v0.0.91 — BATCH MARKS. The large preview window can collect marks
    // across pages; one planning turn must see all of them together.
    const rawMarks = Array.isArray(body?.marks) ? body.marks : null;
    const batch = Boolean(rawMarks && rawMarks.length > 0);
    const marks = batch
      ? rawMarks!.slice(0, 20).map((m: any, i: number) => ({
          index: i + 1,
          x: Number(m?.x),
          y: Number(m?.y),
          instruction: String(m?.instruction ?? '').trim(),
          page: String(m?.page ?? route ?? previewUrl ?? '/').slice(0, 500),
          viewport: m?.viewport ?? viewport ?? null,
        })).filter((m: any) => Number.isFinite(m.x) && Number.isFinite(m.y) && m.instruction)
      : [];
    if (batch && marks.length === 0) {
      return NextResponse.json({ ok: false, error: 'marks must contain at least one valid {x,y,instruction}' }, { status: 400 });
    }
    if (!batch && (typeof x !== 'number' || typeof y !== 'number')) {
      return NextResponse.json(
        { ok: false, error: 'x and y must be numbers' },
        { status: 400 }
      );
    }
    if (!batch && (!instruction || typeof instruction !== 'string' || !instruction.trim())) {
      return NextResponse.json(
        { ok: false, error: 'instruction is required' },
        { status: 400 }
      );
    }

    // Generate a dispatch ID for tracking
    const dispatchId = `athena-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build the instruction for Athena.
    const athenaInstruction = batch
      ? `Batch mark review — PLANNING turn (do not edit yet):

**Marks:** ${marks.length} collected in the large preview window, across the pages named below.
**Preview URL:** ${previewUrl || '(unknown — use the project preview)'}
**Project:** ${projectSlug || '(browsing mode)'}

${marks.map((m: any) => `${m.index}. page ${m.page} — (${m.x}, ${m.y}) in ${m.viewport?.width || viewport?.width || '?'}x${m.viewport?.height || viewport?.height || '?'}: ${m.instruction}`).join('\n')}

## Your job in this turn: one consolidated plan, do NOT edit

1. Inspect the preview and the named pages. Treat all ${marks.length} marks as ONE batch; if an intent is ambiguous, ask at most THREE short questions TOTAL (not per mark).
2. Produce ONE consolidated plan grouped by page/file. For each group: the exact component/file, the concrete change, and why it belongs with the others. Prefer the smallest coherent set of edits.
3. End with a single line: "Approve to send to Apollo + Atlas."
4. Do not write files and do not dispatch anything in this turn. The user's approval is the gate; after approval the consolidated plan becomes a hop override and Atlas applies it; Apollo's deeper plan stays optional.

Keep it concrete and batched. The OLYMPUS terminal is Apollo's; this thread is yours.`
      : `Click-to-element mark — PLANNING turn (do not edit yet):

**Coordinates:** (${x}, ${y}) in CSS pixels relative to the PREVIEW IFRAME viewport — not the OLYMPUS app window.
**Preview viewport:** ${viewport?.width || '?'}x${viewport?.height || '?'} (DPR ${viewport?.devicePixelRatio || 1})
**Preview URL:** ${previewUrl || '(unknown — use the project preview)'}
**Route:** ${route || '/'}
**Project:** ${projectSlug || '(browsing mode)'}

**User's mark:**
${instruction}

## Your job in this turn: plan with the user, do NOT edit

1. Inspect the preview at the URL above; the mark is the CSS pixel (${x}, ${y}) in that iframe's viewport. If the intent is ambiguous, ask at most TWO short questions.
2. Otherwise propose a concise plan (2–4 bullets): the exact component/file, the change, and whether this is a fix to the current parked hop or a new hop.
3. End with a single line: "Approve to send to Apollo + Atlas."
4. Do not write files and do not dispatch anything in this turn. The user's approval is the gate; after approval the plan becomes a hop override and Atlas applies it on the next attempt; Apollo's deeper plan stays optional.

Keep it fast and concrete. The OLYMPUS terminal is Apollo's; this thread is yours.`;


    const firstInstruction = batch ? marks[0].instruction : String(instruction || '');
    const feedMsg = batch
      ? `Batch marks: ${marks.length} across ${Array.from(new Set(marks.map((m: any) => m.page))).slice(0, 3).join(', ')}`
      : `Click-to-element dispatch: "${firstInstruction.slice(0, 100)}" at (${x}, ${y})`;

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
        msg: feedMsg,
        project: projectSlug || null,
        meta: {
          dispatchId,
          ...(batch
            ? { batch: true, count: marks.length, marks: marks.map((m: any) => ({ x: m.x, y: m.y, page: m.page, instruction: m.instruction.slice(0, 300) })) }
            : { x, y, instruction: firstInstruction.slice(0, 500) }),
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
      text: batch ? `${marks.length} marks — ${firstInstruction.slice(0, 300)}` : firstInstruction,
      source: 'mark',
      status: 'pending',
      meta: {
        dispatchId,
        ...(batch
          ? { batch: true, count: marks.length, marks: marks.map((m: any) => ({ x: m.x, y: m.y, page: m.page, instruction: m.instruction })) }
          : { x, y }),
        route: route || '/', viewport, previewUrl: previewUrl || null, projectSlug: projectSlug || null,
      },
    });

    const lane = resolveDispatchCwd(projectSlug);
    void (async () => {
      updateGodInbox('athena', inboxEntry.id, { status: 'running' });
      try {
        // v0.0.91 — the current GO credential does not admit qwen3.7-plus
        // (provider.auth 401); deepseek-v4.1-flash is the verified model and
        // reacts in seconds. Do not spend the turn on the known 401.
        const turn = await runGodTurn('athena', athenaInstruction, lane, 300_000, { model: GO_FALLBACK_MODEL });
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
      message: batch
        ? `${marks.length} marks in Athena's terminal — she will plan them together.`
        : `In Athena's terminal. She will apply it to the current work: "${firstInstruction.slice(0, 100)}"`,
      ...(batch ? { batch: true, count: marks.length, marks } : { coordinates: { x, y } }),
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
