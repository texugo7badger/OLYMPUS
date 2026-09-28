/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
// Use spawnOpencode() for cross-platform support.
import { spawnOpencode } from '@/lib/opencode-spawn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/olympus/compact
 *
 * Backward-compatible endpoint for the legacy compact-brain button. The
 * canonical path is now POST /api/olympus/callimachus/heartbeat with
 * { deep: true }, which is what the UI calls. This endpoint remains as a
 * thin shim that spawns Callimachus in deep mode and streams JSON lines
 * back as SSE for any client still hitting the old URL.
 *
 * Spawns `opencode run /callimachus-heartbeat --deep --agent callimachus`.
 */
export async function POST(req: NextRequest) {
  // spawnOpencode handles Windows shell:true + stdin:'ignore'.
  const child = spawnOpencode(['run', '/callimachus-heartbeat', '--agent', 'callimachus', '--deep']);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (obj: any) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { closed = true; }
      };
      const lineBuf: string[] = [];
      const onLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('{')) return;
        try { send(JSON.parse(trimmed)); } catch {}
      };
      child.stdout?.on('data', (chunk) => {
        lineBuf.push(...chunk.toString().split('\n'));
        while (lineBuf.length > 1) onLine(lineBuf.shift()!);
      });
      child.stderr?.on('data', (chunk) => {
        send({ type: 'log', msg: chunk.toString().trim() });
      });
      child.on('close', (code) => {
        if (lineBuf.length) onLine(lineBuf.shift()!);
        send({ type: 'exit', code });
        try { controller.close(); } catch {}
      });
      req.signal.addEventListener('abort', () => {
        closed = true;
        try { child.kill('SIGTERM'); } catch {}
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, msg: 'POST to this endpoint to start a brain compaction (SSE stream)' });
}
