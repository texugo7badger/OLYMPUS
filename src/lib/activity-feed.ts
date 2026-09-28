/**
 * Activity Feed — append-only JSONL event log for god activity.
 *
 * This is the "work in progress" display backbone (Approach 1 from the
 * architecture discussion). When the OpenCode TUI runs in a CustomFrame and
 * does heavy lifting, its agents append events to
 * `06_Activity_Feed/live.jsonl` in the vault. The Olympus terminal watches
 * this file and renders a simplified god-activity panel. v3.0 VaultBrain
 * ALSO tails this file from the tool.execute.after hook (capture), the
 * Callimachus's RECALIBRATE stage (confidence aggregation), and the brain-stats
 * API (per-god learning metrics).
 *
 * DESIGN PRINCIPLES:
 *   - Append-only: never modify or delete existing lines (durable audit log).
 *   - JSONL: one JSON object per line, easy to tail + parse.
 *   - File-based: works with ANY TUI (they all can write files).
 *   - No real-time guarantees: 1-5 second polling delay is acceptable.
 *   - Survives crashes: the file is the source of truth, not memory.
 *   - v3.0: Pure JSONL (no markdown header) so it can be tailed efficiently.
 *
 * EVENT SCHEMA:
 *   {
 *     "ts": "2026-07-10T22:00:00.000Z",   // ISO timestamp
 *     "god": "apollo",                      // which god is acting
 *     "action": "delegation",              // what kind of action
 *     "msg": "Routing to Athena for API design",  // human-readable summary
 *     "project": "my-saas-app",            // optional: project slug
 *     "meta": { ... }                      // optional: structured data
 *   }
 *
 * ACTION TYPES:
 *   session_start            — a god started a work session
 *   session_end              — a god finished a work session
 *   delegation               — one god delegated to another
 *   tool_call                — a god called a tool (file edit, command, web search)
 *   todo                     — a god created/updated/completed a TODO item
 *   response                 — a god produced a response for the user
 *   error                    — a god encountered an error
 *   milestone                — a god reached a significant milestone
 *   dispatch       (v3.0)    — a god dispatched to an demigod (rich event)
 *   dispatch_outcome (v3.0)  — the dispatch finished with outcome + duration + tokens
 *   shortcircuit    (v3.0)   — a god short-circuited based on an instinct
 *   strategy_recommendation (v3.0) — Apollo suggests a strategy change based on brain maturity
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const VAULT = process.env.OLYMPUS_VAULT || path.join(os.homedir(), 'OLYMPUS-VAULT');
// v3.0: switched from live.md -> live.jsonl to align with the overlay plugin,
// the seed-vault.py, and the brain-stats API. The file is pure JSONL now
// (no frontmatter/markdown header) so it can be tailed efficiently by the
// Callimachus and the brain-stats route.
export const ACTIVITY_FEED_PATH = path.join(VAULT, '06_Activity_Feed', 'live.jsonl');

export interface ActivityEvent {
  ts: string;
  god: string;
  action: string;
  msg: string;
  project?: string;
  meta?: Record<string, any>;
}

export const ACTIVITY_ACTIONS = [
  'session_start',
  'session_end',
  'delegation',
  'tool_call',
  'todo',
  'response',
  'error',
  'milestone',
] as const;

/**
 * Append an activity event to the feed.
 *
 * Called from:
 *   - opencode (the CLI that Olympus dispatches to)
 *   - demigods (via the dispatch protocol or a shell command)
 *   - Any TUI that can write to the vault
 *
 * Safe to call concurrently — appends are atomic on most filesystems for
 * writes < 4KB (PIPE_BUF on Linux). Each event is a single line, well
 * under that limit.
 */
