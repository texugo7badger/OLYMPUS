/**
 * /api/olympus/atlas/warden — v0.0.89: Atlas's always-on status + decision.
 *
 * GET  → { ok, state, decision, model: 'opencode-go/hy3' }
 * POST → { action: 'continue' | 'new-project' | 'dismiss', slug? }
 *
 * `continue` opts the campaign into auto-resume and starts the detached walk;
 * `new-project` clears the decision so the UI opens the project wizard;
 * `dismiss` keeps the campaign parked for a later manual resume. No route here
 * dispatches a model turn — Apollo is never prompted automatically.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { readWardenState, resolveDecision, wardenTick } from '@/lib/atlas-warden';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  let state = readWardenState();
  // The instrumentation interval is the producer; a cold read (dev server,
  // first boot) may precede it. Refresh at most once every 10s.
  const age = state.at ? Date.now() - Date.parse(state.at) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(age) || age > 10_000) {
    try { state = wardenTick(); } catch { /* the last state is still honest */ }
  }
  return NextResponse.json({
    ok: true,
    model: 'opencode-go/hy3',
    state,
    decision: state.decision,
  }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || '');
  if (action !== 'continue' && action !== 'new-project' && action !== 'dismiss') {
    return NextResponse.json({ ok: false, error: "action must be 'continue' | 'new-project' | 'dismiss'" }, { status: 400 });
  }
  const result = resolveDecision(action, typeof body?.slug === 'string' ? body.slug : undefined);
  return NextResponse.json({ ...result, ok: result.ok }, { headers: NO_CACHE_HEADERS });
}
