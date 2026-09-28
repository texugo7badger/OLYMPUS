/**
 * ContextIndicator — a compact context-window usage indicator for the
 * Olympus Interactive Terminal header.
 *
 * Polls `/api/olympus/context-usage` every 5s and shows:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ ctx 42% ▓▓▓▓░░░░  [new session]                          │
 *   └──────────────────────────────────────────────────────────┘
 *
 * The percentage + bar are colored by `quality`:
 *   - good     → olympus green  (#7BAE8E)
 *   - warning  → olympus gold   (#D4A574)
 *   - critical → olympus red    (#C4756A)
 *
 * When `quality` is 'warning' or 'critical', a "new session" button
 * appears. Clicking it POSTs `{ action: 'new-session', text: <summary> }`
 * to `/api/olympus/action` and streams the response back through the
 * parent via the `onEvent` callback — so the user sees Apollo pick up
 * the thread in the existing chat, with a fresh context window.
 *
 * The summary is provided by the parent (which owns the message list)
 * via the `getSummary` prop — this keeps the ContextIndicator decoupled
 * from the chat's message type.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import OlympusTooltip from './olympus-tooltip';

export interface ContextUsage {
  used: number;
  limit: number;
  percentage: number;
  quality: 'good' | 'warning' | 'critical';
  sessionId?: string;
  model?: string;
}

export interface ContextIndicatorProps {
  /**
   * Returns a summary of the current conversation (last 5-10 messages)
   * to pass to Apollo when starting a new session. The parent owns the
   * message list — we don't reach into it directly to avoid coupling.
   *
   * If not provided, the "new session" button sends an empty summary
   * (Apollo just starts fresh).
   */
  getSummary?: () => string;
  /**
   * Returns the current conversationId (the parent rotates it when a new
   * session starts). The server maps it to a warm opencode session, so the
   * new session gets a FRESH opencode session (clean context) while the
   * rest of the conversation keeps reusing its warm one.
   */
  getConversationId?: () => string;
  /**
   * Called once before the new-session POST is made. The parent can use
   * this to set `submitting=true`, push a "Starting new session..." system
   * message, etc.
   */
  onStart?: () => void;
  /**
   * Called for each SSE event from the new-session stream. The parent's
   * `handleServerEvent` is the canonical handler — pass it through here
   * so the new session's response renders in the existing chat.
   */
  onEvent?: (ev: any) => void;
  /**
   * Called when the new-session stream ends (success or failure). The
   * `code` matches the SSE `action_done` event's `code` field (0 = OK,
   * -1 = error/abort).
   */
  onDone?: (code: number) => void;
}

const POLL_MS = 5000;
// After starting a new session, poll again after this delay. The new
// session file takes a moment to be created on disk — polling immediately
// would show the OLD (full) context window.
const REFETCH_AFTER_NEW_SESSION_MS = 2500;

const QUALITY_COLOR: Record<ContextUsage['quality'], string> = {
  good: '#7BAE8E',     // olympus-green
  warning: '#D4A574',  // olympus-gold
  critical: '#C4756A', // olympus-red
};

// Progress-bar width (in monospace characters).
const BAR_WIDTH = 8;

