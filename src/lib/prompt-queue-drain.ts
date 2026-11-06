/**
 * prompt-queue-drain.ts — v0.0.85 (backported to v0.0.84): the phone queue
 * drains while OLYMPUS hibernates.
 *
 * THE SPECIMEN (2026-11-06, ~21:00): the campaign parked while the user was
 * away. They tapped `investigar` in the phone widget; the item landed in the
 * shared queue, but the ONLY drainer lived in the terminal renderer — and
 * hibernate destroys that renderer. The prompt sat there until the user woke
 * OLYMPUS. A remote control that needs the remote to be awake is not remote.
 *
 * This server-side drainer runs while `~/.olympus/hibernation.json` says the
 * window is gone. It takes phone items (high-priority investigations and
 * phone chat), pins the active project, calls the normal action route on the
 * warm session, and writes the answer back to the same notification feed the
 * PC and the phone already read. It never runs while the app is awake — the
 * terminal's own queue drain owns that case (one sender, no duplicates).
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isHibernating } from './hibernation';
import { listQueue, markQueueItem } from './prompt-queue';
import { appendDesktopNotify, notifyText, readLanguage } from './desktop-notify';

const GLOBAL_KEY = Symbol.for('olympus.prompt-queue-drain');
const RETRY_BACKOFF_MS = 2 * 60_000;
const DISPATCH_TIMEOUT_MS = 10 * 60_000;

interface DrainState {
  timer: ReturnType<typeof setInterval> | null;
  inFlight: boolean;
  retryAt: Map<string, number>;
}

function state(): DrainState {
  const global = globalThis as unknown as Record<symbol, DrainState>;
  global[GLOBAL_KEY] ??= { timer: null, inFlight: false, retryAt: new Map() };
  return global[GLOBAL_KEY];
}

function home(): string {
  return process.env.OLYMPUS_HOME || path.join(os.homedir(), '.olympus');
}

function readToken(): string {
  try { return fs.readFileSync(path.join(home(), 'session-token'), 'utf-8').trim(); } catch { return ''; }
}

function activeSlug(): string {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(home(), 'active-project.json'), 'utf-8'));
    return typeof raw?.slug === 'string' ? raw.slug : '';
  } catch { return ''; }
}

/** The most recently used conversation — the terminal's current lane, if any. */
function latestConversationId(): string | null {
  try {
    const map = JSON.parse(fs.readFileSync(path.join(home(), 'opencode-sessions.json'), 'utf-8'));
    const entries = Object.entries(map || {})
      .filter(([, value]: any) => value && typeof value.sessionId === 'string')
      .sort((a: any, b: any) => String(b[1].lastUsedAt || '').localeCompare(String(a[1].lastUsedAt || '')));
    return entries.length > 0 ? String(entries[0][0]) : null;
  } catch { return null; }
}

/** The last human-readable message in the action route's SSE stream. */
function answerFromStream(stream: string): string {
  let answer = '';
  for (const frame of String(stream || '').split('\n\n')) {
    const line = frame.split('\n').find((entry) => entry.startsWith('data: '));
    if (!line) continue;
    try {
      const event = JSON.parse(line.slice(6));
      const message = event?.msg || event?.text || (event?.part?.text ? String(event.part.text) : '');
      if (message) answer = String(message).replace(/\s+/g, ' ').trim().slice(0, 500);
    } catch { /* keep reading */ }
  }
  return answer;
}

export interface DrainResult {
  dispatched: number;
  skipped: string;
  itemId?: string;
}

/**
 * One drain pass. Exported for the suite; the interval below is the runtime.
 * `opts` exists so the suite can inject a fetch and never touch the network.
 */
