/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METRICS_DIR = path.join(os.homedir(), '.olympus', 'metrics');
const BRAIN_FILE = path.join(METRICS_DIR, 'brain.jsonl');
const ACTIVITY_FILE = path.join(METRICS_DIR, 'activity.jsonl');

/**
 * SSE stream of real Olympus activity events.
 * Reads from ~/.olympus/metrics/ (brain.jsonl + activity.jsonl).
 * On connect, replays the last 50 events, then tails the files every 1.5s.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  // Read recent events from real telemetry files
  const recentEvents: any[] = [];
  for (const file of [ACTIVITY_FILE, BRAIN_FILE]) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, 'utf-8');
      const lines = raw.split('\n').filter(Boolean).slice(-50);
      for (const line of lines) {
        try { recentEvents.push(JSON.parse(line)); } catch {}
      }
    } catch {}
  }
  recentEvents.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (obj: any) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { closed = true; }
      };

      // Initial info event — this is the ONLY event sent without real data
      send({ type: 'info', msg: 'Olympus SSE stream connected — waiting for real dispatches', ts: new Date().toISOString() });

      // Replay recent real events (empty array = no replay)
      for (const ev of recentEvents) {
        send(ev);
      }

      // Tail files for new events (poll every 1.5s)
      const fileSizes: Record<string, number> = {};
      for (const f of [ACTIVITY_FILE, BRAIN_FILE]) {
        try { fileSizes[f] = fs.existsSync(f) ? fs.statSync(f).size : 0; } catch { fileSizes[f] = 0; }
      }

      const interval = setInterval(() => {
        if (closed) return;
        for (const file of [ACTIVITY_FILE, BRAIN_FILE]) {
          try {
            if (!fs.existsSync(file)) continue;
            const stat = fs.statSync(file);
            if (stat.size < fileSizes[file]) {
              fileSizes[file] = 0; // file was truncated/rotated
            }
            if (stat.size > fileSizes[file]) {
              const fd = fs.openSync(file, 'r');
              const buf = Buffer.alloc(stat.size - fileSizes[file]);
              fs.readSync(fd, buf, 0, buf.length, fileSizes[file]);
              fs.closeSync(fd);
              fileSizes[file] = stat.size;
              for (const line of buf.toString('utf-8').split('\n')) {
                if (!line.trim()) continue;
                try { send(JSON.parse(line)); } catch {}
              }
            }
          } catch {}
        }
      }, 1500);

      // Heartbeat every 30s (keeps connection alive — NO fake events)
      let tick = 0;
      const heartbeat = setInterval(() => {
        if (closed) return;
        tick++;
        send({ type: 'heartbeat', ts: new Date().toISOString(), tick });
      }, 30000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        clearInterval(heartbeat);
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