export default function ContextIndicator({
  getSummary,
  getConversationId,
  onStart,
  onEvent,
  onDone,
}: ContextIndicatorProps) {
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  // `showBtn` is tracked separately from `usage.quality` so the button
  // doesn't flash on/off while a fetch is in-flight — we keep it shown
  // until we get a definitive 'good' reading back.
  const [showBtn, setShowBtn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Avoid refetching on every render — track the last fetch time.
  const lastFetchRef = useRef(0);
  // The parent passes `getConversationId` as an inline arrow (new identity
  // per render). Hold it in a ref so `poll` keeps a stable identity and the
  // 5s polling interval isn't torn down/recreated on every chat message.
  const getConversationIdRef = useRef(getConversationId);
  getConversationIdRef.current = getConversationId;
  // Tracks the last conversationId this indicator polled for. When the
  // parent rotates it (terminal reset / new session), we clear the displayed
  // usage immediately instead of letting the old % linger until the next
  // poll returns the fresh (zero) reading.
  const lastConvIdRef = useRef<string | null>(null);

  const poll = useCallback(async () => {
    // Throttle: don't fetch more than once per 2s even if multiple
    // effects fire. The interval handles the steady-state 5s cadence;
    // this guard prevents a burst of calls if the user clicks "new
    // session" rapidly.
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;

    try {
      const convId = getConversationIdRef.current?.() ?? '';
      const res = await fetch(`/api/olympus/context-usage${convId ? `?conversationId=${encodeURIComponent(convId)}` : ''}`, { cache: 'no-store' });
      if (!res.ok) { setFetchError(true); return; }
      const d: ContextUsage = await res.json();
      setUsage(d);
      setShowBtn(d.quality === 'warning' || d.quality === 'critical');
      setFetchError(false);
    } catch {
      // Silent failure — the indicator just stays at the last known
      // value. We don't want a flaky network to spam the UI with errors.
      setFetchError(true);
    }
  }, []);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => clearInterval(iv);
  }, [poll]);

  // When the parent rotates the conversationId (terminal reset / new
  // session), clear the displayed usage immediately so the bar resets to
  // 0% instead of lingering on the previous conversation's reading until
  // the next poll (≤5s). The server now returns zeros for unmapped ids,
  // so the follow-up poll confirms the cleared state with fresh data.
  const convIdNow = getConversationIdRef.current?.() ?? '';
  useEffect(() => {
    if (lastConvIdRef.current !== null && lastConvIdRef.current !== convIdNow) {
      setUsage(null);
      setShowBtn(false);
      setFetchError(false);
      lastFetchRef.current = 0; // bypass the 2s throttle
      poll();
    }
    lastConvIdRef.current = convIdNow;
  }, [convIdNow, poll]);

  // Abort any in-flight new-session request on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startNewSession = useCallback(async () => {
    if (starting) return;
    const summary = getSummary?.() ?? '';
    const controller = new AbortController();
    abortRef.current = controller;
    setStarting(true);
    onStart?.();

    try {
      const res = await fetch('/api/olympus/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'new-session', text: summary, conversationId: getConversationId?.() ?? '' }),
        signal: controller.signal,
      });
      if (!res.body) {
        onEvent?.({ type: 'error', msg: 'No response stream returned.', ts: new Date().toISOString() });
        onDone?.(-1);
        return;
      }

      // Read the SSE stream — same pattern as the InteractiveTerminal's
      // submit() function. Each `data: <json>\n\n` chunk is parsed and
      // forwarded to the parent via `onEvent`.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let finalCode = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            onEvent?.(ev);
            if (ev.type === 'action_done') {
              finalCode = typeof ev.code === 'number' ? ev.code : 0;
            }
          } catch {
            // Non-JSON chunk — ignore. opencode occasionally emits
            // non-JSON lines (e.g. progress indicators) that we can't
            // meaningfully surface.
          }
        }
      }
      onDone?.(finalCode);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // User cancelled (component unmounted). Don't call onDone —
        // the parent is already tearing down.
        return;
      }
      onEvent?.({
        type: 'error',
        msg: `New session failed: ${e?.message || 'unknown error'}`,
        ts: new Date().toISOString(),
      });
      onDone?.(-1);
    } finally {
      setStarting(false);
      abortRef.current = null;
      // Give the new session file a moment to land on disk, then
      // refresh so the indicator shows the fresh (low) usage.
      setTimeout(() => {
        lastFetchRef.current = 0; // bypass the throttle
        poll();
      }, REFETCH_AFTER_NEW_SESSION_MS);
    }
  }, [starting, getSummary, getConversationId, onStart, onEvent, onDone, poll]);

  // ---- Render -----------------------------------------------------------
  // Color falls back to a dim gray when we have no data yet — the
  // indicator is present but unobtrusive, which is the desired behavior
  // before the first poll completes.
  const color = usage ? QUALITY_COLOR[usage.quality] : '#5A5A5A';
  const pct = usage?.percentage ?? 0;
  const filled = Math.min(BAR_WIDTH, Math.round((pct / 100) * BAR_WIDTH));
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);

  const tooltipContent = usage
    ? `Context window: ${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} tokens (${pct}%)` +
      (usage.model ? `\nModel: ${usage.model}` : '') +
      (usage.sessionId ? `\nSession: ${usage.sessionId.slice(0, 8)}` : '')
    : fetchError
      ? 'Context window: unable to read session (will retry)'
      : 'Context window: no active session';

  return (
    <div className="flex items-center gap-1 text-[9px] font-mono">
      <OlympusTooltip content={tooltipContent} side="bottom">
        <div
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded',
            'bg-olympus-bg/60 ring-1 ring-white/5',
            'transition-colors',
            // Subtle ring tint by quality so the indicator reads even at
            // a glance — but very faint so it doesn't shout.
            usage?.quality === 'warning' && 'ring-olympus-gold/20',
            usage?.quality === 'critical' && 'ring-olympus-red/30',
          )}
        >
          <span className="text-olympus-text-dim/70">ctx</span>
          <span
            className="tabular-nums font-semibold"
            style={{ color }}
            aria-label={`Context window ${pct}% used`}
          >
            {pct}%
          </span>
          {/* Monospace block bar — colored by quality, faint when empty. */}
          <span
            className="tabular text-[8px] leading-none select-none"
            style={{
              color,
              letterSpacing: '-0.5px',
              opacity: filled > 0 ? 0.9 : 0.35,
            }}
            aria-hidden="true"
          >
            {bar}
          </span>
        </div>
      </OlympusTooltip>

      {showBtn && (
        <OlympusTooltip
          content={
            pct > 85
              ? 'Context window critical — LLM quality may degrade. Start a new session: Apollo continues from a summary of this conversation.'
              : 'Context window filling up — start a new session to preserve quality. Apollo continues from a summary.'
          }
          side="bottom"
        >
          <button
            onClick={startNewSession}
            disabled={starting}
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono',
              'transition-all',
              'ring-1 ring-olympus-gold/30 bg-olympus-gold/10 hover:bg-olympus-gold/20',
              starting && 'opacity-70 cursor-wait',
            )}
            style={{ color: '#D4A574' }}
            aria-label="Start a new session — Apollo continues from a summary"
          >
            {starting ? (
              <Loader2 size={9} className="animate-spin" />
            ) : (
              <Zap size={9} />
            )}
            {starting ? 'starting' : 'new session'}
          </button>
        </OlympusTooltip>
      )}
    </div>
  );
}
