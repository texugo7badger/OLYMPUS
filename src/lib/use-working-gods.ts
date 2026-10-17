/**
 * useWorkingGods — the ONE source of truth for "who is working right now"
 * (W0-A, v0.0.4). Derives the working-god set from the LIVE activity feed
 * (the same /api/olympus/episodes the Recent Activity panel and the brain
 * glow ride): any god with a live event in the last WORKING_WINDOW_MS is
 * working. Every surface that shows activity — the StatusBar strip, the
 * terminal header, the brain signals — consumes THIS hook, never its own
 * ad-hoc poll.
 *
 * Non-god rows (global/system) never count. A dead API degrades to "no one
 * working" — the hook never throws, never breaks a surface.
 *
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

import { useEffect, useState } from 'react';

const WORKING_WINDOW_MS = 3 * 60 * 1000;
const POLL_MS = 15_000;

const NON_GODS = new Set(['global', 'system', 'unknown', '']);

export function useWorkingGods(): string[] {
  const [working, setWorking] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const derive = async () => {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch('/api/olympus/episodes', { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(to);
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        const cutoff = Date.now() - WORKING_WINDOW_MS;
        const next = new Set<string>();
        for (const ep of (d?.episodes || []) as Array<{ source?: string; god?: string; ts?: string }>) {
          if (ep?.source !== 'live' || !ep.god || !ep.ts) continue;
          let t = 0;
          try { t = new Date(ep.ts).getTime(); } catch { continue; }
          if (Number.isFinite(t) && t >= cutoff && !NON_GODS.has(ep.god)) next.add(ep.god);
        }
        if (cancelled) return;
        const arr = [...next];
        setWorking(prev =>
          prev.length === arr.length && prev.every((g, i) => g === arr[i]) ? prev : arr,
        );
      } catch { /* decorative — a dead API means idle, never an error surface */ }
    };
    derive();
    const iv = setInterval(derive, POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return working;
}
