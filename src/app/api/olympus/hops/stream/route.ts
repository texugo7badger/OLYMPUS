/**
 * GET /api/olympus/hops/stream — the single SSE lane for live hops (#227).
 *
 * Replays from `Last-Event-ID` / `?since=`, then tails the JSONL every
 * 800ms. Heartbeat every 15s keeps proxies and EventSource alive. The file
 * is the source of truth, so a reconnect never loses the chain.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest } from 'next/server';
import { readHopEvents } from '@/lib/hop-runtime/hop-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get('since') || req.headers.get('last-event-id') || null;
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let cursor = since;
      let tick: ReturnType<typeof setInterval> | null = null;
      let beat: ReturnType<typeof setInterval> | null = null;

      const send = (data: unknown, id?: string) => {
        if (closed) return;
        try {
          const idLine = id ? `id: ${id}\n` : '';
          controller.enqueue(encoder.encode(`${idLine}data: ${JSON.stringify(data)}\n\n`));
        } catch { closed = true; }
      };

      cleanup = () => {
        if (closed) return;
        closed = true;
        if (tick) clearInterval(tick);
        if (beat) clearInterval(beat);
        try { controller.close(); } catch { /* already closed */ }
      };

      // Replay.
      const replay = readHopEvents({ since: cursor, limit: 500 });
      for (const ev of replay.events) send(ev, ev.ts);
      if (replay.events.length) cursor = replay.events[replay.events.length - 1].ts;
      send({ type: 'stream_ready', serverTime: new Date().toISOString(), replayed: replay.events.length });

      tick = setInterval(() => {
        if (closed) return;
        const page = readHopEvents({ since: cursor, limit: 200 });
        for (const ev of page.events) {
          send(ev, ev.ts);
          cursor = ev.ts;
        }
      }, 800);

      beat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`)); } catch { cleanup?.(); }
      }, 15_000);

      req.signal?.addEventListener?.('abort', () => cleanup?.(), { once: true });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
