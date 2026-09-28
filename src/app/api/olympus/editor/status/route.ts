/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextResponse } from 'next/server';
import { detectAllEditors, loadEditorConfig, resolveEditor } from '@/lib/editor-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/olympus/editor/status
 *
 * Returns the current editor bridge status: which editor is configured,
 * which is detected, and whether the Terminal Bridge (port 3740) is
 * reachable (used by IDE extensions to know if OLYMPUS is running).
 *
 * This route is polled by the Editor Bridge UI tab every 5 seconds so the
 * user always sees a live view of their editor + bridge state.
 */
export async function GET() {
  try {
    const cfg = loadEditorConfig();
    const detected = detectAllEditors();
    const resolved = resolveEditor(cfg, detected);

    // Probe the Terminal Bridge — a 200 from /api/olympus/editor/bridge-health
    // would be the cleanest check, but we can also just try a TCP connect to
    // 127.0.0.1:3740. We don't actually open a WebSocket here (that would
    // require the token); we just see if the port is listening.
    let bridgeListening = false;
    try {
      const net = await import('node:net');
      await new Promise<void>((resolve) => {
        const sock = new net.Socket();
        sock.setTimeout(500);
        sock.once('connect', () => { bridgeListening = true; sock.destroy(); resolve(); });
        sock.once('timeout', () => { sock.destroy(); resolve(); });
        sock.once('error', () => { sock.destroy(); resolve(); });
        sock.connect(3740, '127.0.0.1');
      });
    } catch {}

    return NextResponse.json({
      config: cfg,
      detected,
      resolved: resolved ? {
        editorId: resolved.entry.id,
        editorName: resolved.entry.displayName,
        binPath: resolved.binPath,
      } : null,
      bridge: {
        port: 3740,
        host: '127.0.0.1',
        listening: bridgeListening,
        tokenFile: '~/.olympus/terminal-bridge-token',
      },
      ts: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'status failed' }, { status: 500 });
  }
}
