/**
 * GET /api/olympus/god/inbox — v0.0.86: the durable per-god terminal history.
 *
 * The Parthenon's god chat used to be memory-only; this endpoint returns the
 * last N inbox entries for one god (chat turns + mark-preview requests and
 * their replies), oldest → newest, so the modal renders one conversation and
 * a mark sent from the phone appears in Athena's terminal on the desktop.
 *
 * Query: ?god=athena&limit=60
 * Returns: { ok, god, entries, pendingMarks }
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireReadAuth } from '@/lib/auth';
import { NO_CACHE_HEADERS } from '@/app/api/olympus/_lib/no-cache';
import { readGodInbox, pendingGodInboxCount } from '@/lib/god-inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GODS = new Set(['apollo', 'atlas', 'artemis', 'athena', 'dionysus', 'hephaestus', 'hermes', 'persephone', 'prometheus', 'callimachus']);

export async function GET(req: NextRequest) {
  const denied = requireReadAuth(req);
  if (denied) return denied;
  const god = String(req.nextUrl.searchParams.get('god') || '').toLowerCase();
  if (!GODS.has(god)) {
    return NextResponse.json({ ok: false, error: `unknown god: ${god || '(missing)'}` }, { status: 400 });
  }
  const limit = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get('limit')) || 60));
  const entries = readGodInbox(god, limit);
  return NextResponse.json({
    ok: true,
    god,
    entries,
    pendingMarks: pendingGodInboxCount(god),
  }, { headers: NO_CACHE_HEADERS });
}
