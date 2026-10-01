/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
// Use spawnOpencode() for cross-platform support.
import { spawnOpencode } from '@/lib/opencode-spawn';
import { getVaultRoot } from '@/lib/vault-root';

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
 * The actual edit is performed asynchronously by Athena (via opencode run).
 * Progress is tracked in the activity feed.
 */
export async function POST(req: NextRequest) {
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

    // Dispatch to Athena via opencode run (async — don't block the response)
    // Use spawnOpencode() for Windows shell:true + stdin:'ignore'.
    // Spawn Athena asynchronously (fire and forget) — stdio:'ignore' + detached.
    const child = spawnOpencode(
      ['run', '--agent', 'athena', athenaInstruction],
      {
        extraEnv: {
          OLYMPUS_DISPATCH_ID: dispatchId,
          OLYMPUS_PROJECT_SLUG: projectSlug || '',
        },
        detached: true,
        stdio: 'ignore',
      },
    );

    // Unref the child so it doesn't keep the Node process alive
    child.unref();

    // Log spawn errors (non-fatal)
    child.on('error', (err: any) => {
      try {
        const errEvent = {
          ts: new Date().toISOString(),
          god: 'athena',
          action: 'error',
          msg: `Athena dispatch failed: ${err.message}`,
          project: projectSlug || null,
          meta: { dispatchId },
        };
        fs.appendFileSync(feedPath, JSON.stringify(errEvent) + '\n', 'utf-8');
      } catch {}
    });

    return NextResponse.json({
      ok: true,
      dispatchId,
      message: `Athena dispatched. She will process your request: "${instruction.slice(0, 100)}"`,
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
