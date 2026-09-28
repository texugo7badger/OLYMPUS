/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPendingGates, resolveGate, getGate } from '@/lib/hitl-gates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/hitl/gates
 *   Returns all pending HITL gates (decision === null). Polled by the UI
 *   every 5 seconds to show toast notifications for new gates.
 */
export async function GET() {
  try {
    const gates = getPendingGates();
    return NextResponse.json({
      ok: true,
      gates,
      count: gates.length,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Vary': '*',
        'X-Olympus-Hitl-Refresh': '5s',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/olympus/hitl/gates
 *   Body: { gateId: string, decision: 'approve' | 'patch' | 'abort', userNote?: string }
 *   Resolves a pending gate with the user's decision. The dispatch-tracker
 *   polls the gate's state and resumes (or aborts) accordingly.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { gateId, decision, userNote } = body;

    if (!gateId || typeof gateId !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing "gateId" in body' }, { status: 400 });
    }
    if (!['approve', 'patch', 'abort'].includes(decision)) {
      return NextResponse.json({ ok: false, error: 'Invalid "decision". Expected "approve", "patch", or "abort".' }, { status: 400 });
    }

    const gate = resolveGate(gateId, decision, userNote);
    if (!gate) {
      return NextResponse.json({ ok: false, error: `Gate "${gateId}" not found` }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      gate,
      message: decision === 'approve'
        ? 'Gate approved — dispatch will resume.'
        : decision === 'patch'
        ? 'Gate patched — dispatch will resume with your modifications.'
        : 'Gate aborted — dispatch cancelled.',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