export async function drainPhoneQueueOnce(opts: {
  baseUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  now?: number;
} = {}): Promise<DrainResult> {
  if (!isHibernating()) return { dispatched: 0, skipped: 'not-hibernating' };
  const drain = state();
  if (drain.inFlight) return { dispatched: 0, skipped: 'in-flight' };

  const items = listQueue().filter((item) => item.status === 'queued' && item.source === 'phone');
  if (items.length === 0) return { dispatched: 0, skipped: 'empty' };
  const item = items[0];
  const now = opts.now ?? Date.now();
  if (now < (drain.retryAt.get(item.id) ?? 0)) return { dispatched: 0, skipped: 'backoff', itemId: item.id };

  const project = item.project && item.project !== 'unknown' ? item.project : (activeSlug() || item.project || 'olympus');
  const base = opts.baseUrl || `http://127.0.0.1:${process.env.PORT || process.env.OLYMPUS_PORT || 3737}`;
  const token = opts.token ?? readToken();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const lang = readLanguage();
  const conversationId = latestConversationId() || `phone-${project}`;

  // Claim BEFORE the POST so the woken terminal renderer cannot post the same
  // item between our read and our dispatch.
  markQueueItem(item.id, 'sending', now);
  drain.inFlight = true;
  appendDesktopNotify({
    type: 'walk',
    title: notifyText(lang, 'phone.title'),
    body: notifyText(lang, 'phone.body', { project, detail: item.text.slice(0, 180) }),
    hop: item.id,
    slug: project,
    status: 'sending',
  });

  try {
    const response = await fetchImpl(`${base}/api/olympus/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-olympus-token': token } : {}),
      },
      body: JSON.stringify({
        action: 'prompt',
        // The pin is the same contract the compaction fix uses: the phone's
        // investigation continues the project it was queued from.
        text: `[OLYMPUS-PROJECT ${project}]\n${item.text}`,
        conversationId,
      }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    const stream = await response.text();
    const failed = !response.ok || /"type"\s*:\s*"error"|"code"\s*:\s*-1/.test(stream);
    if (failed) {
      markQueueItem(item.id, 'queued', now);
      drain.retryAt.set(item.id, now + RETRY_BACKOFF_MS);
      appendDesktopNotify({
        type: 'error',
        title: notifyText(lang, 'phoneFail.title'),
        body: notifyText(lang, 'phoneFail.body', { reason: `HTTP ${response.status}` }),
        hop: item.id,
        slug: project,
        status: 'failed',
      });
      return { dispatched: 0, skipped: 'failed', itemId: item.id };
    }
    markQueueItem(item.id, 'sent', now);
    drain.retryAt.delete(item.id);
    const answer = answerFromStream(stream);
    appendDesktopNotify({
      type: 'ready',
      title: notifyText(lang, 'phoneDone.title'),
      body: notifyText(lang, 'phoneDone.body', { answer: answer || item.text.slice(0, 240) }),
      hop: item.id,
      slug: project,
      status: 'completed',
    });
    return { dispatched: 1, skipped: '', itemId: item.id };
  } catch (error: any) {
    markQueueItem(item.id, 'queued', now);
    drain.retryAt.set(item.id, now + RETRY_BACKOFF_MS);
    appendDesktopNotify({
      type: 'error',
      title: notifyText(lang, 'phoneFail.title'),
      body: notifyText(lang, 'phoneFail.body', { reason: String(error?.message || error).slice(0, 200) }),
      hop: item.id,
      slug: project,
      status: 'failed',
    });
    return { dispatched: 0, skipped: 'error', itemId: item.id };
  } finally {
    drain.inFlight = false;
  }
}

/** Start the 15s hibernation drain once per Next process. */
export function ensurePromptQueueDrain(intervalMs = 15_000): void {
  const drain = state();
  if (drain.timer) return;
  drain.timer = setInterval(() => { void drainPhoneQueueOnce(); }, intervalMs);
  drain.timer.unref?.();
  // A short first pass: the user just tapped "investigar" and expects motion.
  const first = setTimeout(() => { void drainPhoneQueueOnce(); }, 1_500);
  first.unref?.();
}
