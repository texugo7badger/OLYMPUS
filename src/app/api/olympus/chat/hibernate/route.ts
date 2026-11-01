/**
 * POST /api/olympus/chat/hibernate — v0.0.32 (hibernation mode).
 *
 * Frees the app chat server (:3777) and its MCP fleet while the campaign
 * keeps running on its lane hop server. The UI is destroyed by the Electron
 * main; the next prompt recreates the chat server on demand.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */
import { NextResponse } from 'next/server';
import { cleanupServer } from '@/lib/opencode-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    cleanupServer();
    return NextResponse.json({ ok: true, stopped: true, note: 'The app chat server will restart on the next prompt.' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
