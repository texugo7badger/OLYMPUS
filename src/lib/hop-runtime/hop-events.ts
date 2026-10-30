/**
 * hop-events.ts — THE SINGLE HOP STREAM (v0.0.24, #227).
 *
 * One append-only JSONL + one SSE route feed every live surface:
 *   - the God Intelligence "In flight" panel;
 *   - the terminal's hop strip;
 *   - the activity timeline's campaign view.
 *
 * The file is process-safe (the walker may run in a different worker than
 * the route that serves the SSE), bounded (rotation at 2 MB) and replayable
 * (`since` cursor / Last-Event-ID).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type HopLiveType =
  | 'campaign_start'
  | 'hop_start'
  | 'hop_heartbeat'
  | 'hop_verify'
  | 'hop_done'
  | 'hop_parked'
  | 'campaign_end';

export interface HopLiveEvent {
  type: HopLiveType;
  campaignId: string | null;
  project?: string | null;
  lane?: string | null;
  hop?: string | null;
  god?: string | null;
  artifacts?: string[] | null;
  skill?: string | null;
  mcp?: string | null;
  demigod?: string | null;
  transport?: 'warm' | 'spawn' | null;
  elapsedMs?: number | null;
  durationMs?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  reason?: string | null;
  error?: string | null;
  total?: number | null;
  completed?: number | null;
  ts: string;
}

const MAX_BYTES = 2 * 1024 * 1024;
let lastTs = 0;

/** Monotonic ISO timestamp: two events in the same millisecond stay ordered. */
function nextTs(): string {
  const now = Date.now();
  lastTs = now <= lastTs ? lastTs + 1 : now;
  return new Date(lastTs).toISOString();
}
const KEEP_LINES = 500;

export function hopEventsPath(): string {
  const home = process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
  return path.join(home, 'hop-events.jsonl');
}

function rotateIfNeeded(file: string): void {
  try {
    const st = fs.statSync(file);
    if (st.size <= MAX_BYTES) return;
    fs.renameSync(file, `${file}.1`);
  } catch { /* absent or unwritable */ }
}

/** Append one event. Never throws — the walk never dies on telemetry. */
export function publishHopEvent(ev: Omit<HopLiveEvent, 'ts'> & { ts?: string }): void {
  try {
    const file = hopEventsPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotateIfNeeded(file);
    const row: HopLiveEvent = { ...ev, ts: ev.ts ?? nextTs() };
    fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf-8');
  } catch { /* telemetry is best-effort */ }
}

export interface HopEventsPage {
  events: HopLiveEvent[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Read events, newest last, with a `since` ISO cursor. The file is bounded
 * by rotation; this reads at most the last KEEP_LINES lines for a snapshot.
 */
export function readHopEvents(opts: { since?: string | null; limit?: number } = {}): HopEventsPage {
  const file = hopEventsPath();
  let lines: string[] = [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    lines = raw.split('\n').filter(Boolean).slice(-KEEP_LINES);
  } catch { return { events: [], total: 0, hasMore: false, nextCursor: null }; }

  let events: HopLiveEvent[] = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch { /* skip */ }
  }
  events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  const total = events.length;
  if (opts.since) {
    const since = new Date(opts.since).getTime();
    if (Number.isFinite(since)) events = events.filter((e) => new Date(e.ts).getTime() > since);
  }
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 500));
  const hasMore = events.length > limit;
  const page = events.slice(-limit);
  return {
    events: page,
    total,
    hasMore,
    nextCursor: page.length ? page[0].ts : null,
  };
}