export function appendActivity(event: Omit<ActivityEvent, 'ts'> & { ts?: string }): void {
  const fullEvent: ActivityEvent = {
    ts: event.ts || new Date().toISOString(),
    god: event.god,
    action: event.action,
    msg: event.msg,
    ...(event.project ? { project: event.project } : {}),
    ...(event.meta ? { meta: event.meta } : {}),
  };

  const dir = path.dirname(ACTIVITY_FEED_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // v3.0: live.jsonl is pure JSONL (no markdown header). Just append.
  const line = JSON.stringify(fullEvent) + '\n';
  fs.appendFileSync(ACTIVITY_FEED_PATH, line, 'utf-8');
}

/**
 * Read all activity events from the feed file.
 * Returns events in chronological order (oldest first).
 * Skips non-JSON lines (frontmatter, markdown, comments).
 */
export function readActivity(opts?: { since?: string; limit?: number; god?: string; project?: string }): ActivityEvent[] {
  if (!fs.existsSync(ACTIVITY_FEED_PATH)) return [];

  const content = fs.readFileSync(ACTIVITY_FEED_PATH, 'utf-8');
  const lines = content.split('\n');
  const events: ActivityEvent[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('{')) continue; // skip frontmatter + markdown
    try {
      const ev = JSON.parse(trimmed) as ActivityEvent;
      // Filter by since (ISO timestamp)
      if (opts?.since && ev.ts < opts.since) continue;
      // Filter by god
      if (opts?.god && ev.god !== opts.god) continue;
      // Filter by project
      if (opts?.project && ev.project !== opts.project) continue;
      events.push(ev);
    } catch {
      // skip malformed JSON lines
    }
  }

  // Apply limit (take the last N events)
  if (opts?.limit && events.length > opts.limit) {
    return events.slice(-opts.limit);
  }

  return events;
}

/**
 * Get the latest events since a given timestamp.
 * Useful for polling: client sends its last-seen ts, server returns only new events.
 */
export function getEventsSince(since: string, opts?: { god?: string; project?: string }): ActivityEvent[] {
  return readActivity({ since, ...opts });
}

/**
 * Get the most recent N events.
 */
export function getRecentEvents(limit: number = 50, opts?: { god?: string; project?: string }): ActivityEvent[] {
  return readActivity({ limit, ...opts });
}

/**
 * Watch the activity feed file for changes.
 * Returns a cleanup function that stops the watcher.
 *
 * Uses fs.watch() which is efficient (inotify on Linux, ReadDirectoryChangesW
 * on Windows, kqueue on macOS). The callback is debounced to avoid duplicate
 * fires (some platforms fire twice for a single append).
 *
 * @param callback Called with the new events whenever the file changes
 * @param lastTs   Only events after this timestamp are returned
 * @returns cleanup function
 */
export function watchActivity(
  callback: (events: ActivityEvent[]) => void,
  opts?: { lastTs?: string; god?: string; project?: string; debounceMs?: number }
): () => void {
  let lastTs = opts?.lastTs || '';
  let debounceTimer: NodeJS.Timeout | null = null;
  const debounceMs = opts?.debounceMs || 500;

  // Ensure file exists so fs.watch doesn't throw
  const dir = path.dirname(ACTIVITY_FEED_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(ACTIVITY_FEED_PATH)) {
    appendActivity({ god: 'system', action: 'session_start', msg: 'Activity feed initialized' });
  }

  let watcher: fs.FSWatcher | null = null;
  try {
    watcher = fs.watch(ACTIVITY_FEED_PATH, { persistent: false }, (eventType) => {
      if (eventType !== 'change') return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const newEvents = getEventsSince(lastTs, { god: opts?.god, project: opts?.project });
        if (newEvents.length > 0) {
          lastTs = newEvents[newEvents.length - 1].ts;
          callback(newEvents);
        }
      }, debounceMs);
    });
  } catch {
    // fs.watch may fail on some platforms; return a no-op cleanup
    return () => {};
  }

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (watcher) watcher.close();
  };
}

/**
 * Get a summary of activity grouped by god.
 * Returns a map of god → { count, lastAction, lastTs, actions: { [action]: count } }
 */
export function getActivitySummary(opts?: { since?: string; project?: string }): Record<string, {
  count: number;
  lastAction: string;
  lastTs: string;
  lastMsg: string;
  actions: Record<string, number>;
}> {
  const events = readActivity({ since: opts?.since, project: opts?.project });
  const summary: Record<string, {
    count: number;
    lastAction: string;
    lastTs: string;
    lastMsg: string;
    actions: Record<string, number>;
  }> = {};

  for (const ev of events) {
    if (!summary[ev.god]) {
      summary[ev.god] = { count: 0, lastAction: '', lastTs: '', lastMsg: '', actions: {} };
    }
    const s = summary[ev.god];
    s.count++;
    s.actions[ev.action] = (s.actions[ev.action] || 0) + 1;
    if (ev.ts > s.lastTs) {
      s.lastTs = ev.ts;
      s.lastAction = ev.action;
      s.lastMsg = ev.msg;
    }
  }

  return summary;
}

/**
 * Clear the activity feed (for testing or reset).
 * v3.0: truncates the file to empty (pure JSONL — no header to preserve).
 */
export function clearActivity(): void {
  fs.writeFileSync(ACTIVITY_FEED_PATH, '', 'utf-8');
}
