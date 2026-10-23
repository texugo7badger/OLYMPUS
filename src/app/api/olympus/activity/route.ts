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

// #196: poll cadence — the normal 1.5s tail, dropped to 10s while both
// telemetry files are missing (nothing to tail; stop hammering stat).
const POLL_ACTIVE_MS = 1500;
const POLL_MISSING_MS = 10_000;

const fsp = fs.promises;

/**
 * SSE stream of real Olympus activity events.
 * Reads from ~/.olympus/metrics/ (brain.jsonl + activity.jsonl).
 * On connect, replays the last 50 events, then tails the files.
 * #196: all tail IO is fs.promises (was statSync/readSync inside a
 * setInterval on the main thread); when the target files are missing
 * the poll drops to 10s until one appears.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  // Read recent events from real telemetry files (async reads).
  const recentEvents: any[] = [];
  for (const file of [ACTIVITY_FILE, BRAIN_FILE]) {
    try {
      const raw = await fsp.readFile(file, 'utf-8');
      const lines = raw.split('\n').filter(Boolean).slice(-50);
      for (const line of lines) {
        try { recentEvents.push(JSON.parse(line)); } catch {}
      }
    } catch {}
  }
  recentEvents.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  // Seed the tail offsets + whether any target file exists right now.
  const fileSizes: Record<string, number> = {};
  let anyExists = false;
  for (const f of [ACTIVITY_FILE, BRAIN_FILE]) {
    try {
      fileSizes[f] = (await fsp.stat(f)).size;
      anyExists = true;
    } catch {
      fileSizes[f] = 0;
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
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

      // Tail files for new events. Self-rescheduling async poll: the next
      // tick is only armed after the current one finishes (no overlap),
      // and its delay follows file existence (1.5s active / 10s missing).
      const poll = async () => {
        if (closed) return;
        let existsNow = false;
        for (const file of [ACTIVITY_FILE, BRAIN_FILE]) {
          try {
            const stat = await fsp.stat(file);
            existsNow = true;
            if (stat.size < (fileSizes[file] ?? 0)) {
              fileSizes[file] = 0; // file was truncated/rotated
            }
            if (stat.size > (fileSizes[file] ?? 0)) {
              const fh = await fsp.open(file, 'r');
              try {
                const buf = Buffer.alloc(stat.size - (fileSizes[file] ?? 0));
                await fh.read(buf, 0, buf.length, fileSizes[file] ?? 0);
                fileSizes[file] = stat.size;
                for (const line of buf.toString('utf-8').split('\n')) {
                  if (!line.trim()) continue;
                  try { send(JSON.parse(line)); } catch {}
                }
              } finally {
                await fh.close();
              }
            }
          } catch {}
        }
        if (!closed) pollTimer = setTimeout(poll, existsNow ? POLL_ACTIVE_MS : POLL_MISSING_MS);
      };
      pollTimer = setTimeout(poll, anyExists ? POLL_ACTIVE_MS : POLL_MISSING_MS);

      // Heartbeat every 30s (keeps connection alive — NO fake events)
      let tick = 0;
      const heartbeat = setInterval(() => {
        if (closed) return;
        tick++;
        send({ type: 'heartbeat', ts: new Date().toISOString(), tick });
      }, 30000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        if (pollTimer) clearTimeout(pollTimer);
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
