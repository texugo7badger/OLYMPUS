'use client';

/**
 * hop-stream.ts — v0.0.99: the hop SSE feed without the replay trap.
 *
 * `/api/olympus/hops/stream` replays its recent history on every connect (the
 * source of truth is the JSONL, so a reconnect never loses the chain). A
 * preview that reloads on every replayed `hop_done` therefore reloaded on
 * every mount, every reconnect and every proxy hiccup — the "updates happen
 * constantly" specimen. The route sends `stream_ready` AFTER the replay; this
 * hook ignores everything before it and only then starts forwarding live
 * `hop_done` events.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

import { useEffect, useRef, useState } from 'react';

export interface HopPartsFeed {
  /** True once the replay is over and live events are flowing. */
  ready: boolean;
  /** The event stream dropped; the browser will reconnect. */
  reconnecting: boolean;
}

export function useHopParts(opts: {
  projectSlug?: string | null;
  enabled?: boolean;
  onHopDone: (hop: string, project: string | null) => void;
}): HopPartsFeed {
  const { projectSlug = null, enabled = true } = opts;
  const onHopDoneRef = useRef(opts.onHopDone);
  const [ready, setReady] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => { onHopDoneRef.current = opts.onHopDone; }, [opts.onHopDone]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let live = false;
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/olympus/hops/stream');
      es.onopen = () => {
        // A fresh connection starts with the replay again; stay closed until
        // the server says the replay is done.
        live = false;
        setReconnecting(false);
      };
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev?.type === 'stream_ready') {
            live = true;
            setReady(true);
            setReconnecting(false);
            return;
          }
          if (!live) return; // replay: history, not a new delivery
          if (ev?.type !== 'hop_done') return;
          const project = ev?.project ? String(ev.project) : null;
          if (projectSlug && project && project !== projectSlug) return;
          onHopDoneRef.current(String(ev?.hop || 'part'), project);
        } catch { /* torn frame */ }
      };
      es.onerror = () => {
        live = false;
        setReconnecting(true);
      };
    } catch { /* no stream: the preview stays interactive */ }
    return () => {
      try { es?.close(); } catch { /* already gone */ }
      setReady(false);
      setReconnecting(false);
    };
  }, [enabled, projectSlug]);

  return { ready, reconnecting };
}
