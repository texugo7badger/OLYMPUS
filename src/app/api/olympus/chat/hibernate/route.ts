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
import { list, stop } from '@/lib/dev-server-manager';
import { pruneHibernationPlan } from '@/lib/hibernation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    pruneHibernationPlan();
    // v0.0.94 — hibernation frees the REAL memory hogs: every managed
    // project dev server (AIME next dev was 4 GB) plus the chat/MCP fleet.
    const stopped: string[] = [];
    try {
      for (const server of await list()) {
        if (server.state === 'running' || server.state === 'starting' || server.running) {
          try {
            const result = await stop(server.slug);
            if (result.ok) stopped.push(server.slug);
          } catch { /* one stubborn server must not block the rest */ }
        }
      }
    } catch { /* dev servers are best-effort; the chat cleanup still runs */ }
    cleanupServer();
    return NextResponse.json({ ok: true, stopped: true, devServers: stopped, note: 'Chat/MCP and idle preview servers stopped; they restart on demand.' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
